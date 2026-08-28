import { randomBytes } from 'node:crypto';
import { Inject, Injectable, OnModuleDestroy, ServiceUnavailableException } from '@nestjs/common';
import type Redis from 'ioredis';
import { aiqfomeOauthStateSchema, type AiqfomeOauthState } from './aiqfome.schemas';

export const AIQFOME_REDIS = Symbol('AIQFOME_REDIS');

const STATE_TTL_SECONDS = 10 * 60;
const STATE_KEY_PREFIX = 'motoboycity:aiqfome:oauth-state:';
const CONSUME_STATE_SCRIPT = `
local value = redis.call('GET', KEYS[1])
if value then
  redis.call('DEL', KEYS[1])
end
return value
`;

@Injectable()
export class AiqfomeOAuthStateService implements OnModuleDestroy {
  constructor(@Inject(AIQFOME_REDIS) private readonly redis: Redis) {}

  async create(input: Omit<AiqfomeOauthState, 'createdAt'>): Promise<string> {
    const value = JSON.stringify({ ...input, createdAt: new Date().toISOString() });

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const state = randomBytes(32).toString('base64url');
      const stored = await this.redis.set(
        `${STATE_KEY_PREFIX}${state}`,
        value,
        'EX',
        STATE_TTL_SECONDS,
        'NX',
      );
      if (stored === 'OK') return state;
    }

    throw new ServiceUnavailableException('Não foi possível iniciar a conexão com o aiqfome.');
  }

  async consume(state: string): Promise<AiqfomeOauthState | null> {
    if (!/^[A-Za-z0-9_-]{32,128}$/.test(state)) return null;

    const raw = await this.redis.eval(CONSUME_STATE_SCRIPT, 1, `${STATE_KEY_PREFIX}${state}`);
    if (typeof raw !== 'string') return null;

    try {
      return aiqfomeOauthStateSchema.parse(JSON.parse(raw) as unknown);
    } catch {
      return null;
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis.quit();
  }
}
