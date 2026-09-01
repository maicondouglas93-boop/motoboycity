import { HealthService } from './health.service';

describe('HealthService', () => {
  const originalTimeout = process.env['READINESS_TIMEOUT_MS'];

  afterEach(() => {
    jest.useRealTimers();
    if (originalTimeout === undefined) delete process.env['READINESS_TIMEOUT_MS'];
    else process.env['READINESS_TIMEOUT_MS'] = originalTimeout;
  });

  function service(input?: { postgres?: Promise<unknown>; redis?: Promise<unknown> }) {
    const prisma = {
      $queryRaw: jest.fn().mockReturnValue(input?.postgres ?? Promise.resolve([1])),
    };
    const livePresence = {
      ping: jest.fn().mockReturnValue(input?.redis ?? Promise.resolve()),
    };
    return new HealthService(prisma as never, livePresence as never);
  }

  it('fica pronto somente quando Postgres e Redis respondem', async () => {
    await expect(service().ready()).resolves.toEqual({
      status: 'ready',
      checks: { postgres: 'ok', redis: 'ok' },
    });
  });

  it('informa dependencias indisponiveis sem expor o erro interno', async () => {
    await expect(
      service({ postgres: Promise.reject(new Error('host secreto')), redis: Promise.resolve() }).ready(),
    ).resolves.toEqual({
      status: 'not_ready',
      checks: { postgres: 'error', redis: 'ok' },
    });
  });

  it('limita o tempo de uma dependencia que nao responde', async () => {
    process.env['READINESS_TIMEOUT_MS'] = '10';
    const result = await service({ postgres: new Promise(() => undefined) }).ready();
    expect(result).toEqual({
      status: 'not_ready',
      checks: { postgres: 'error', redis: 'ok' },
    });
  });
});
