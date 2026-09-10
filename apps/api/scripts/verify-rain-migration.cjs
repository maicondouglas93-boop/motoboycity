/**
 * Validação isolada da migration e do service real de taxas.
 * Requer Docker aberto + build atual da API. Não usa .env para escolher destino.
 * Cria PostgreSQL efêmero próprio, sem volumes do projeto, e remove ao terminar.
 */
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { setTimeout: delay } = require('node:timers/promises');
const { isolatedSchema, TEST_DATABASE } = require('./rain-migration-target.cjs');

const apiDir = path.resolve(__dirname, '..');
const migrationName = '20260910160000_surcharge_rain_admin_control';
const migrationRoot = path.join(apiDir, 'prisma', 'migrations');
const containerName = `motoboycity-rain-check-${randomUUID().slice(0, 8)}`;
const dbName = TEST_DATABASE;
const label = 'com.motoboycity.validation=rain-migration';
let containerId;
let temporaryDir;
let prisma;

function command(binary, args, options = {}) {
  const result = spawnSync(binary, args, { encoding: 'utf8', timeout: 90_000, ...options });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(`${binary} falhou (${result.status}): ${result.stderr || result.stdout}`);
  return result.stdout.trim();
}

async function run() {
  // Imagem já local; não inicia Compose nem acessa containers/bancos existentes.
  command('docker', ['image', 'inspect', 'postgres:17-alpine', '--format', '{{.Id}}']);
  containerId = command('docker', [
    'run',
    '--detach',
    '--rm',
    '--pull=never',
    '--name',
    containerName,
    '--label',
    label,
    '--publish',
    '127.0.0.1::5432',
    '--env',
    'POSTGRES_HOST_AUTH_METHOD=trust',
    '--env',
    `POSTGRES_DB=${dbName}`,
    'postgres:17-alpine',
  ]);
  const bindings = JSON.parse(
    command('docker', ['inspect', '--format', '{{json .NetworkSettings.Ports}}', containerId]),
  );
  const [binding] = bindings['5432/tcp'];
  assert.equal(binding.HostIp, '127.0.0.1');
  assert.match(binding.HostPort, /^\d+$/);
  const dbUrl = `postgresql://postgres@127.0.0.1:${binding.HostPort}/${dbName}?schema=public`;
  // Configura as DUAS variáveis antes de importar classes da aplicação.
  process.env.DATABASE_URL = dbUrl;
  process.env.DIRECT_URL = dbUrl;
  const { PrismaClient } = require('@prisma/client');
  console.log('PostgreSQL temporário próprio iniciado, exposto somente em 127.0.0.1.');

  let ready = false;
  for (let attempt = 0; attempt < 30; attempt++) {
    const result = spawnSync(
      'docker',
      ['exec', containerId, 'pg_isready', '-U', 'postgres', '-d', dbName],
      { encoding: 'utf8', timeout: 5000 },
    );
    if (result.status === 0) {
      ready = true;
      break;
    }
    await delay(500);
  }
  assert.equal(ready, true, 'PostgreSQL temporário não ficou pronto');

  prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
  const [target] = await prisma.$queryRaw`SELECT current_database() AS name`;
  assert.equal(target.name, dbName);
  const [cluster] =
    await prisma.$queryRaw`SELECT system_identifier::text AS id FROM pg_control_system()`;
  const containerCluster = command('docker', [
    'exec',
    containerId,
    'psql',
    '-U',
    'postgres',
    '-d',
    dbName,
    '-Atc',
    'SELECT system_identifier::text FROM pg_control_system()',
  ]);
  assert.equal(containerCluster, cluster.id, 'Prisma e Docker não apontam para o mesmo banco');
  console.log('Destino verificado por identidade: Prisma e Docker no mesmo banco temporário.');

  temporaryDir = fs.mkdtempSync(path.join(os.tmpdir(), 'motoboycity-rain-check-'));
  const schemaPath = path.join(temporaryDir, 'schema.prisma');
  const schema = fs.readFileSync(path.join(apiDir, 'prisma/schema.prisma'), 'utf8');
  const boundSchema = isolatedSchema(schema, dbUrl, binding.HostPort);
  fs.writeFileSync(schemaPath, boundSchema);
  fs.mkdirSync(path.join(temporaryDir, 'migrations'));
  fs.copyFileSync(
    path.join(migrationRoot, 'migration_lock.toml'),
    path.join(temporaryDir, 'migrations/migration_lock.toml'),
  );
  const previousMigrations = fs
    .readdirSync(migrationRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== migrationName)
    .map((entry) => entry.name)
    .sort();
  assert(
    previousMigrations.every((name) => name < migrationName),
    'Há migration posterior: reveja o baseline deste teste',
  );
  for (const name of previousMigrations) {
    fs.cpSync(path.join(migrationRoot, name), path.join(temporaryDir, 'migrations', name), {
      recursive: true,
    });
  }
  const prismaCli = require.resolve('prisma/build/index.js');
  const deploy = () => {
    assert.equal(fs.readFileSync(schemaPath, 'utf8'), boundSchema);
    const output = command(
      process.execPath,
      [prismaCli, 'migrate', 'deploy', '--schema', schemaPath],
      {
        cwd: temporaryDir,
        env: { ...process.env, DATABASE_URL: dbUrl, DIRECT_URL: dbUrl },
      },
    );
    assert(
      output.includes(dbName) && output.includes(`127.0.0.1:${binding.HostPort}`),
      'Prisma não confirmou o destino esperado',
    );
    return output;
  };
  deploy();
  console.log(
    `Baseline: ${previousMigrations.length} migrations anteriores aplicadas pelo Prisma.`,
  );

  const [baseline] =
    await prisma.$queryRaw`SELECT count(*)::int AS count FROM _prisma_migrations WHERE finished_at IS NOT NULL`;
  assert.equal(baseline.count, previousMigrations.length);
  const [absent] =
    await prisma.$queryRaw`SELECT count(*)::int AS count FROM information_schema.columns WHERE table_name = 'surcharges' AND column_name = 'automaticRainEnabled'`;
  assert.equal(absent.count, 0);

  const region = await prisma.region.create({ data: { name: 'Região fictícia de validação' } });
  const admin = await prisma.user.create({
    data: {
      type: 'ADMIN',
      name: 'Admin de teste',
      email: 'rain-check@example.test',
      phone: '00000000000',
      passwordHash: 'fixture-not-a-real-login',
    },
  });
  const rateId = randomUUID();
  const scheduledId = randomUUID();
  for (const [id, name, value, manual] of [
    [rateId, 'Chuva teste', 4.5, true],
    [scheduledId, 'Horário teste', 2.25, false],
  ]) {
    // Insere no schema ANTERIOR: o client gerado já conhece a nova coluna.
    await prisma.$executeRaw`INSERT INTO surcharges (id, "regionId", name, type, value, "driverSharePercentage", active, "manuallyActive", "createdAt", "updatedAt") VALUES (${id}, ${region.id}, ${name}, 'FIXED', ${value}, 80, true, ${manual}, NOW(), NOW())`;
  }
  await prisma.surchargeSchedule.create({
    data: { surchargeId: scheduledId, weekday: 5, startMinute: 1080, endMinute: 1380 },
  });
  const before = await prisma.$queryRaw`SELECT to_jsonb(s) AS row FROM surcharges s ORDER BY id`;
  const schedulesBefore = await prisma.surchargeSchedule.findMany();

  fs.cpSync(
    path.join(migrationRoot, migrationName),
    path.join(temporaryDir, 'migrations', migrationName),
    { recursive: true },
  );
  deploy();
  const after = await prisma.$queryRaw`SELECT to_jsonb(s) AS row FROM surcharges s ORDER BY id`;
  for (let index = 0; index < after.length; index++) {
    const { automaticRainEnabled, ...original } = after[index].row;
    assert.equal(automaticRainEnabled, false);
    assert.deepEqual(original, before[index].row);
  }
  assert.equal(after.length, before.length);
  assert.deepEqual(await prisma.surchargeSchedule.findMany(), schedulesBefore);
  assert.match(deploy(), /No pending migrations to apply/);
  const [column] =
    await prisma.$queryRaw`SELECT is_nullable, column_default, data_type FROM information_schema.columns WHERE table_name = 'surcharges' AND column_name = 'automaticRainEnabled'`;
  assert.deepEqual(column, { is_nullable: 'NO', column_default: 'false', data_type: 'boolean' });
  console.log(
    'PASS migration: valores, repasses, flags antigas, horários e timestamps preservados; default false; redeploy sem pendências.',
  );

  let wet = true;
  require('reflect-metadata');
  const { AdminSurchargesService } = require('../dist/admin/surcharges/admin-surcharges.service');
  const { AdminAuditService } = require('../dist/admin/audit/admin-audit.service');
  const weather = {
    forSurcharge: (id) =>
      id === rateId ? { activeNow: wet, status: wet ? 'RAINING' : 'DRY' } : null,
  };
  const service = new AdminSurchargesService(prisma, new AdminAuditService(prisma), weather);
  const enabled = await service.setRainAutomation(rateId, true, admin.id);
  assert.equal(enabled.automaticRainEnabled, true);
  assert.equal(enabled.manuallyActive, false);
  assert.equal(enabled.activeNow, true);
  const auditCount = () => prisma.administrativeAudit.count({ where: { entityId: rateId } });
  const initialAudits = await auditCount();
  await Promise.all(
    Array.from({ length: 6 }, () => service.setRainAutomation(rateId, true, admin.id)),
  );
  assert.equal(await auditCount(), initialAudits);
  wet = false;
  assert.equal((await service.list()).find((rate) => rate.id === rateId).activeNow, false);
  wet = true;
  await service.setActive(rateId, false, admin.id);
  assert.equal((await service.list()).find((rate) => rate.id === rateId).activeNow, false);
  assert.equal(
    (await prisma.surcharge.findUniqueOrThrow({ where: { id: rateId } })).automaticRainEnabled,
    true,
  );
  await service.setActive(rateId, true, admin.id);
  await service.setRainAutomation(rateId, false, admin.id);
  await service.setManuallyActive(rateId, true, admin.id);
  const manualAudits = await auditCount();
  await service.setRainAutomation(rateId, false, admin.id);
  assert.equal(await auditCount(), manualAudits);
  assert.equal(
    (await prisma.surcharge.findUniqueOrThrow({ where: { id: rateId } })).manuallyActive,
    true,
  );
  console.log(
    'PASS service real: modo persistido, clima separado, desativação geral e idempotência/auditoria.',
  );

  // Falha da auditoria deve desfazer também a troca de modo (FK real do Postgres).
  await assert.rejects(service.setRainAutomation(rateId, true, randomUUID()));
  assert.equal(
    (await prisma.surcharge.findUniqueOrThrow({ where: { id: rateId } })).automaticRainEnabled,
    false,
  );
  assert.equal(await auditCount(), manualAudits);
  for (let attempt = 0; attempt < 10; attempt++) {
    await service.setRainAutomation(rateId, false, admin.id);
    const results = await Promise.allSettled([
      service.setRainAutomation(rateId, true, admin.id),
      service.setManuallyActive(rateId, true, admin.id),
    ]);
    assert.equal(results[0].status, 'fulfilled');
    if (results[1].status === 'rejected') assert.equal(results[1].reason.getStatus(), 409);
    const state = await prisma.surcharge.findUniqueOrThrow({ where: { id: rateId } });
    assert.equal(state.automaticRainEnabled, true);
    assert.equal(state.manuallyActive, false);
  }
  console.log(
    'PASS transações reais: rollback em falha de auditoria e 10 disputas manual vs automático.',
  );

  await service.setActive(rateId, false, admin.id);
  await prisma.$disconnect();
  prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
  const persisted = await prisma.surcharge.findUniqueOrThrow({ where: { id: rateId } });
  assert.equal(persisted.active, false);
  assert.equal(persisted.automaticRainEnabled, true);
  assert.equal(Number(persisted.value), 4.5);
  assert.equal(Number(persisted.driverSharePercentage), 80);
  console.log('PASS reconexão: desativação e modo preservados; preço/repasse intactos.');
}

run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma?.$disconnect();
    if (containerId) {
      const own = command('docker', [
        'inspect',
        '--format',
        '{{index .Config.Labels "com.motoboycity.validation"}}',
        containerId,
      ]);
      assert.equal(own, 'rain-migration');
      command('docker', ['stop', '--time', '3', containerId]);
      console.log(
        'Container/banco temporário de teste removido; containers existentes não foram alterados.',
      );
    }
    if (temporaryDir) {
      const resolved = path.resolve(temporaryDir);
      assert.equal(path.dirname(resolved), path.resolve(os.tmpdir()));
      assert(path.basename(resolved).startsWith('motoboycity-rain-check-'));
      fs.rmSync(resolved, { recursive: true });
    }
  });
