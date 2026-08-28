import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import type Redis from 'ioredis';
import { PrismaService } from '../../prisma/prisma.service';
import { AiqfomeClient, AiqfomeProviderError } from './aiqfome-client';
import { hasRequiredAiqfomeScopes } from './aiqfome.config';
import { AiqfomeCredentialsService } from './aiqfome-credentials.service';
import { AIQFOME_REDIS } from './aiqfome-oauth-state.service';
import { parseAiqfomeIntegrationConfig, type AiqfomeStoredCredentials } from './aiqfome.schemas';

const REFRESH_WINDOW_MS = 60_000;
const LOCK_TTL_MS = 60_000;
const LOCK_RENEW_MS = 10_000;
const LOCK_WAIT_MS = 20_000;
const LOCK_RETRY_MS = 50;
const LOCK_KEY_PREFIX = 'motoboycity:aiqfome:token-refresh:';

const RELEASE_LOCK_SCRIPT = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
end
return 0
`;

const RENEW_LOCK_SCRIPT = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('PEXPIRE', KEYS[1], ARGV[2])
end
return 0
`;

interface LoadedToken {
  integrationId: string;
  tokenVersion: number;
  credentials: AiqfomeStoredCredentials;
}

interface TokenLockLease {
  assertOwned(): Promise<void>;
}

