import { ApiError } from '@motoboycity/api-client';
import {
  isTransientPresenceError,
  restoreDesiredPresence,
  type PresencePersistenceDependencies,
} from '../src/lib/presencePersistence';

function dependencies(
  overrides: Partial<PresencePersistenceDependencies> = {},
): PresencePersistenceDependencies {
  return {
    captureLocation: jest.fn().mockResolvedValue({ lat: -20.15, lng: -41.62, accuracy: 10 }),
    startTracking: jest.fn().mockResolvedValue(undefined),
    stopTracking: jest.fn().mockResolvedValue(undefined),
    activate: jest.fn().mockResolvedValue({ availability: 'AVAILABLE', since: '2026-08-28' }),
    ...overrides,
  };
}

describe('persistencia da presenca do motoboy', () => {
  it('mantem o rastreamento quando a presenca ja continua valida', async () => {
    const deps = dependencies();
    const current = { availability: 'AVAILABLE' as const, since: '2026-08-28' };

    await expect(restoreDesiredPresence(current, deps)).resolves.toEqual(current);
    expect(deps.startTracking).toHaveBeenCalledTimes(1);
    expect(deps.captureLocation).not.toHaveBeenCalled();
    expect(deps.activate).not.toHaveBeenCalled();
  });

  it('reativa automaticamente a presenca que expirou durante a queda de sinal', async () => {
    const deps = dependencies();

    await expect(
      restoreDesiredPresence({ availability: 'UNAVAILABLE', since: null }, deps),
    ).resolves.toEqual({ availability: 'AVAILABLE', since: '2026-08-28' });
    expect(deps.startTracking).toHaveBeenCalledTimes(1);
    expect(deps.activate).toHaveBeenCalledWith({ lat: -20.15, lng: -41.62, accuracy: 10 });
  });

  it('mantem o servico vivo em falha transitoria para tentar novamente', async () => {
    const networkError = new TypeError('Network request failed');
    const deps = dependencies({ activate: jest.fn().mockRejectedValue(networkError) });

    await expect(restoreDesiredPresence(null, deps)).rejects.toBe(networkError);
    expect(deps.stopTracking).not.toHaveBeenCalled();
  });

  it('encerra o servico quando a sessao ou a conta recusam a reativacao', async () => {
    const forbidden = new ApiError(403, { message: 'Conta bloqueada' });
    const deps = dependencies({ activate: jest.fn().mockRejectedValue(forbidden) });

    await expect(restoreDesiredPresence(null, deps)).rejects.toBe(forbidden);
    expect(deps.stopTracking).toHaveBeenCalledTimes(1);
  });

  it('classifica apenas rede, limite e servidor como falhas transitorias', () => {
    expect(isTransientPresenceError(new TypeError('Network request failed'))).toBe(true);
    expect(isTransientPresenceError(new ApiError(429, null))).toBe(true);
    expect(isTransientPresenceError(new ApiError(503, null))).toBe(true);
    expect(isTransientPresenceError(new ApiError(403, null))).toBe(false);
  });
});
