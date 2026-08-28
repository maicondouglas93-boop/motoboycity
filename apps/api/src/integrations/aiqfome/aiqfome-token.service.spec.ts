import { PrismaService } from '../../prisma/prisma.service';
import { AiqfomeClient, AiqfomeProviderError } from './aiqfome-client';
import { AiqfomeCredentialsService } from './aiqfome-credentials.service';
import type Redis from 'ioredis';
import type { AiqfomeStoredCredentials, AiqfomeTokenResponse } from './aiqfome.schemas';
import { AiqfomeTokenService } from './aiqfome-token.service';

describe('AiqfomeTokenService', () => {
  const integrationId = '11111111-1111-4111-8111-111111111111';

  function createSubject(expiresAt = new Date(Date.now() + 3_600_000).toISOString()) {
    let integrationStatus: 'CONNECTED' | 'ERROR' = 'CONNECTED';
    let oauthAttemptId: string | null = null;
    let integrationConfig = {
      version: 1,
      dispatchTrigger: 'READY_ORDER',
      acceptedPayment: 'PREPAID_ONLY',
      store: null,
      scopes: ['aqf:store:read', 'aqf:store:create', 'aqf:order:read', 'aqf:order:create'],
      errorCode: null as string | null,
    };
    const payloads = new Map<string, AiqfomeStoredCredentials>([
      [
        'cipher-old',
        {
          accessToken: 'old-access',
          refreshToken: 'old-refresh',
          tokenType: 'Bearer',
          scope: integrationConfig.scopes,
          expiresAt,
        },
      ],
    ]);
    const credentialRecord = {
      integrationId,
      encryptedPayload: 'cipher-old',
      iv: 'old-iv',
      authTag: 'old-auth-tag',
      keyVersion: 1,
      tokenVersion: 1,
      expiresAt: new Date(expiresAt),
    };
    let failNextCredentialUpdate = false;
    let advanceTokenVersionDuringErrorTransition = false;

    const transactionClient = {
      integrationCredential: {
        updateMany: jest.fn(async (input: unknown) => {
          const { where, data } = input as {
            where: { integrationId: string; tokenVersion: number };
            data: Record<string, unknown>;
          };
          if (failNextCredentialUpdate) {
            failNextCredentialUpdate = false;
            throw new Error('database unavailable');
          }
          if (
            where.integrationId !== integrationId ||
            where.tokenVersion !== credentialRecord.tokenVersion
          ) {
            return { count: 0 };
          }
          Object.assign(credentialRecord, data, {
            tokenVersion: credentialRecord.tokenVersion + 1,
          });
          return { count: 1 };
        }),
        findUnique: jest.fn(async () => ({ tokenVersion: credentialRecord.tokenVersion })),
      },
      integration: {
        findUnique: jest.fn(async (input: unknown) => {
          const { select } = input as { select: { status?: boolean } };
          const result = {
            config: integrationConfig,
            status: integrationStatus,
            oauthAttemptId,
          };
          if (select.status && advanceTokenVersionDuringErrorTransition) {
            advanceTokenVersionDuringErrorTransition = false;
            credentialRecord.tokenVersion += 1;
          }
          return result;
        }),
        updateMany: jest.fn(async (input: unknown) => {
          const { where, data } = input as {
            where: {
              status?: 'CONNECTED' | 'ERROR';
              oauthAttemptId?: null;
              credential?: { is?: { tokenVersion?: number } };
            };
            data: {
              status?: 'CONNECTED' | 'ERROR';
              config?: typeof integrationConfig;
            };
          };
          if (where.status && where.status !== integrationStatus) return { count: 0 };
          if (where.oauthAttemptId === null && oauthAttemptId !== null) return { count: 0 };
          if (
            where.credential?.is?.tokenVersion !== undefined &&
            where.credential.is.tokenVersion !== credentialRecord.tokenVersion
          ) {
            return { count: 0 };
          }
          if (data.status) integrationStatus = data.status;
          if (data.config) integrationConfig = data.config;
          return { count: 1 };
        }),
      },
    };
    const prisma = {
      integration: {
        findFirst: jest.fn(async (input: unknown) => {
          const { where } = input as { where: { oauthAttemptId?: null } };
          return integrationStatus === 'CONNECTED' &&
            (where.oauthAttemptId !== null || oauthAttemptId === null)
            ? {
                id: integrationId,
                credential: {
                  encryptedPayload: credentialRecord.encryptedPayload,
                  iv: credentialRecord.iv,
                  authTag: credentialRecord.authTag,
                  keyVersion: credentialRecord.keyVersion,
                  tokenVersion: credentialRecord.tokenVersion,
                },
              }
            : null;
        }),
      },
      $transaction: jest.fn(async (callback: (tx: typeof transactionClient) => unknown) =>
        callback(transactionClient),
      ),
    };
    const client = {
      refreshToken: jest.fn().mockResolvedValue({
        access_token: 'new-access',
        refresh_token: 'new-refresh',
        token_type: 'Bearer',
        expires_in: 7200,
        scope: integrationConfig.scopes.join(' '),
      }),
    };
    const cipher = {
      open: jest.fn((_id: string, sealed: { encryptedPayload: string }) => {
        const payload = payloads.get(sealed.encryptedPayload);
        if (!payload) throw new Error('unknown ciphertext');
        return payload;
      }),
      seal: jest.fn((_id: string, credentials: AiqfomeStoredCredentials) => {
        const encryptedPayload = `cipher-${credentials.accessToken}`;
        payloads.set(encryptedPayload, credentials);
        return {
          encryptedPayload,
          iv: 'new-iv',
          authTag: 'new-auth-tag',
          keyVersion: 1,
          expiresAt: new Date(credentials.expiresAt),
        };
      }),
    };
    const locks = new Map<string, string>();
    const redis = {
      set: jest.fn(async (key: string, owner: string) => {
        if (locks.has(key)) return null;
        locks.set(key, owner);
        return 'OK';
      }),
      eval: jest.fn(async (script: string, _keys: number, key: string, owner: string) => {
        if (script.includes('PEXPIRE')) return locks.get(key) === owner ? 1 : 0;
        if (locks.get(key) !== owner) return 0;
        locks.delete(key);
        return 1;
      }),
      get: jest.fn(async (key: string) => locks.get(key) ?? null),
    };
    const service = new AiqfomeTokenService(
      prisma as unknown as PrismaService,
      client as unknown as AiqfomeClient,
      cipher as unknown as AiqfomeCredentialsService,
      redis as unknown as Redis,
    );

    return {
      service,
      client,
      cipher,
      prisma,
      redis,
      transactionClient,
      credentialRecord,
      getIntegrationStatus: () => integrationStatus,
      getIntegrationConfig: () => integrationConfig,
      failNextUpdate: () => {
        failNextCredentialUpdate = true;
      },
      beginReauthorization: () => {
        oauthAttemptId = 'reauthorization-attempt';
      },
      advanceTokenVersionBeforeErrorUpdate: () => {
        advanceTokenVersionDuringErrorTransition = true;
      },
    };
  }

  it('reutiliza access token ainda valido sem chamar refresh', async () => {
    const { service, client, redis } = createSubject();

    await expect(service.getAccessToken(integrationId)).resolves.toBe('old-access');
    expect(client.refreshToken).not.toHaveBeenCalled();
    expect(redis.set).not.toHaveBeenCalled();
  });

  it('rotaciona access e refresh juntos com fencing por tokenVersion', async () => {
    const { service, client, transactionClient, credentialRecord } = createSubject(
      new Date(Date.now() + 10_000).toISOString(),
    );

    await expect(service.getAccessToken(integrationId)).resolves.toBe('new-access');

    expect(client.refreshToken).toHaveBeenCalledTimes(1);
    expect(client.refreshToken).toHaveBeenCalledWith('old-refresh');
    expect(transactionClient.integrationCredential.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { integrationId, tokenVersion: 1 },
        data: expect.objectContaining({ tokenVersion: { increment: 1 } }),
      }),
    );
    expect(credentialRecord.tokenVersion).toBe(2);
  });

  it('faz uma unica renovacao quando dois workers disputam o token expirado', async () => {
    const { service, client } = createSubject(new Date(Date.now() - 1_000).toISOString());
    let finishRefresh!: (value: AiqfomeTokenResponse) => void;
    client.refreshToken.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishRefresh = resolve;
        }),
    );

    const first = service.getAccessToken(integrationId);
    await waitUntil(() => client.refreshToken.mock.calls.length === 1);
    const second = service.getAccessToken(integrationId);
    finishRefresh({
      access_token: 'new-access',
      refresh_token: 'new-refresh',
      token_type: 'Bearer',
      expires_in: 7200,
      scope: 'aqf:store:read aqf:store:create aqf:order:read aqf:order:create',
    });

    await expect(Promise.all([first, second])).resolves.toEqual(['new-access', 'new-access']);
    expect(client.refreshToken).toHaveBeenCalledTimes(1);
  });

  it('renova e repete uma unica vez quando a API responde 401', async () => {
    const { service, client } = createSubject();
    const operation = jest
      .fn()
      .mockRejectedValueOnce(new AiqfomeProviderError('UNAUTHORIZED', 401))
      .mockResolvedValueOnce('ok');

    await expect(service.executeWithAccessToken(integrationId, operation)).resolves.toBe('ok');

    expect(client.refreshToken).toHaveBeenCalledTimes(1);
    expect(operation).toHaveBeenNthCalledWith(1, 'old-access');
    expect(operation).toHaveBeenNthCalledWith(2, 'new-access');
  });

  it('marca a conexao se a API rejeita tambem o token recem-renovado', async () => {
    const { service, client, getIntegrationStatus, getIntegrationConfig } = createSubject();
    const operation = jest
      .fn()
      .mockRejectedValueOnce(new AiqfomeProviderError('UNAUTHORIZED', 401))
      .mockRejectedValueOnce(new AiqfomeProviderError('UNAUTHORIZED', 401));

    await expect(service.executeWithAccessToken(integrationId, operation)).rejects.toEqual(
      expect.objectContaining({ httpStatus: 401 }),
    );

    expect(client.refreshToken).toHaveBeenCalledTimes(1);
    expect(operation).toHaveBeenCalledTimes(2);
    expect(getIntegrationStatus()).toBe('ERROR');
    expect(getIntegrationConfig().errorCode).toBe('TOKEN_REJECTED_AFTER_REFRESH');
  });

  it('nao marca como erro uma nova autorizacao concluida durante o segundo 401', async () => {
    const {
      service,
      advanceTokenVersionBeforeErrorUpdate,
      getIntegrationStatus,
      getIntegrationConfig,
    } = createSubject();
    const operation = jest
      .fn()
      .mockRejectedValueOnce(new AiqfomeProviderError('UNAUTHORIZED', 401))
      .mockRejectedValueOnce(new AiqfomeProviderError('UNAUTHORIZED', 401));
    advanceTokenVersionBeforeErrorUpdate();

    await expect(service.executeWithAccessToken(integrationId, operation)).rejects.toEqual(
      expect.objectContaining({ httpStatus: 401 }),
    );

    expect(getIntegrationStatus()).toBe('CONNECTED');
    expect(getIntegrationConfig().errorCode).toBeNull();
  });

  it('marca a conexao para nova autorizacao quando o refresh e rejeitado', async () => {
    const { service, client, getIntegrationStatus, getIntegrationConfig, credentialRecord } =
      createSubject(new Date(Date.now() - 1_000).toISOString());
    client.refreshToken.mockRejectedValueOnce(
      new AiqfomeProviderError('TOKEN_REFRESH_FAILED', 401),
    );

    await expect(service.getAccessToken(integrationId)).rejects.toEqual(
      expect.objectContaining({ code: 'TOKEN_REFRESH_FAILED' }),
    );

    expect(getIntegrationStatus()).toBe('ERROR');
    expect(getIntegrationConfig().errorCode).toBe('TOKEN_REFRESH_FAILED');
    expect(credentialRecord.encryptedPayload).toBe('cipher-old');
  });

  it('nao desativa a conexao por falha transitoria do provedor', async () => {
    const { service, client, getIntegrationStatus } = createSubject(
      new Date(Date.now() - 1_000).toISOString(),
    );
    client.refreshToken.mockRejectedValueOnce(
      new AiqfomeProviderError('TOKEN_REFRESH_FAILED', 503),
    );

    await expect(service.getAccessToken(integrationId)).rejects.toEqual(
      expect.objectContaining({ httpStatus: 503 }),
    );
    expect(getIntegrationStatus()).toBe('CONNECTED');
  });

  it('bloqueia reutilizacao do refresh antigo se o novo par nao puder ser persistido', async () => {
    const { service, failNextUpdate, getIntegrationStatus, getIntegrationConfig } = createSubject(
      new Date(Date.now() - 1_000).toISOString(),
    );
    failNextUpdate();

    await expect(service.getAccessToken(integrationId)).rejects.toEqual(
      expect.objectContaining({ code: 'TOKEN_REFRESH_PERSIST_FAILED' }),
    );
    expect(getIntegrationStatus()).toBe('ERROR');
    expect(getIntegrationConfig().errorCode).toBe('TOKEN_REFRESH_PERSIST_FAILED');
  });

  it('bloqueia o refresh enquanto existe uma reautorizacao pendente', async () => {
    const { service, client, beginReauthorization } = createSubject(
      new Date(Date.now() - 1_000).toISOString(),
    );
    beginReauthorization();

    await expect(service.getAccessToken(integrationId)).rejects.toEqual(
      expect.objectContaining({ code: 'INTEGRATION_NOT_CONNECTED' }),
    );
    expect(client.refreshToken).not.toHaveBeenCalled();
  });

  it('rejeita e invalida um refresh que perdeu escopos obrigatorios', async () => {
    const { service, client, getIntegrationStatus, getIntegrationConfig } = createSubject(
      new Date(Date.now() - 1_000).toISOString(),
    );
    client.refreshToken.mockResolvedValueOnce({
      access_token: 'new-access',
      refresh_token: 'new-refresh',
      token_type: 'Bearer',
      expires_in: 7200,
      scope: 'aqf:store:read aqf:order:read',
    });

    await expect(service.getAccessToken(integrationId)).rejects.toEqual(
      expect.objectContaining({ code: 'INSUFFICIENT_SCOPE' }),
    );
    expect(getIntegrationStatus()).toBe('ERROR');
    expect(getIntegrationConfig().errorCode).toBe('INSUFFICIENT_SCOPE');
  });

  it('marca erro se a cifra falha depois que o provedor rotaciona o token', async () => {
    const { service, cipher, getIntegrationStatus, getIntegrationConfig } = createSubject(
      new Date(Date.now() - 1_000).toISOString(),
    );
    cipher.seal.mockImplementationOnce(() => {
      throw new Error('cipher unavailable');
    });

    await expect(service.getAccessToken(integrationId)).rejects.toEqual(
      expect.objectContaining({ code: 'TOKEN_REFRESH_PERSIST_FAILED' }),
    );
    expect(getIntegrationStatus()).toBe('ERROR');
    expect(getIntegrationConfig().errorCode).toBe('TOKEN_REFRESH_PERSIST_FAILED');
  });

  it('falha fechado sem chamar o provedor quando perde a posse do lock', async () => {
    const { service, client, redis } = createSubject(new Date(Date.now() - 1_000).toISOString());
    redis.get.mockResolvedValueOnce(null);

    await expect(service.getAccessToken(integrationId)).rejects.toEqual(
      expect.objectContaining({ code: 'TOKEN_REFRESH_LOCK_LOST', httpStatus: 503 }),
    );
    expect(client.refreshToken).not.toHaveBeenCalled();
  });

  it('nao reutiliza o refresh se o fencing do banco rejeita a persistencia', async () => {
    const { service, transactionClient, getIntegrationStatus, getIntegrationConfig } =
      createSubject(new Date(Date.now() - 1_000).toISOString());
    transactionClient.integrationCredential.updateMany.mockResolvedValueOnce({ count: 0 });

    await expect(service.getAccessToken(integrationId)).rejects.toEqual(
      expect.objectContaining({ code: 'TOKEN_REFRESH_PERSIST_FAILED' }),
    );
    expect(getIntegrationStatus()).toBe('ERROR');
    expect(getIntegrationConfig().errorCode).toBe('TOKEN_REFRESH_PERSIST_FAILED');
  });
});

async function waitUntil(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error('condition not reached');
}