@Injectable()
export class AiqfomeTokenService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly client: AiqfomeClient,
    private readonly credentialCipher: AiqfomeCredentialsService,
    @Inject(AIQFOME_REDIS) private readonly redis: Redis,
  ) {}

  async getAccessToken(integrationId: string): Promise<string> {
    return (await this.resolveToken(integrationId, false)).credentials.accessToken;
  }

  async executeWithAccessToken<T>(
    integrationId: string,
    operation: (accessToken: string) => Promise<T>,
  ): Promise<T> {
    const initial = await this.resolveToken(integrationId, false);

    try {
      return await operation(initial.credentials.accessToken);
    } catch (error) {
      if (!(error instanceof AiqfomeProviderError) || error.httpStatus !== 401) {
        throw error;
      }
    }

    const refreshed = await this.resolveToken(
      integrationId,
      true,
      initial.tokenVersion,
      initial.credentials.accessToken,
    );
    try {
      return await operation(refreshed.credentials.accessToken);
    } catch (error) {
      if (error instanceof AiqfomeProviderError && error.httpStatus === 401) {
        await this.markRefreshError(
          refreshed.integrationId,
          refreshed.tokenVersion,
          'TOKEN_REJECTED_AFTER_REFRESH',
        ).catch(() => undefined);
      }
      throw error;
    }
  }

  async runExclusive<T>(integrationId: string, operation: () => Promise<T>): Promise<T> {
    return this.withRefreshLock(integrationId, async (lease) => {
      await lease.assertOwned();
      const result = await operation();
      await lease.assertOwned();
      return result;
    });
  }

  private async resolveToken(
    integrationId: string,
    forceRefresh: boolean,
    observedVersion?: number,
    observedAccessToken?: string,
  ): Promise<LoadedToken> {
    const initial = await this.loadToken(integrationId);
    if (!forceRefresh && !isExpiring(initial.credentials.expiresAt)) return initial;

    return this.withRefreshLock(integrationId, async (lease) => {
      await lease.assertOwned();
      const current = await this.loadToken(integrationId);
      const anotherWorkerRefreshed =
        forceRefresh &&
        (current.tokenVersion !== observedVersion ||
          current.credentials.accessToken !== observedAccessToken);

      if (anotherWorkerRefreshed || (!forceRefresh && !isExpiring(current.credentials.expiresAt))) {
        return current;
      }

      return this.refreshCurrent(current, lease);
    });
  }

  private async loadToken(integrationId: string): Promise<LoadedToken> {
    const integration = await this.prisma.integration.findFirst({
      where: {
        id: integrationId,
        provider: 'AIQFOME',
        status: 'CONNECTED',
        oauthAttemptId: null,
      },
      select: {
        id: true,
        credential: {
          select: {
            encryptedPayload: true,
            iv: true,
            authTag: true,
            keyVersion: true,
            tokenVersion: true,
          },
        },
      },
    });

    if (!integration?.credential) {
      throw new AiqfomeProviderError('INTEGRATION_NOT_CONNECTED');
    }

    return {
      integrationId: integration.id,
      tokenVersion: integration.credential.tokenVersion,
      credentials: this.credentialCipher.open(integration.id, integration.credential),
    };
  }

  private async refreshCurrent(current: LoadedToken, lease: TokenLockLease): Promise<LoadedToken> {
    await lease.assertOwned();
    let refreshed;
    try {
      refreshed = await this.client.refreshToken(current.credentials.refreshToken);
    } catch (error) {
      if (isPermanentRefreshFailure(error)) {
        await this.markRefreshError(
          current.integrationId,
          current.tokenVersion,
          'TOKEN_REFRESH_FAILED',
        );
      }
      throw error;
    }

    try {
      await lease.assertOwned();
      const scopes = refreshed.scope.split(/\s+/).filter(Boolean);
      if (!hasRequiredAiqfomeScopes(scopes)) {
        throw new AiqfomeProviderError('INSUFFICIENT_SCOPE');
      }
      const expiresAt = new Date(Date.now() + refreshed.expires_in * 1000);
      const sealed = this.credentialCipher.seal(current.integrationId, {
        accessToken: refreshed.access_token,
        refreshToken: refreshed.refresh_token,
        tokenType: refreshed.token_type,
        scope: scopes,
        expiresAt: expiresAt.toISOString(),
      });
      await lease.assertOwned();

      await this.prisma.$transaction(async (tx) => {
        const credential = await tx.integrationCredential.updateMany({
          where: {
            integrationId: current.integrationId,
            tokenVersion: current.tokenVersion,
          },
          data: {
            ...sealed,
            tokenVersion: { increment: 1 },
          },
        });
        if (credential.count !== 1) {
          throw new AiqfomeProviderError('TOKEN_REFRESH_STALE', 409);
        }

        const integration = await tx.integration.findUnique({
          where: { id: current.integrationId },
          select: { config: true },
        });
        const config = {
          ...parseAiqfomeIntegrationConfig(integration?.config),
          errorCode: null,
        };
        const connection = await tx.integration.updateMany({
          where: {
            id: current.integrationId,
            provider: 'AIQFOME',
            status: 'CONNECTED',
            oauthAttemptId: null,
          },
          data: {
            config: config as Prisma.InputJsonValue,
            lastSyncAt: new Date(),
          },
        });
        if (connection.count !== 1) {
          throw new AiqfomeProviderError('INTEGRATION_NOT_CONNECTED');
        }
      });

      return this.loadToken(current.integrationId);
    } catch (error) {
      const errorCode =
        error instanceof AiqfomeProviderError && error.code === 'INSUFFICIENT_SCOPE'
          ? 'INSUFFICIENT_SCOPE'
          : 'TOKEN_REFRESH_PERSIST_FAILED';
      await this.markRefreshError(current.integrationId, current.tokenVersion, errorCode).catch(
        () => undefined,
      );
      if (errorCode === 'INSUFFICIENT_SCOPE') throw error;
      throw new AiqfomeProviderError('TOKEN_REFRESH_PERSIST_FAILED');
    }
  }

  private async markRefreshError(
    integrationId: string,
    expectedTokenVersion: number,
    errorCode: string,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const credential = await tx.integrationCredential.findUnique({
        where: { integrationId },
        select: { tokenVersion: true },
      });
      if (!credential || credential.tokenVersion !== expectedTokenVersion) return;

      const integration = await tx.integration.findUnique({
        where: { id: integrationId },
        select: { config: true, status: true, oauthAttemptId: true },
      });
      if (
        !integration ||
        integration.status !== 'CONNECTED' ||
        integration.oauthAttemptId !== null
      ) {
        return;
      }

      const config = {
        ...parseAiqfomeIntegrationConfig(integration.config),
        errorCode,
      };
      await tx.integration.updateMany({
        where: {
          id: integrationId,
          provider: 'AIQFOME',
          status: 'CONNECTED',
          oauthAttemptId: null,
          credential: { is: { tokenVersion: expectedTokenVersion } },
        },
        data: {
          status: 'ERROR',
          config: config as Prisma.InputJsonValue,
        },
      });
    });
  }

  private async withRefreshLock<T>(
    integrationId: string,
    operation: (lease: TokenLockLease) => Promise<T>,
  ): Promise<T> {
    const key = `${LOCK_KEY_PREFIX}${integrationId}`;
    const owner = randomUUID();
    const deadline = Date.now() + LOCK_WAIT_MS;

    while ((await this.redis.set(key, owner, 'PX', LOCK_TTL_MS, 'NX')) !== 'OK') {
      if (Date.now() >= deadline) {
        throw new AiqfomeProviderError('TOKEN_REFRESH_BUSY', 503);
      }
      await delay(LOCK_RETRY_MS);
    }

    let leaseLost = false;
    let renewalInFlight = false;
    const renew = async () => {
      if (leaseLost || renewalInFlight) return;
      renewalInFlight = true;
      try {
        const result = await this.redis.eval(RENEW_LOCK_SCRIPT, 1, key, owner, String(LOCK_TTL_MS));
        if (Number(result) !== 1) leaseLost = true;
      } catch {
        leaseLost = true;
      } finally {
        renewalInFlight = false;
      }
    };
    const renewal = setInterval(() => {
      void renew();
    }, LOCK_RENEW_MS);
    renewal.unref();

    const lease: TokenLockLease = {
      assertOwned: async () => {
        if (leaseLost) throw new AiqfomeProviderError('TOKEN_REFRESH_LOCK_LOST', 503);
        try {
          if ((await this.redis.get(key)) !== owner) {
            leaseLost = true;
          }
        } catch {
          leaseLost = true;
        }
        if (leaseLost) throw new AiqfomeProviderError('TOKEN_REFRESH_LOCK_LOST', 503);
      },
    };

    try {
      return await operation(lease);
    } finally {
      clearInterval(renewal);
      await this.redis.eval(RELEASE_LOCK_SCRIPT, 1, key, owner).catch(() => undefined);
    }
  }
}

function isExpiring(expiresAt: string): boolean {
  return new Date(expiresAt).getTime() <= Date.now() + REFRESH_WINDOW_MS;
}

function isPermanentRefreshFailure(error: unknown): boolean {
  if (!(error instanceof AiqfomeProviderError)) return false;
  if (error.httpStatus === 429 || (error.httpStatus !== undefined && error.httpStatus >= 500)) {
    return false;
  }
  return error.httpStatus !== undefined || error.code.endsWith('_INVALID_RESPONSE');
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
