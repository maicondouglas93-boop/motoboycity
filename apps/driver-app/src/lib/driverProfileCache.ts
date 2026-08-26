import type { AuthUser } from '@motoboycity/types';
import { authApi } from './apiClient';

const PROFILE_CACHE_TTL_MS = 5 * 60_000;

type ProfileCacheEntry = {
  token: string;
  profile: AuthUser;
  expiresAt: number;
};

type InFlightProfile = {
  token: string;
  promise: Promise<AuthUser>;
};

let cacheEntry: ProfileCacheEntry | undefined;
let inFlight: InFlightProfile | undefined;
let cacheVersion = 0;

/**
 * Cache somente em memoria e escopado ao token atual. Nao substitui a
 * validacao de sessao no cold start e nunca persiste perfil no aparelho.
 */
export function getDriverProfile(
  token: string,
  options: { force?: boolean } = {},
): Promise<AuthUser> {
  const now = Date.now();
  if (!options.force && cacheEntry?.token === token && cacheEntry.expiresAt > now) {
    return Promise.resolve(cacheEntry.profile);
  }

  if (inFlight?.token === token) return inFlight.promise;

  const requestVersion = cacheVersion;
  let request: Promise<AuthUser>;
  request = authApi
    .me(token)
    .then((profile) => {
      if (
        cacheVersion === requestVersion &&
        inFlight?.token === token &&
        inFlight.promise === request
      ) {
        cacheEntry = {
          token,
          profile,
          expiresAt: Date.now() + PROFILE_CACHE_TTL_MS,
        };
      }
      return profile;
    })
    .finally(() => {
      if (inFlight?.promise === request) inFlight = undefined;
    });

  inFlight = { token, promise: request };
  return request;
}

/** Atualiza o cache depois de login ou alteracao do proprio perfil. */
export function setDriverProfile(token: string, profile: AuthUser): void {
  cacheVersion += 1;
  inFlight = undefined;
  cacheEntry = {
    token,
    profile,
    expiresAt: Date.now() + PROFILE_CACHE_TTL_MS,
  };
}

/** Impede que uma nova sessao reutilize dados da conta anterior. */
export function clearDriverProfile(): void {
  cacheVersion += 1;
  cacheEntry = undefined;
  inFlight = undefined;
}
