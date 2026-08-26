import { ApiError } from '@motoboycity/api-client';
import { resolveInitialSessionRoute } from '../src/lib/bootstrapSession';

function dependencies(validate: () => Promise<{ id?: unknown }>) {
  return {
    getToken: jest.fn().mockResolvedValue('token'),
    validate: jest.fn(validate),
    rememberUserId: jest.fn().mockResolvedValue(undefined),
    clearToken: jest.fn().mockResolvedValue(undefined),
    stopTracking: jest.fn().mockResolvedValue(undefined),
    deactivatePush: jest.fn().mockResolvedValue(undefined),
    clearNativeSession: jest.fn().mockResolvedValue(undefined),
  };
}

describe('resolveInitialSessionRoute', () => {
  it('persiste a identidade validada para escopar operacoes offline', async () => {
    const deps = dependencies(async () => ({ id: 'driver-user-1' }));

    await expect(resolveInitialSessionRoute(deps)).resolves.toBe('Home');
    expect(deps.rememberUserId).toHaveBeenCalledWith('driver-user-1');
  });

  it('preserva a sessão quando a API está temporariamente indisponível', async () => {
    const deps = dependencies(async () => {
      throw new ApiError(502, { message: 'API indisponível' });
    });

    await expect(resolveInitialSessionRoute(deps)).resolves.toBe('Home');
    expect(deps.clearToken).not.toHaveBeenCalled();
    expect(deps.stopTracking).not.toHaveBeenCalled();
    expect(deps.clearNativeSession).not.toHaveBeenCalled();
  });

  it.each([401, 403])('encerra toda a sessão quando a API responde HTTP %s', async (status) => {
    const deps = dependencies(async () => {
      throw new ApiError(status, { message: 'Sessão inválida' });
    });

    await expect(resolveInitialSessionRoute(deps)).resolves.toBe('Login');
    expect(deps.stopTracking).toHaveBeenCalledTimes(1);
    expect(deps.deactivatePush).toHaveBeenCalledTimes(1);
    expect(deps.clearNativeSession).toHaveBeenCalledTimes(1);
    expect(deps.clearToken).toHaveBeenCalledTimes(1);
  });

  it('abre o login quando não existe token persistido', async () => {
    const deps = dependencies(async () => ({}));
    deps.getToken.mockResolvedValue(null);

    await expect(resolveInitialSessionRoute(deps)).resolves.toBe('Login');
    expect(deps.validate).not.toHaveBeenCalled();
  });
});
