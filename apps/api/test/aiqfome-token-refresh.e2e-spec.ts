import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import Redis from 'ioredis';
import { buildRedisConnectionOptions } from '../src/common/redis-connection';
import { PrismaService } from '../src/prisma/prisma.service';
import { AiqfomeClient } from '../src/integrations/aiqfome/aiqfome-client';
import { AiqfomeCredentialsService } from '../src/integrations/aiqfome/aiqfome-credentials.service';
import type {
  AiqfomeStoredCredentials,
  AiqfomeTokenResponse,
} from '../src/integrations/aiqfome/aiqfome.schemas';
import { AiqfomeTokenService } from '../src/integrations/aiqfome/aiqfome-token.service';

const LOCK_KEY_PREFIX = 'motoboycity:aiqfome:token-refresh:';
const requiredScopes = ['aqf:store:read', 'aqf:store:create', 'aqf:order:read', 'aqf:order:create'];
const runtimeValues: Record<string, string> = {
  AIQFOME_CLIENT_ID: 'isolated-client-id',
  AIQFOME_CLIENT_SECRET: 'isolated-client-secret',
  AIQFOME_REDIRECT_URI: 'https://api.example.com/integrations/aiqfome/callback',
  AIQFOME_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 11).toString('base64'),
  COMPANY_WEB_URL: 'https://company.example.com',
};

