'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

const CONFIRMATION_TEXT = 'RESETAR_DADOS_DE_TESTE';
const DISPATCH_QUEUE = 'dispatch';
const DRIVER_PRESENCE_INDEX = 'motoboycity:driver-presence:active';
const DRIVER_DISPATCH_ORDER_INDEX = 'motoboycity:driver-dispatch-order';
const DRIVER_PRESENCE_KEY_PREFIX = 'motoboycity:driver-presence:';
const DISPATCH_JOB_STATES = [
  'wait',
  'active',
  'delayed',
  'completed',
  'failed',
  'paused',
  'prioritized',
  'waiting-children',
];
const ACTIVE_DELIVERY_STATUSES = new Set([
  'SCHEDULED',
  'AWAITING_DRIVER',
  'ACCEPTED',
  'COLLECTED',
  'DELIVERED',
  'FAILED',
]);

const HELP = `
Reset pre-producao MOTOboyCity

Por padrao, faz somente leitura e mostra o alvo, as quantidades e a
impressao digital do snapshot. Nenhum dado e apagado sem todas as travas.

Dry-run:
  pnpm --filter @motoboycity/api data:reset:preproduction

Execucao (use os valores mostrados pelo dry-run):
  pnpm --filter @motoboycity/api data:reset:preproduction -- \\
    --execute \\
    --confirm=${CONFIRMATION_TEXT} \\
    --ack-backup \\
    --ack-services-stopped \\
    --ack-financial-reset \\
    --expect-db-host=<host> \\
    --expect-db-port=<porta> \\
    --expect-db-name=<banco> \\
    --expect-db-schema=<schema> \\
    --expect-redis-protocol=<redis|rediss> \\
    --expect-redis-host=<host> \\
    --expect-redis-port=<porta> \\
    --expect-redis-db=<indice> \\
    --expect-redis-snapshot=<sha256> \\
    --expect-snapshot=<sha256>

Se o dry-run mostrar pedidos ativos, acrescente:
  --ack-active-deliveries

Para recomecar a numeracao visual dos pedidos em #1, acrescente:
  --reset-delivery-numbers

Recuperacao caso somente a limpeza do Redis tenha falhado depois do commit:
  # Primeiro rode apenas --redis-only para obter o snapshot atual.
  pnpm --filter @motoboycity/api data:reset:preproduction -- \\
    --redis-only --execute --confirm=${CONFIRMATION_TEXT} \\
    --ack-services-stopped \\
    --expect-redis-protocol=<redis|rediss> \\
    --expect-redis-host=<host> --expect-redis-port=<porta> \\
    --expect-redis-db=<indice> --expect-redis-snapshot=<sha256>
`;

function parseArgs(argv) {
  const options = {
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
  };

  for (const argument of argv) {
    if (argument === '--') continue;
    if (argument === '--help' || argument === '-h') options.help = true;
    else if (argument === '--execute') options.execute = true;
    else if (argument === '--redis-only') options.redisOnly = true;
    else if (argument === '--ack-backup') options.ackBackup = true;
    else if (argument === '--ack-services-stopped') options.ackServicesStopped = true;
    else if (argument === '--ack-financial-reset') options.ackFinancialReset = true;
    else if (argument === '--ack-active-deliveries') options.ackActiveDeliveries = true;
    else if (argument === '--reset-delivery-numbers') options.resetDeliveryNumbers = true;
    else if (argument.startsWith('--confirm=')) options.confirm = valueAfterEquals(argument);
    else if (argument.startsWith('--expect-db-host=')) {
      options.expectDbHost = valueAfterEquals(argument);
    } else if (argument.startsWith('--expect-db-port=')) {
      options.expectDbPort = valueAfterEquals(argument);
    } else if (argument.startsWith('--expect-db-name=')) {
      options.expectDbName = valueAfterEquals(argument);
    } else if (argument.startsWith('--expect-db-schema=')) {
      options.expectDbSchema = valueAfterEquals(argument);
    } else if (argument.startsWith('--expect-redis-protocol=')) {
      options.expectRedisProtocol = valueAfterEquals(argument).toLowerCase();
    } else if (argument.startsWith('--expect-redis-host=')) {
      options.expectRedisHost = valueAfterEquals(argument);
    } else if (argument.startsWith('--expect-redis-port=')) {
      options.expectRedisPort = valueAfterEquals(argument);
    } else if (argument.startsWith('--expect-redis-db=')) {
      options.expectRedisDb = valueAfterEquals(argument);
    } else if (argument.startsWith('--expect-redis-snapshot=')) {
      options.expectRedisSnapshot = valueAfterEquals(argument).toLowerCase();
    } else if (argument.startsWith('--expect-snapshot=')) {
      options.expectSnapshot = valueAfterEquals(argument).toLowerCase();
    } else {
      throw new Error(`Argumento desconhecido: ${argument}`);
    }
  }

  return options;
}

