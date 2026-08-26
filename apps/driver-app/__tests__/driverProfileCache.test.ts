import type { AuthUser } from '@motoboycity/types';
import { authApi } from '../src/lib/apiClient';
import {
  clearDriverProfile,
  getDriverProfile,
  setDriverProfile,
} from '../src/lib/driverProfileCache';

jest.mock('../src/lib/apiClient', () => ({
  authApi: { me: jest.fn() },
}));

const profile = (name: string): AuthUser =>
  ({
    id: `id-${name}`,
    name,
    email: `${name}@example.com`,
    type: 'DRIVER',
  }) as AuthUser;

const me = authApi.me as jest.MockedFunction<typeof authApi.me>;

describe('driverProfileCache', () => {
  let now = 1_000;

  beforeEach(() => {
    clearDriverProfile();
    me.mockReset();
    now = 1_000;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('reutiliza o perfil dentro do TTL e consulta novamente depois de expirar', async () => {
    me.mockResolvedValueOnce(profile('primeiro')).mockResolvedValueOnce(profile('segundo'));

    await expect(getDriverProfile('token')).resolves.toMatchObject({ name: 'primeiro' });
    await expect(getDriverProfile('token')).resolves.toMatchObject({ name: 'primeiro' });
    expect(me).toHaveBeenCalledTimes(1);

    now += 5 * 60_000 + 1;
    await expect(getDriverProfile('token')).resolves.toMatchObject({ name: 'segundo' });
    expect(me).toHaveBeenCalledTimes(2);
  });

  it('deduplica chamadas concorrentes da mesma sessao', async () => {
    let resolveRequest: ((value: AuthUser) => void) | undefined;
    me.mockImplementationOnce(
      () =>
        new Promise<AuthUser>((resolve) => {
          resolveRequest = resolve;
        }),
    );

    const first = getDriverProfile('token');
    const second = getDriverProfile('token');
    expect(second).toBe(first);
    expect(me).toHaveBeenCalledTimes(1);

    resolveRequest?.(profile('concorrente'));
    await expect(first).resolves.toMatchObject({ name: 'concorrente' });
  });

  it('permite forcar uma atualizacao sem duplicar request ja em andamento', async () => {
    me.mockResolvedValueOnce(profile('antigo')).mockResolvedValueOnce(profile('novo'));
    await getDriverProfile('token');

    await expect(getDriverProfile('token', { force: true })).resolves.toMatchObject({
      name: 'novo',
    });
    expect(me).toHaveBeenCalledTimes(2);
  });

  it('limpa dados entre sessoes e nunca reaproveita perfil de outro token', async () => {
    me.mockResolvedValueOnce(profile('um')).mockResolvedValueOnce(profile('dois'));
    await getDriverProfile('token-um');
    clearDriverProfile();

    await expect(getDriverProfile('token-dois')).resolves.toMatchObject({ name: 'dois' });
    expect(me).toHaveBeenCalledTimes(2);
  });

  it('aceita o perfil mais novo recebido por login ou upload', async () => {
    setDriverProfile('token', profile('atualizado'));

    await expect(getDriverProfile('token')).resolves.toMatchObject({ name: 'atualizado' });
    expect(me).not.toHaveBeenCalled();
  });
});