describe('Refresh atomico aiqfome com PostgreSQL e Redis reais (e2e)', () => {
  let prismaA: PrismaService;
  let prismaB: PrismaService;
  let redisA: Redis;
  let redisB: Redis;
  let cipher: AiqfomeCredentialsService;
  const integrationIds = new Set<string>();

  beforeAll(async () => {
    assertIsolatedDatabase(process.env['DATABASE_URL']);

    prismaA = new PrismaService();
    prismaB = new PrismaService();
    await Promise.all([prismaA.$connect(), prismaB.$connect()]);

    const redisOptions = {
      ...buildRedisConnectionOptions(),
      maxRetriesPerRequest: 1,
    };
    redisA = new Redis(redisOptions);
    redisB = new Redis(redisOptions);
    await Promise.all([redisA.ping(), redisB.ping()]);

    const config = {
      get: jest.fn((key: string) => runtimeValues[key]),
    } as unknown as ConfigService;
    cipher = new AiqfomeCredentialsService(config);
  });

  afterEach(async () => {
    const ids = [...integrationIds];
    integrationIds.clear();
    if (ids.length === 0) return;

    await Promise.all([
      prismaA.integration.deleteMany({ where: { id: { in: ids } } }),
      redisA.del(...ids.map((id) => `${LOCK_KEY_PREFIX}${id}`)),
    ]);
  });

  afterAll(async () => {
    await Promise.all([
      prismaA?.$disconnect(),
      prismaB?.$disconnect(),
      redisA?.quit(),
      redisB?.quit(),
    ]);
  });

  it('recusa execucao contra banco que nao parece isolado', () => {
    expect(() =>
      assertIsolatedDatabase('postgresql://user:password@localhost:5432/motoboycity_dev'),
    ).toThrow('banco PostgreSQL isolado');
    expect(() =>
      assertIsolatedDatabase('postgresql://user:password@db.example.com:5432/motoboycity_test'),
    ).toThrow('banco PostgreSQL isolado');
  });

  it('faz uma unica chamada externa quando dois workers renovam ao mesmo tempo', async () => {
    const integrationId = await createConnectedIntegration();
    let finishRefresh!: (value: AiqfomeTokenResponse) => void;
    const refreshToken = jest.fn(
      (_currentRefreshToken: string) =>
        new Promise<AiqfomeTokenResponse>((resolve) => {
          finishRefresh = resolve;
        }),
    );
    const serviceA = createTokenService(prismaA, redisA, refreshToken);
    const serviceB = createTokenService(prismaB, redisB, refreshToken);

    const first = serviceA.getAccessToken(integrationId);
    await waitUntil(() => refreshToken.mock.calls.length === 1);
    const second = serviceB.getAccessToken(integrationId);
    finishRefresh(refreshedTokenResponse());

    await expect(Promise.all([first, second])).resolves.toEqual(['new-access', 'new-access']);
    expect(refreshToken).toHaveBeenCalledTimes(1);
    expect(refreshToken).toHaveBeenCalledWith('old-refresh');

    const stored = await prismaA.integrationCredential.findUniqueOrThrow({
      where: { integrationId },
    });
    const opened = cipher.open(integrationId, stored);
    expect(stored.tokenVersion).toBe(2);
    expect(opened).toEqual(
      expect.objectContaining({ accessToken: 'new-access', refreshToken: 'new-refresh' }),
    );
    await expect(redisA.get(`${LOCK_KEY_PREFIX}${integrationId}`)).resolves.toBeNull();
  });

  it('falha fechado se a posse do lock some durante a chamada externa', async () => {
    const integrationId = await createConnectedIntegration();
    let finishRefresh!: (value: AiqfomeTokenResponse) => void;
    const refreshToken = jest.fn(
      (_currentRefreshToken: string) =>
        new Promise<AiqfomeTokenResponse>((resolve) => {
          finishRefresh = resolve;
        }),
    );
    const service = createTokenService(prismaA, redisA, refreshToken);

    const refresh = service.getAccessToken(integrationId);
    await waitUntil(() => refreshToken.mock.calls.length === 1);
    await redisB.del(`${LOCK_KEY_PREFIX}${integrationId}`);
    finishRefresh(refreshedTokenResponse());

    await expect(refresh).rejects.toEqual(
      expect.objectContaining({ code: 'TOKEN_REFRESH_PERSIST_FAILED' }),
    );

    const integration = await prismaA.integration.findUniqueOrThrow({
      where: { id: integrationId },
      include: { credential: true },
    });
    expect(integration.status).toBe('ERROR');
    expect(integration.credential?.tokenVersion).toBe(1);
    expect(integration.credential).not.toBeNull();
    const opened = cipher.open(integrationId, integration.credential!);
    expect(opened).toEqual(
      expect.objectContaining({ accessToken: 'old-access', refreshToken: 'old-refresh' }),
    );
  });

  async function createConnectedIntegration(): Promise<string> {
    const integrationId = randomUUID();
    integrationIds.add(integrationId);
    const config = {
      version: 1,
      dispatchTrigger: 'READY_ORDER',
      acceptedPayment: 'PREPAID_ONLY',
      store: null,
      scopes: requiredScopes,
      errorCode: null,
    };
    const credentials: AiqfomeStoredCredentials = {
      accessToken: 'old-access',
      refreshToken: 'old-refresh',
      tokenType: 'Bearer',
      scope: requiredScopes,
      expiresAt: new Date(Date.now() - 1_000).toISOString(),
    };
    const sealed = cipher.seal(integrationId, credentials);

    await prismaA.integration.create({
      data: {
        id: integrationId,
        publicId: randomUUID(),
        provider: 'AIQFOME',
        status: 'CONNECTED',
        config: config as Prisma.InputJsonValue,
        connectedAt: new Date(),
        lastSyncAt: new Date(),
        credential: {
          create: {
            ...sealed,
            tokenVersion: 1,
          },
        },
      },
    });
    return integrationId;
  }

  function createTokenService(
    prisma: PrismaService,
    redis: Redis,
    refreshToken: jest.Mock<Promise<AiqfomeTokenResponse>, [string]>,
  ): AiqfomeTokenService {
    const client = { refreshToken } as unknown as AiqfomeClient;
    return new AiqfomeTokenService(prisma, client, cipher, redis);
  }
});

function refreshedTokenResponse(): AiqfomeTokenResponse {
  return {
    access_token: 'new-access',
    refresh_token: 'new-refresh',
    token_type: 'Bearer',
    expires_in: 7200,
    scope: requiredScopes.join(' '),
  };
}

async function waitUntil(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('Condition not reached.');
}

function assertIsolatedDatabase(rawUrl: string | undefined): void {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl ?? '');
  } catch {
    throw new Error('Este E2E exige DATABASE_URL de um banco PostgreSQL isolado.');
  }

  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  const isolatedName = /(^|[_-])(ci|e2e|test|isolated)($|[_-])/i.test(databaseName);
  const postgresProtocol = parsed.protocol === 'postgresql:' || parsed.protocol === 'postgres:';
  const loopbackHost = ['localhost', '127.0.0.1', '::1'].includes(parsed.hostname);
  if (process.env['NODE_ENV'] !== 'test' || !postgresProtocol || !loopbackHost || !isolatedName) {
    throw new Error('Este E2E exige DATABASE_URL de um banco PostgreSQL isolado.');
  }
}