function valueAfterEquals(argument) {
  const value = argument.slice(argument.indexOf('=') + 1).trim();
  if (!value) throw new Error(`Valor ausente em ${argument}`);
  return value;
}

function loadLocalEnvIfNeeded() {
  const hasDatabase = Boolean((process.env.DIRECT_URL || process.env.DATABASE_URL || '').trim());
  const hasRedis = Boolean(
    (process.env.REDIS_URL || process.env.REDIS_HOST || process.env.REDISHOST || '').trim(),
  );
  if (hasDatabase && hasRedis) return;

  const envPath = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) return;
  if (typeof process.loadEnvFile !== 'function') {
    throw new Error(
      'Este Node nao suporta process.loadEnvFile(). Exporte DATABASE_URL/DIRECT_URL e REDIS_URL antes de executar.',
    );
  }
  process.loadEnvFile(envPath);
}

function databaseTarget(rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error('A URL do PostgreSQL nao e uma URL absoluta valida.');
  }
  if (parsed.protocol !== 'postgresql:' && parsed.protocol !== 'postgres:') {
    throw new Error('A URL do banco precisa usar postgresql:// ou postgres://.');
  }
  const name = decodeURIComponent(parsed.pathname.replace(/^\/+/, '')).trim();
  if (!parsed.hostname || !name) throw new Error('Host ou nome do banco ausente na URL.');
  return {
    host: parsed.hostname.toLowerCase(),
    port: parsed.port ? parsePort(parsed.port) : 5432,
    name,
    schema: parsed.searchParams.get('schema') || 'public',
  };
}

function selectDatabaseUrl(env = process.env) {
  const directUrl = (env.DIRECT_URL || '').trim();
  const pooledUrl = (env.DATABASE_URL || '').trim();
  const url = directUrl || pooledUrl;
  if (!url) throw new Error('DIRECT_URL ou DATABASE_URL nao foi configurada.');
  return { url, source: directUrl ? 'DIRECT_URL' : 'DATABASE_URL' };
}

