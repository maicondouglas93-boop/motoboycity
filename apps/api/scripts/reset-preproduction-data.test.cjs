'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  CONFIRMATION_TEXT,
  assertDatabaseExecutionGuards,
  assertRedisExecutionGuards,
  databaseTarget,
  executeRedisReset,
  parseArgs,
  redisConnectionOptions,
  redisSnapshot,
  redisSnapshotFingerprint,
  redisTargetIdentity,
  snapshotFingerprint,
  stableStringify,
} = require('./reset-preproduction-data.cjs');

function createRedisHarness({ addActiveJobOnPause = false } = {}) {
  const keys = new Set([
    'motoboycity:driver-presence:active',
    'motoboycity:driver-presence:driver-1',
    'motoboycity:driver-dispatch-order',
  ]);
  let jobs = [
    {
      state: 'wait',
      id: 'job-1',
      name: 'expire-offer',
      timestamp: 1,
      delay: 0,
      processedOn: null,
      finishedOn: null,
      attemptsMade: 0,
    },
  ];
  let paused = false;
  let resumeCalls = 0;
  let obliterateArgs;

  const redis = {
    async scan() {
      return ['0', [...keys].filter((key) => key.startsWith('motoboycity:driver-presence:'))];
    },
    async exists(key) {
      return keys.has(key) ? 1 : 0;
    },
    async del(...removedKeys) {
      for (const key of removedKeys) keys.delete(key);
      return removedKeys.length;
    },
  };
  const queue = {
    async getJobCounts(...states) {
      return Object.fromEntries([
        ...states.map((state) => [state, jobs.filter((job) => job.state === state).length]),
      ]);
    },
    async getJobs([state]) {
      return jobs.filter((job) => job.state === state);
    },
    async isPaused() {
      return paused;
    },
    async pause() {
      paused = true;
      jobs = jobs.map((job) => (job.state === 'wait' ? { ...job, state: 'paused' } : job));
      if (addActiveJobOnPause) {
        jobs.push({ id: 'job-race', name: 'race', state: 'active', timestamp: 2 });
      }
    },
    async obliterate(...args) {
      obliterateArgs = args;
      jobs = [];
    },
    async resume() {
      resumeCalls += 1;
      paused = false;
    },
  };
  return {
    redis,
    queue,
    state: () => ({ keys: [...keys], jobs, paused, resumeCalls, obliterateArgs }),
  };
}

test('parseArgs mantem dry-run como padrao', () => {
  assert.deepEqual(parseArgs([]), {
    help: false,
    execute: false,
    redisOnly: false,
    ackBackup: false,
    ackServicesStopped: false,
    ackFinancialReset: false,
    ackActiveDeliveries: false,
    resetDeliveryNumbers: false,
    confirm: undefined,
    expectDbHost: undefined,
    expectDbPort: undefined,
    expectDbName: undefined,
    expectDbSchema: undefined,
    expectRedisProtocol: undefined,
    expectRedisHost: undefined,
    expectRedisPort: undefined,
    expectRedisDb: undefined,
    expectRedisSnapshot: undefined,
    expectSnapshot: undefined,
  });
});

test('parseArgs rejeita argumento desconhecido', () => {
  assert.throws(() => parseArgs(['--apagar-tudo']), /Argumento desconhecido/);
});

test('databaseTarget nunca devolve usuario, senha ou query string', () => {
  assert.deepEqual(
    databaseTarget(
      'postgresql://usuario:segredo@ep-exemplo.neon.tech:5432/neondb?sslmode=require&schema=operacional',
    ),
    { host: 'ep-exemplo.neon.tech', port: 5432, name: 'neondb', schema: 'operacional' },
  );
});

test('redisConnectionOptions interpreta TLS sem expor credenciais', () => {
  const result = redisConnectionOptions({
    REDIS_URL: 'rediss://default:segredo@redis-exemplo:6380/2',
  });
  assert.equal(result.host, 'redis-exemplo');
  assert.equal(result.port, 6380);
  assert.equal(result.db, 2);
  assert.deepEqual(result.tls, { servername: 'redis-exemplo' });
  assert.deepEqual(redisTargetIdentity(result), {
    protocol: 'rediss',
    host: 'redis-exemplo',
    port: 6380,
    db: 2,
  });
});

test('fingerprint independe da ordem das chaves de objetos', () => {
  assert.equal(stableStringify({ b: 2, a: 1 }), stableStringify({ a: 1, b: 2 }));
  assert.equal(snapshotFingerprint({ b: 2, a: 1 }), snapshotFingerprint({ a: 1, b: 2 }));
});

test('fingerprint Redis identifica conteudo e normaliza a pausa legitima da fila', () => {
  const base = {
    presenceKeys: ['motoboycity:driver-presence:active'],
    jobCounts: { wait: 1, active: 0 },
    jobs: [{ state: 'wait', id: 'job-1', name: 'expire-offer' }],
    queuePaused: false,
  };
  assert.equal(
    redisSnapshotFingerprint(base),
    redisSnapshotFingerprint({
      ...base,
      jobCounts: { wait: 0, paused: 1, active: 0 },
      jobs: [{ state: 'paused', id: 'job-1', name: 'expire-offer' }],
      queuePaused: true,
    }),
  );
  assert.notEqual(redisSnapshotFingerprint(base), redisSnapshotFingerprint({ ...base, jobs: [] }));
});

test('execucao exige todas as travas e o alvo exato', () => {
  const base = {
    execute: true,
    confirm: CONFIRMATION_TEXT,
    ackBackup: true,
    ackServicesStopped: true,
    ackFinancialReset: true,
    ackActiveDeliveries: false,
    expectDbHost: 'ep-exemplo.neon.tech',
    expectDbPort: '5432',
    expectDbName: 'neondb',
    expectDbSchema: 'public',
    expectRedisProtocol: 'rediss',
    expectRedisHost: 'redis-exemplo',
    expectRedisPort: '6380',
    expectRedisDb: '2',
    expectRedisSnapshot: 'redis123',
    expectSnapshot: 'abc123',
  };
  const context = {
    databaseTarget: {
      host: 'ep-exemplo.neon.tech',
      port: 5432,
      name: 'neondb',
      schema: 'public',
    },
    redisTarget: { protocol: 'rediss', host: 'redis-exemplo', port: 6380, db: 2 },
    redisFingerprint: 'redis123',
    fingerprint: 'abc123',
    activeDeliveries: 0,
  };
  assert.doesNotThrow(() => assertDatabaseExecutionGuards(base, context));
  assert.throws(
    () => assertDatabaseExecutionGuards({ ...base, expectDbName: 'outro' }, context),
    /nao confere/,
  );
  assert.throws(
    () => assertDatabaseExecutionGuards({ ...base, expectDbPort: '6543' }, context),
    /nao confere/,
  );
  assert.throws(
    () => assertDatabaseExecutionGuards({ ...base, expectDbSchema: 'staging' }, context),
    /nao confere/,
  );
  assert.throws(
    () => assertDatabaseExecutionGuards({ ...base, expectSnapshot: 'mudou' }, context),
    /snapshot mudou/i,
  );
});

test('execucao Redis rejeita protocolo, porta, banco ou snapshot diferentes', () => {
  const options = {
    confirm: CONFIRMATION_TEXT,
    ackServicesStopped: true,
    expectRedisProtocol: 'rediss',
    expectRedisHost: 'redis-exemplo',
    expectRedisPort: '6380',
    expectRedisDb: '2',
    expectRedisSnapshot: 'redis123',
  };
  const context = {
    redisTarget: { protocol: 'rediss', host: 'redis-exemplo', port: 6380, db: 2 },
    redisFingerprint: 'redis123',
  };
  assert.doesNotThrow(() => assertRedisExecutionGuards(options, context));
  for (const override of [
    { expectRedisProtocol: 'redis' },
    { expectRedisPort: '6379' },
    { expectRedisDb: '0' },
  ]) {
    assert.throws(
      () => assertRedisExecutionGuards({ ...options, ...override }, context),
      /nao confere/,
    );
  }
  assert.throws(
    () =>
      assertRedisExecutionGuards({ ...options, expectRedisSnapshot: 'outro-snapshot' }, context),
    /snapshot do Redis mudou/i,
  );
});

test('limpeza Redis e seletiva, fail-safe e sempre reativa a fila', async () => {
  const harness = createRedisHarness();
  const before = await redisSnapshot(harness.redis, harness.queue);
  const expectedFingerprint = redisSnapshotFingerprint(before);
  let databaseCalls = 0;

  const result = await executeRedisReset(
    harness.redis,
    harness.queue,
    expectedFingerprint,
    async () => {
      databaseCalls += 1;
      return 'db-ok';
    },
  );

  const finalState = harness.state();
  assert.equal(databaseCalls, 1);
  assert.equal(result.databaseResult, 'db-ok');
  assert.equal(result.before.presenceKeys, 3);
  assert.deepEqual(finalState.keys, []);
  assert.deepEqual(finalState.jobs, []);
  assert.equal(finalState.paused, false);
  assert.equal(finalState.resumeCalls, 1);
  assert.deepEqual(finalState.obliterateArgs, []);
});

test('mudanca na fila depois da pausa interrompe tudo e ainda reativa a fila', async () => {
  const harness = createRedisHarness({ addActiveJobOnPause: true });
  const before = await redisSnapshot(harness.redis, harness.queue);
  const expectedFingerprint = redisSnapshotFingerprint(before);
  let databaseCalls = 0;

  await assert.rejects(
    executeRedisReset(harness.redis, harness.queue, expectedFingerprint, async () => {
      databaseCalls += 1;
    }),
    /snapshot do Redis mudou/i,
  );

  const finalState = harness.state();
  assert.equal(databaseCalls, 0);
  assert.equal(finalState.paused, false);
  assert.equal(finalState.resumeCalls, 1);
  assert.equal(finalState.obliterateArgs, undefined);
});

test('pedido ativo exige confirmacao adicional', () => {
  const options = {
    confirm: CONFIRMATION_TEXT,
    ackBackup: true,
    ackServicesStopped: true,
    ackFinancialReset: true,
    ackActiveDeliveries: false,
    expectDbHost: 'db',
    expectDbPort: '5432',
    expectDbName: 'name',
    expectDbSchema: 'public',
    expectRedisProtocol: 'redis',
    expectRedisHost: 'redis',
    expectRedisPort: '6379',
    expectRedisDb: '0',
    expectRedisSnapshot: 'redis-hash',
    expectSnapshot: 'hash',
  };
  const context = {
    databaseTarget: { host: 'db', port: 5432, name: 'name', schema: 'public' },
    redisTarget: { protocol: 'redis', host: 'redis', port: 6379, db: 0 },
    redisFingerprint: 'redis-hash',
    fingerprint: 'hash',
    activeDeliveries: 1,
  };
  assert.throws(() => assertDatabaseExecutionGuards(options, context), /ack-active-deliveries/);
  assert.doesNotThrow(() =>
    assertDatabaseExecutionGuards({ ...options, ackActiveDeliveries: true }, context),
  );
});