function redisConnectionOptions(env = process.env) {
  const rawUrl = (env.REDIS_URL || '').trim();
  if (rawUrl) {
    let parsed;
    try {
      parsed = new URL(rawUrl);
    } catch {
      throw new Error('REDIS_URL nao e uma URL absoluta valida.');
    }
    if (parsed.protocol !== 'redis:' && parsed.protocol !== 'rediss:') {
      throw new Error('REDIS_URL precisa usar redis:// ou rediss://.');
    }
    const host = parsed.hostname.replace(/^\[|\]$/g, '').toLowerCase();
    if (!host) throw new Error('Host ausente em REDIS_URL.');
    const options = {
      host,
      port: parsed.port ? parsePort(parsed.port) : 6379,
    };
    if (parsed.username) options.username = decodeURIComponent(parsed.username);
    if (parsed.password) options.password = decodeURIComponent(parsed.password);
    if (parsed.protocol === 'rediss:') options.tls = { servername: host };
    const database = parsed.pathname.replace(/^\//, '').trim();
    if (database) options.db = parseRedisDatabase(database);
    return options;
  }

  const host = (env.REDIS_HOST || env.REDISHOST || '').trim().toLowerCase();
  if (!host) throw new Error('REDIS_URL ou REDIS_HOST nao foi configurada.');
  const options = {
    host,
    port: parsePort((env.REDIS_PORT || env.REDISPORT || '6379').trim()),
  };
  const username = (env.REDIS_USERNAME || env.REDISUSER || '').trim();
  const password = env.REDIS_PASSWORD || env.REDISPASSWORD || '';
  if (username) options.username = username;
  if (password) options.password = password;
  if ((env.REDIS_TLS || '').trim().toLowerCase() === 'true') {
    options.tls = { servername: host };
  }
  return options;
}

function parsePort(raw) {
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Porta invalida: ${JSON.stringify(raw)}.`);
  }
  return port;
}

function parseRedisDatabase(raw) {
  const database = Number(raw);
  if (!Number.isInteger(database) || database < 0) {
    throw new Error(`Indice de banco Redis invalido: ${JSON.stringify(raw)}.`);
  }
  return database;
}

function describeRedisTarget(options) {
  const protocol = options.tls ? 'rediss' : 'redis';
  const database = `/${options.db ?? 0}`;
  const authentication = options.password ? 'com autenticacao' : 'sem autenticacao';
  return `${protocol}://${options.host}:${options.port}${database} (${authentication})`;
}

function redisTargetIdentity(options) {
  return {
    protocol: options.tls ? 'rediss' : 'redis',
    host: options.host,
    port: options.port,
    db: options.db ?? 0,
  };
}

function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
    .join(',')}}`;
}

function snapshotFingerprint(snapshot) {
  const serializable = JSON.parse(JSON.stringify(snapshot));
  return createHash('sha256').update(stableStringify(serializable)).digest('hex');
}

function groupedCount(rows, field) {
  return rows.reduce((result, row) => {
    const value = String(row[field] ?? 'NULL');
    result[value] = (result[value] || 0) + 1;
    return result;
  }, {});
}

async function collectSnapshot(db) {
  const [
    deliveries,
    deliveryLocationPoints,
    deliveryAddresses,
    deliveryStatusHistory,
    deliveryOffers,
    invoices,
    invoicePaymentNotices,
    invoiceStatusHistory,
    wallets,
    walletTransactions,
    withdrawalRequests,
    withdrawalRequestStatusHistory,
    advanceRequests,
    driverPresenceLogs,
    drivers,
  ] = await Promise.all([
    db.delivery.findMany({
      orderBy: { id: 'asc' },
      select: {
        id: true,
        displayNumber: true,
        status: true,
        driverId: true,
        invoiceId: true,
        batchId: true,
        totalValue: true,
        updatedAt: true,
      },
    }),
    db.deliveryLocationPoint.findMany({
      orderBy: { id: 'asc' },
      select: { id: true, deliveryId: true },
    }),
    db.deliveryAddress.findMany({
      orderBy: { id: 'asc' },
      select: { id: true, deliveryId: true },
    }),
    db.deliveryStatusHistory.findMany({
      orderBy: { id: 'asc' },
      select: { id: true, deliveryId: true, toStatus: true, changedAt: true },
    }),
    db.deliveryOffer.findMany({
      orderBy: { id: 'asc' },
      select: { id: true, deliveryId: true, response: true, respondedAt: true },
    }),
    db.invoice.findMany({
      orderBy: { id: 'asc' },
      select: { id: true, status: true, totalValue: true, number: true },
    }),
    db.invoicePaymentNotice.findMany({
      orderBy: { id: 'asc' },
      select: { id: true, invoiceId: true, status: true },
    }),
    db.invoiceStatusHistory.findMany({
      orderBy: { id: 'asc' },
      select: { id: true, invoiceId: true, toStatus: true, changedAt: true },
    }),
    db.wallet.findMany({
      orderBy: { id: 'asc' },
      select: {
        id: true,
        cachedAvailableBalance: true,
        cachedBlockedBalance: true,
        updatedAt: true,
      },
    }),
    db.walletTransaction.findMany({
      orderBy: { id: 'asc' },
      select: {
        id: true,
        walletId: true,
        type: true,
        status: true,
        amount: true,
        relatedDeliveryId: true,
        relatedWithdrawalRequestId: true,
        relatedAdvanceRequestId: true,
        createdAt: true,
      },
    }),
    db.withdrawalRequest.findMany({
      orderBy: { id: 'asc' },
      select: { id: true, walletId: true, walletTransactionId: true, status: true },
    }),
    db.withdrawalRequestStatusHistory.findMany({
      orderBy: { id: 'asc' },
      select: { id: true, withdrawalRequestId: true, toStatus: true, changedAt: true },
    }),
    db.advanceRequest.findMany({
      orderBy: { id: 'asc' },
      select: { id: true, walletId: true, resultingWithdrawalRequestId: true, status: true },
    }),
    db.driverPresenceLog.findMany({
      orderBy: { id: 'asc' },
      select: { id: true, driverId: true, wentOnlineAt: true, wentOfflineAt: true },
    }),
    db.driver.findMany({
      orderBy: { id: 'asc' },
      select: {
        id: true,
        availability: true,
        lastKnownLat: true,
        lastKnownLng: true,
        lastSeenAt: true,
        locationSilenceAlertedAt: true,
        updatedAt: true,
      },
    }),
  ]);

  const relatedEntityIds = [
    ...deliveries.map((row) => row.id),
    ...invoices.map((row) => row.id),
    ...withdrawalRequests.map((row) => row.id),
    ...advanceRequests.map((row) => row.id),
  ];
  const [notifications, administrativeAudits] = relatedEntityIds.length
    ? await Promise.all([
        db.notification.findMany({
          where: { relatedEntityId: { in: relatedEntityIds } },
          orderBy: { id: 'asc' },
          select: { id: true, relatedEntityType: true, relatedEntityId: true, type: true },
        }),
        db.administrativeAudit.findMany({
          where: {
            entityType: {
              in: [
                'DELIVERY',
                'INVOICE',
                'WITHDRAWAL',
                'WITHDRAWAL_REQUEST',
                'ADVANCE',
                'ADVANCE_REQUEST',
              ],
            },
            entityId: { in: relatedEntityIds },
          },
          orderBy: { id: 'asc' },
          select: { id: true, entityType: true, entityId: true, action: true },
        }),
      ])
    : [[], []];

  return {
    deliveries,
    deliveryLocationPoints,
    deliveryAddresses,
    deliveryStatusHistory,
    deliveryOffers,
    invoices,
    invoicePaymentNotices,
    invoiceStatusHistory,
    wallets,
    walletTransactions,
    withdrawalRequests,
    withdrawalRequestStatusHistory,
    advanceRequests,
    driverPresenceLogs,
    drivers,
    notifications,
    administrativeAudits,
  };
}

function snapshotSummary(snapshot) {
  return {
    deliveries: snapshot.deliveries.length,
    deliveriesByStatus: groupedCount(snapshot.deliveries, 'status'),
    deliveryLocationPoints: snapshot.deliveryLocationPoints.length,
    deliveryAddresses: snapshot.deliveryAddresses.length,
    deliveryStatusHistory: snapshot.deliveryStatusHistory.length,
    deliveryOffers: snapshot.deliveryOffers.length,
    invoices: snapshot.invoices.length,
    invoicesByStatus: groupedCount(snapshot.invoices, 'status'),
    invoicePaymentNotices: snapshot.invoicePaymentNotices.length,
    invoiceStatusHistory: snapshot.invoiceStatusHistory.length,
    walletsPreservedAndZeroed: snapshot.wallets.length,
    walletTransactions: snapshot.walletTransactions.length,
    walletTransactionsByType: groupedCount(snapshot.walletTransactions, 'type'),
    withdrawalRequests: snapshot.withdrawalRequests.length,
    withdrawalRequestStatusHistory: snapshot.withdrawalRequestStatusHistory.length,
    advanceRequests: snapshot.advanceRequests.length,
    driverPresenceLogs: snapshot.driverPresenceLogs.length,
    driversPreservedAndSetOffline: snapshot.drivers.length,
    relatedNotifications: snapshot.notifications.length,
    relatedAdministrativeAudits: snapshot.administrativeAudits.length,
  };
}

function activeDeliveryCount(snapshot) {
  return snapshot.deliveries.filter((row) => ACTIVE_DELIVERY_STATUSES.has(row.status)).length;
}

async function preservedCounts(db) {
  const [
    users,
    companies,
    drivers,
    regions,
    serviceTypes,
    pricingTables,
    surcharges,
    deviceTokens,
  ] = await Promise.all([
    db.user.count(),
    db.company.count(),
    db.driver.count(),
    db.region.count(),
    db.serviceType.count(),
    db.pricingTable.count(),
    db.surcharge.count(),
    db.deviceToken.count(),
  ]);
  return {
    users,
    companies,
    drivers,
    regions,
    serviceTypes,
    pricingTables,
    surcharges,
    deviceTokens,
  };
}

function assertExpected(value, expected, label) {
  if (!expected) throw new Error(`Informe ${label}.`);
  if (value.toLowerCase() !== expected.toLowerCase()) {
    throw new Error(`${label} nao confere com o alvo real (${value}).`);
  }
}

function assertRedisExecutionGuards(options, context) {
  if (options.confirm !== CONFIRMATION_TEXT) {
    throw new Error(`Confirmacao incorreta. Use --confirm=${CONFIRMATION_TEXT}.`);
  }
  if (!options.ackServicesStopped) {
    throw new Error('Confirme que API e workers estao parados com --ack-services-stopped.');
  }
  assertExpected(
    context.redisTarget.protocol,
    options.expectRedisProtocol,
    '--expect-redis-protocol',
  );
  assertExpected(context.redisTarget.host, options.expectRedisHost, '--expect-redis-host');
  assertExpected(String(context.redisTarget.port), options.expectRedisPort, '--expect-redis-port');
  assertExpected(String(context.redisTarget.db), options.expectRedisDb, '--expect-redis-db');
  if (!options.expectRedisSnapshot) {
    throw new Error('Informe --expect-redis-snapshot obtido no dry-run.');
  }
  if (context.redisFingerprint !== options.expectRedisSnapshot) {
    throw new Error(
      'O snapshot do Redis mudou desde o dry-run. Rode o dry-run novamente; nada foi apagado.',
    );
  }
}

function assertDatabaseExecutionGuards(options, context) {
  assertRedisExecutionGuards(options, context);
  if (!options.ackBackup) {
    throw new Error('Confirme o backup/restore point do Neon com --ack-backup.');
  }
  if (!options.ackFinancialReset) {
    throw new Error(
      'Confirme que todo o movimento financeiro e de teste com --ack-financial-reset.',
    );
  }
  assertExpected(context.databaseTarget.host, options.expectDbHost, '--expect-db-host');
  assertExpected(String(context.databaseTarget.port), options.expectDbPort, '--expect-db-port');
  assertExpected(context.databaseTarget.name, options.expectDbName, '--expect-db-name');
  assertExpected(context.databaseTarget.schema, options.expectDbSchema, '--expect-db-schema');
  if (!options.expectSnapshot) throw new Error('Informe --expect-snapshot obtido no dry-run.');
  if (context.fingerprint !== options.expectSnapshot) {
    throw new Error(
      'O snapshot mudou desde o dry-run. Rode o dry-run novamente; nada foi apagado.',
    );
  }
  if (context.activeDeliveries > 0 && !options.ackActiveDeliveries) {
    throw new Error(
      `Existem ${context.activeDeliveries} pedido(s) ainda ativo(s). Confirme a remocao com --ack-active-deliveries.`,
    );
  }
}

function ids(rows) {
  return rows.map((row) => row.id);
}

function chunks(values, size = 5000) {
  const result = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

async function deleteByIds(model, values) {
  let deleted = 0;
  for (const part of chunks(values)) {
    const result = await model.deleteMany({ where: { id: { in: part } } });
    deleted += result.count;
  }
  return deleted;
}

async function updateWalletsToZero(db, walletIds) {
  let updated = 0;
  for (const part of chunks(walletIds)) {
    const result = await db.wallet.updateMany({
      where: { id: { in: part } },
      data: { cachedAvailableBalance: 0, cachedBlockedBalance: 0 },
    });
    updated += result.count;
  }
  return updated;
}

async function resetDriverRuntime(db, driverIds) {
  let updated = 0;
  for (const part of chunks(driverIds)) {
    const result = await db.driver.updateMany({
      where: { id: { in: part } },
      data: {
        availability: 'UNAVAILABLE',
        lastKnownLat: null,
        lastKnownLng: null,
        lastSeenAt: null,
        locationSilenceAlertedAt: null,
      },
    });
    updated += result.count;
  }
  return updated;
}

async function verifyDatabaseReset(db) {
  const [
    deliveries,
    locationPoints,
    addresses,
    statusHistory,
    offers,
    invoices,
    invoiceNotices,
    invoiceHistory,
    walletTransactions,
    withdrawals,
    withdrawalHistory,
    advances,
    presenceLogs,
    wallets,
    drivers,
  ] = await Promise.all([
    db.delivery.count(),
    db.deliveryLocationPoint.count(),
    db.deliveryAddress.count(),
    db.deliveryStatusHistory.count(),
    db.deliveryOffer.count(),
    db.invoice.count(),
    db.invoicePaymentNotice.count(),
    db.invoiceStatusHistory.count(),
    db.walletTransaction.count(),
    db.withdrawalRequest.count(),
    db.withdrawalRequestStatusHistory.count(),
    db.advanceRequest.count(),
    db.driverPresenceLog.count(),
    db.wallet.findMany({
      select: { id: true, cachedAvailableBalance: true, cachedBlockedBalance: true },
    }),
    db.driver.findMany({
      select: {
        id: true,
        availability: true,
        lastKnownLat: true,
        lastKnownLng: true,
        lastSeenAt: true,
        locationSilenceAlertedAt: true,
      },
    }),
  ]);

  const remaining = {
    deliveries,
    locationPoints,
    addresses,
    statusHistory,
    offers,
    invoices,
    invoiceNotices,
    invoiceHistory,
    walletTransactions,
    withdrawals,
    withdrawalHistory,
    advances,
    presenceLogs,
  };
  const nonZero = Object.entries(remaining).filter(([, count]) => count !== 0);
  if (nonZero.length) {
    throw new Error(
      `Verificacao encontrou dados remanescentes: ${JSON.stringify(Object.fromEntries(nonZero))}`,
    );
  }
  const dirtyWallets = wallets.filter(
    (wallet) =>
      wallet.cachedAvailableBalance.toString() !== '0' ||
      wallet.cachedBlockedBalance.toString() !== '0',
  );
  if (dirtyWallets.length)
    throw new Error(`${dirtyWallets.length} carteira(s) nao ficaram zeradas.`);
  const onlineDrivers = drivers.filter(
    (driver) =>
      driver.availability !== 'UNAVAILABLE' ||
      driver.lastKnownLat !== null ||
      driver.lastKnownLng !== null ||
      driver.lastSeenAt !== null ||
      driver.locationSilenceAlertedAt !== null,
  );
  if (onlineDrivers.length)
    throw new Error(`${onlineDrivers.length} motoboy(s) mantiveram estado ao vivo.`);
}

async function executeDatabaseReset(prisma, expectedFingerprint, resetDeliveryNumbers) {
  return prisma.$transaction(
    async (db) => {
      const snapshot = await collectSnapshot(db);
      const fingerprint = snapshotFingerprint(snapshot);
      if (fingerprint !== expectedFingerprint) {
        throw new Error('O snapshot mudou durante a execucao. A transacao foi revertida.');
      }

      const deleted = {};
      deleted.withdrawalRequestStatusHistory = await deleteByIds(
        db.withdrawalRequestStatusHistory,
        ids(snapshot.withdrawalRequestStatusHistory),
      );
      deleted.advanceRequests = await deleteByIds(db.advanceRequest, ids(snapshot.advanceRequests));
      deleted.withdrawalRequests = await deleteByIds(
        db.withdrawalRequest,
        ids(snapshot.withdrawalRequests),
      );
      deleted.walletTransactions = await deleteByIds(
        db.walletTransaction,
        ids(snapshot.walletTransactions),
      );
      deleted.invoicePaymentNotices = await deleteByIds(
        db.invoicePaymentNotice,
        ids(snapshot.invoicePaymentNotices),
      );
      deleted.invoiceStatusHistory = await deleteByIds(
        db.invoiceStatusHistory,
        ids(snapshot.invoiceStatusHistory),
      );
      deleted.deliveryLocationPoints = await deleteByIds(
        db.deliveryLocationPoint,
        ids(snapshot.deliveryLocationPoints),
      );
      deleted.deliveryOffers = await deleteByIds(db.deliveryOffer, ids(snapshot.deliveryOffers));
      deleted.deliveryStatusHistory = await deleteByIds(
        db.deliveryStatusHistory,
        ids(snapshot.deliveryStatusHistory),
      );
      deleted.deliveryAddresses = await deleteByIds(
        db.deliveryAddress,
        ids(snapshot.deliveryAddresses),
      );
      deleted.notifications = await deleteByIds(db.notification, ids(snapshot.notifications));
      deleted.administrativeAudits = await deleteByIds(
        db.administrativeAudit,
        ids(snapshot.administrativeAudits),
      );
      deleted.deliveries = await deleteByIds(db.delivery, ids(snapshot.deliveries));
      deleted.invoices = await deleteByIds(db.invoice, ids(snapshot.invoices));
      deleted.driverPresenceLogs = await deleteByIds(
        db.driverPresenceLog,
        ids(snapshot.driverPresenceLogs),
      );
      deleted.walletsZeroed = await updateWalletsToZero(db, ids(snapshot.wallets));
      deleted.driversSetOffline = await resetDriverRuntime(db, ids(snapshot.drivers));

      await verifyDatabaseReset(db);
      if (resetDeliveryNumbers) await resetDeliverySequence(db);
      return deleted;
    },
    { isolationLevel: 'Serializable', maxWait: 15_000, timeout: 120_000 },
  );
}

async function scanPresenceKeys(redis) {
  const found = new Set();
  let cursor = '0';
  do {
    const result = await redis.scan(
      cursor,
      'MATCH',
      `${DRIVER_PRESENCE_KEY_PREFIX}*`,
      'COUNT',
      250,
    );
    cursor = result[0];
    for (const key of result[1]) found.add(key);
  } while (cursor !== '0');
  if (await redis.exists(DRIVER_DISPATCH_ORDER_INDEX)) {
    found.add(DRIVER_DISPATCH_ORDER_INDEX);
  }
  return [...found];
}

async function openRedis(options) {
  const Redis = require('ioredis');
  const { Queue } = require('bullmq');
  const redis = new Redis({ ...options, lazyConnect: true, maxRetriesPerRequest: 2 });
  const queue = new Queue(DISPATCH_QUEUE, {
    connection: { ...options, maxRetriesPerRequest: null },
  });
  // ioredis/BullMQ emitem `error` alem de rejeitar a Promise de conexao. Sem
  // listeners, uma falha de rede esperada no dry-run derruba o processo com
  // uma segunda excecao nao tratada e esconde a mensagem segura da ferramenta.
  redis.on('error', () => undefined);
  queue.on('error', () => undefined);
  try {
    await redis.connect();
    await queue.waitUntilReady();
    return { redis, queue };
  } catch (error) {
    await Promise.allSettled([redis.quit(), queue.close()]);
    throw error;
  }
}

async function redisSnapshot(redis, queue) {
  const [presenceKeys, jobCounts, jobsByState, queuePaused] = await Promise.all([
    scanPresenceKeys(redis),
    queue.getJobCounts(...DISPATCH_JOB_STATES),
    Promise.all(
      DISPATCH_JOB_STATES.map(async (state) => ({
        state,
        jobs: await queue.getJobs([state], 0, -1, true),
      })),
    ),
    queue.isPaused(),
  ]);
  const jobs = jobsByState
    .flatMap(({ state, jobs: stateJobs }) =>
      stateJobs.map((job) => ({
        state,
        id: String(job.id),
        name: job.name,
        timestamp: job.timestamp ?? null,
        delay: job.delay ?? null,
        processedOn: job.processedOn ?? null,
        finishedOn: job.finishedOn ?? null,
        attemptsMade: job.attemptsMade ?? 0,
      })),
    )
    .sort((left, right) => `${left.state}:${left.id}`.localeCompare(`${right.state}:${right.id}`));
  return {
    presenceKeys: [...presenceKeys].sort(),
    jobCounts: Object.fromEntries(
      DISPATCH_JOB_STATES.map((state) => [state, Number(jobCounts[state] || 0)]),
    ),
    jobs,
    queuePaused: Boolean(queuePaused),
  };
}

function redisSnapshotSummary(snapshot) {
  return {
    presenceKeys: snapshot.presenceKeys.length,
    jobCounts: snapshot.jobCounts,
    queuePaused: snapshot.queuePaused,
  };
}

function redisSnapshotFingerprint(snapshot) {
  const normalizedJobCounts = { ...snapshot.jobCounts };
  normalizedJobCounts.pending =
    Number(normalizedJobCounts.wait || 0) + Number(normalizedJobCounts.paused || 0);
  delete normalizedJobCounts.wait;
  delete normalizedJobCounts.paused;
  const normalizedJobs = snapshot.jobs
    .map((job) => ({
      ...job,
      state: job.state === 'wait' || job.state === 'paused' ? 'pending' : job.state,
    }))
    .sort((left, right) => `${left.state}:${left.id}`.localeCompare(`${right.state}:${right.id}`));
  return snapshotFingerprint({
    presenceKeys: snapshot.presenceKeys,
    jobCounts: normalizedJobCounts,
    jobs: normalizedJobs,
  });
}

function assertRedisSnapshotUnchanged(snapshot, expectedFingerprint) {
  if (redisSnapshotFingerprint(snapshot) !== expectedFingerprint) {
    throw new Error(
      'O snapshot do Redis mudou desde o dry-run. A limpeza foi interrompida antes de apagar a fila.',
    );
  }
}

async function executeRedisReset(redis, queue, expectedFingerprint, databaseReset) {
  const before = await redisSnapshot(redis, queue);
  assertRedisSnapshotUnchanged(before, expectedFingerprint);
  if (before.queuePaused) {
    throw new Error(
      'A fila dispatch ja estava pausada antes da limpeza. Reative-a e refaca o dry-run.',
    );
  }
  if ((before.jobCounts.active || 0) > 0) {
    throw new Error(
      `A fila dispatch ainda tem ${before.jobCounts.active} job(s) ativo(s). Pare os workers e tente novamente.`,
    );
  }

  await queue.pause();
  try {
    const pausedSnapshot = await redisSnapshot(redis, queue);
    assertRedisSnapshotUnchanged(pausedSnapshot, expectedFingerprint);
    if ((pausedSnapshot.jobCounts.active || 0) > 0) {
      throw new Error(
        'Um job dispatch ficou ativo durante a preparacao. A limpeza foi interrompida.',
      );
    }

    const databaseResult = await databaseReset();
    await queue.obliterate();
    const presenceKeys = await scanPresenceKeys(redis);
    for (const part of chunks(presenceKeys)) {
      if (part.length) await redis.del(...part);
    }

    const after = await redisSnapshot(redis, queue);
    const remainingJobs = Object.values(after.jobCounts).reduce((total, count) => total + count, 0);
    if (after.presenceKeys.length !== 0 || remainingJobs !== 0 || after.jobs.length !== 0) {
      throw new Error('A verificacao do Redis encontrou fila ou presenca remanescente.');
    }
    return { before: redisSnapshotSummary(before), databaseResult };
  } finally {
    await queue.resume();
    if (await queue.isPaused()) {
      throw new Error('A fila dispatch permaneceu pausada depois da limpeza.');
    }
  }
}

async function resetDeliverySequence(prisma) {
  await prisma.$queryRaw`SELECT setval(pg_get_serial_sequence('deliveries', 'displayNumber'), 1, false)`;
}

function printDryRun(context) {
  console.log('\n=== DRY-RUN: nenhum dado foi alterado ===');
  console.log(
    `PostgreSQL: ${context.databaseSource} -> ${context.databaseTarget.host}:${context.databaseTarget.port}/${context.databaseTarget.name}?schema=${context.databaseTarget.schema}`,
  );
  console.log(`Redis: ${describeRedisTarget(context.redisOptions)}`);
  console.log('\nDados que serao removidos/zerados:');
  console.log(JSON.stringify(snapshotSummary(context.snapshot), null, 2));
  console.log('\nCadastros preservados:');
  console.log(JSON.stringify(context.preserved, null, 2));
  console.log('\nRedis (somente a fila dispatch e a presenca efemera serao limpas):');
  console.log(JSON.stringify(redisSnapshotSummary(context.redisSnapshot), null, 2));
  console.log(`\nPedidos ativos encontrados: ${context.activeDeliveries}`);
  console.log(`Snapshot PostgreSQL SHA-256: ${context.fingerprint}`);
  console.log(`Snapshot Redis SHA-256: ${context.redisFingerprint}`);
  console.log('\nUse --help para ver o comando de execucao protegido.');
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(HELP.trim());
    return;
  }

  loadLocalEnvIfNeeded();
  const redisOptions = redisConnectionOptions();
  const currentRedisTarget = redisTargetIdentity(redisOptions);
  const { redis, queue } = await openRedis(redisOptions);
  let prisma;

  try {
    const currentRedisSnapshot = await redisSnapshot(redis, queue);
    const currentRedisFingerprint = redisSnapshotFingerprint(currentRedisSnapshot);
    if (options.redisOnly) {
      console.log(`Redis: ${describeRedisTarget(redisOptions)}`);
      console.log(JSON.stringify(redisSnapshotSummary(currentRedisSnapshot), null, 2));
      console.log(`Snapshot Redis SHA-256: ${currentRedisFingerprint}`);
      if (!options.execute) {
        console.log('\nDRY-RUN Redis: nenhum dado foi alterado.');
        return;
      }
      const redisContext = {
        redisTarget: currentRedisTarget,
        redisFingerprint: currentRedisFingerprint,
      };
      assertRedisExecutionGuards(options, redisContext);
      const result = await executeRedisReset(
        redis,
        queue,
        options.expectRedisSnapshot,
        async () => undefined,
      );
      console.log('\nLimpeza seletiva do Redis concluida.');
      console.log(JSON.stringify(result.before, null, 2));
      return;
    }

    const selectedDatabase = selectDatabaseUrl();
    const target = databaseTarget(selectedDatabase.url);
    // O Prisma Client usa DATABASE_URL em runtime. Preferimos DIRECT_URL para
    // esta operacao administrativa longa e pontual, sem expor a URL no log.
    process.env.DATABASE_URL = selectedDatabase.url;
    const { PrismaClient } = require('@prisma/client');
    prisma = new PrismaClient();
    const [snapshot, preserved] = await Promise.all([
      collectSnapshot(prisma),
      preservedCounts(prisma),
    ]);
    const fingerprint = snapshotFingerprint(snapshot);
    const activeDeliveries = activeDeliveryCount(snapshot);
    const context = {
      databaseSource: selectedDatabase.source,
      databaseTarget: target,
      redisOptions,
      redisTarget: currentRedisTarget,
      redisSnapshot: currentRedisSnapshot,
      redisFingerprint: currentRedisFingerprint,
      snapshot,
      preserved,
      fingerprint,
      activeDeliveries,
    };

    if (!options.execute) {
      printDryRun(context);
      return;
    }

    assertDatabaseExecutionGuards(options, context);
    let resetResult;
    try {
      resetResult = await executeRedisReset(redis, queue, options.expectRedisSnapshot, () =>
        executeDatabaseReset(prisma, fingerprint, options.resetDeliveryNumbers),
      );
    } catch (error) {
      console.error('\nA limpeza nao terminou. Confira o estado com um novo dry-run.');
      throw error;
    }

    console.log('\n=== RESET PRE-PRODUCAO CONCLUIDO ===');
    console.log('Banco:');
    console.log(JSON.stringify(resetResult.databaseResult, null, 2));
    console.log('Redis removido:');
    console.log(JSON.stringify(resetResult.before, null, 2));
    console.log(`Numeracao de pedidos reiniciada: ${options.resetDeliveryNumbers ? 'sim' : 'nao'}`);
    console.log('Cadastros, configuracoes, documentos e tokens do aplicativo foram preservados.');
  } finally {
    await Promise.allSettled([prisma?.$disconnect(), redis.quit(), queue.close()]);
  }
}

module.exports = {
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
};

if (require.main === module) {
  main().catch((error) => {
    console.error(
      `\nRESET NAO CONCLUIDO: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  });
}
