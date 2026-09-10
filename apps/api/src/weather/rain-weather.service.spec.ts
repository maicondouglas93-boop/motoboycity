import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { RainWeatherService } from './rain-weather.service';
import { LAJINHA, RAIN_MAX_AGE_MS, RAIN_POLL_MS } from './rain-policy';

jest.mock('ioredis', () => ({ __esModule: true, default: jest.fn() }));
const id = 'c64a8a14-1d71-45bd-a05d-ed11e005ee26';
const start = Date.parse('2026-09-10T15:00:00Z');
const stateKey = `motoboycity:rain:lajinha:v1:${id}`;
const lockKey = `${stateKey}:poll`;

describe('RainWeatherService', () => {
  let services: RainWeatherService[];
  let values: Map<string, string>;
  let expires: Map<string, number>;
  let redis: {
    on: jest.Mock;
    connect: jest.Mock;
    disconnect: jest.Mock;
    get: jest.Mock;
    set: jest.Mock;
    eval: jest.Mock;
  };
  let fetchMock: jest.SpiedFunction<typeof fetch>;

  function response(at = Date.now(), rain = 1, code = 61) {
    return {
      ok: true,
      text: async () =>
        JSON.stringify({
          ...LAJINHA,
          current_units: { time: 'unixtime', rain: 'mm', showers: 'mm' },
          current: { time: at / 1000, rain, showers: 0, weather_code: code },
        }),
    } as Response;
  }

  function create(overrides: Record<string, string | undefined> = {}) {
    const service = new RainWeatherService(
      new ConfigService({
        OPEN_METEO_RAIN_ENABLED: 'true',
        OPEN_METEO_API_KEY: 'test-secret-never-log',
        OPEN_METEO_RAIN_SURCHARGE_ID: id,
        ...overrides,
      }),
    );
    services.push(service);
    return service;
  }
  async function boot(service: RainWeatherService) {
    service.onModuleInit();
    await new Promise(setImmediate);
  }

  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick'] });
    jest.setSystemTime(start);
    services = [];
    values = new Map();
    expires = new Map();
    redis = {
      on: jest.fn(),
      connect: jest.fn().mockResolvedValue(undefined),
      disconnect: jest.fn(),
      get: jest.fn(async (key: string) => values.get(key) ?? null),
      set: jest.fn(async (key: string, value: string, _px: string, ttl: number) => {
        if ((expires.get(key) ?? 0) > Date.now()) return null;
        values.set(key, value);
        expires.set(key, Date.now() + ttl);
        return 'OK';
      }),
      eval: jest.fn(
        async (
          _lua: string,
          _n: number,
          lock: string,
          target: string,
          owner: string,
          value: string,
        ) => {
          if (values.get(lock) !== owner) return 0;
          values.set(target, value);
          return 1;
        },
      ),
    };
    (Redis as unknown as jest.Mock).mockImplementation(() => redis);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    fetchMock = jest.spyOn(globalThis, 'fetch').mockImplementation(async () => response());
  });

  afterEach(() => {
    services.forEach((service) => service.onModuleDestroy());
    jest.restoreAllMocks();
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  it.each([
    { OPEN_METEO_RAIN_ENABLED: 'false' },
    { OPEN_METEO_RAIN_SURCHARGE_ID: '' },
    { OPEN_METEO_RAIN_SURCHARGE_ID: 'invalid' },
  ])('desativado/incompleto não acessa Redis nem clima (%#)', async (overrides) => {
    await boot(create(overrides));
    expect(Redis).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('consulta só o endpoint comercial, usando as coordenadas verificadas e timeout', async () => {
    const service = create();
    await boot(service);
    const url = fetchMock.mock.calls[0]![0] as URL;
    expect(url.origin).toBe('https://customer-api.open-meteo.com');
    expect(url.searchParams.get('latitude')).toBe(String(LAJINHA.latitude));
    expect(url.searchParams.get('longitude')).toBe(String(LAJINHA.longitude));
    expect(url.searchParams.get('current')).toBe('rain,showers,weather_code');
    expect(fetchMock.mock.calls[0]![1]).toMatchObject({
      redirect: 'error',
      signal: expect.any(AbortSignal),
    });
    expect(service.forSurcharge(id)).toMatchObject({ status: 'RAINING', activeNow: true });
    expect(JSON.stringify(service.forSurcharge(id))).not.toContain('test-secret');
    expect(service.forSurcharge('outra-taxa')).toBeNull();
  });

  it('funciona sem chave pelo endpoint público e não faz chamada de geocoding', async () => {
    const service = create({ OPEN_METEO_API_KEY: '' });
    await boot(service);
    const url = fetchMock.mock.calls[0]![0] as URL;
    expect(url.origin).toBe('https://api.open-meteo.com');
    expect(url.pathname).toBe('/v1/forecast');
    expect(url.searchParams.has('apikey')).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(service.forSurcharge(id)).toMatchObject({ activeNow: true, accessMode: 'PUBLIC' });
  });

  it('chave comercial recusada não provoca fallback silencioso para o endpoint público', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 401 } as Response);
    const service = create();
    await boot(service);
    expect(service.forSurcharge(id)?.activeNow).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect((fetchMock.mock.calls[0]![0] as URL).hostname).toBe('customer-api.open-meteo.com');
  });

  it('cotações e lista do ADM não provocam I/O; duas instâncias compartilham a consulta', async () => {
    const first = create();
    await boot(first);
    const second = create();
    await boot(second);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const reads = redis.get.mock.calls.length;
    for (let i = 0; i < 100; i++) expect(second.forSurcharge(id)?.activeNow).toBe(true);
    expect(redis.get).toHaveBeenCalledTimes(reads);
    jest.setSystemTime(start + RAIN_POLL_MS);
    await Promise.all([first.refresh(), first.refresh(), second.refresh()]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('restaura após reinício sem perder o início dos trinta minutos secos', async () => {
    const first = create();
    await boot(first);
    jest.setSystemTime(start + 15 * 60_000);
    fetchMock.mockResolvedValue(response(Date.now(), 0, 0));
    await first.refresh();
    const drySince = first.forSurcharge(id)?.drySince;
    expect(first.forSurcharge(id)?.status).toBe('DRYING');
    first.onModuleDestroy();
    const second = create();
    await boot(second);
    expect(second.forSurcharge(id)?.drySince).toBe(drySince);
    jest.setSystemTime(start + 30 * 60_000);
    fetchMock.mockResolvedValue(response(Date.now(), 0, 0));
    await second.refresh();
    jest.setSystemTime(start + 45 * 60_000);
    expect(second.forSurcharge(id)).toMatchObject({ status: 'DRY', activeNow: false });
  });

  it.each(['timeout', 'http', 'invalid'])(
    'falha %s não ativa, não vaza chave e não trava a API',
    async (kind) => {
      if (kind === 'timeout') fetchMock.mockRejectedValue(new Error('test-secret-never-log'));
      if (kind === 'http') fetchMock.mockResolvedValue({ ok: false } as Response);
      if (kind === 'invalid')
        fetchMock.mockResolvedValue({ ok: true, text: async () => '{}' } as Response);
      const service = create();
      await boot(service);
      expect(service.forSurcharge(id)).toMatchObject({ status: 'UNAVAILABLE', activeNow: false });
      expect(JSON.stringify((Logger.prototype.warn as jest.Mock).mock.calls)).not.toContain(
        'test-secret',
      );
      await service.refresh();
      expect(fetchMock).toHaveBeenCalledTimes(1);
      jest.setSystemTime(start + RAIN_POLL_MS);
      fetchMock.mockResolvedValue(response());
      await service.refresh();
      expect(service.forSurcharge(id)?.activeNow).toBe(true);
    },
  );

  it('clima antigo expira mesmo com Redis indisponível; não renova por consulta repetida', async () => {
    const service = create();
    await boot(service);
    redis.get.mockRejectedValue(new Error('redis offline'));
    jest.setSystemTime(start + 5 * 60_000);
    await service.refresh();
    expect(service.forSurcharge(id)?.activeNow).toBe(true);
    jest.setSystemTime(start + RAIN_MAX_AGE_MS);
    expect(service.forSurcharge(id)).toMatchObject({ status: 'UNAVAILABLE', activeNow: false });
  });

  it('resposta atrasada não publica depois que perde o lock', async () => {
    redis.eval.mockResolvedValue(0);
    const service = create();
    await boot(service);
    expect(service.forSurcharge(id)?.activeNow).toBe(false);
    expect(values.has(stateKey)).toBe(false);
    expect(redis.eval).toHaveBeenCalledWith(
      expect.stringContaining("redis.call('get', KEYS[1]) == ARGV[1]"),
      2,
      lockKey,
      stateKey,
      expect.any(String),
      expect.any(String),
    );
  });

  it('cache corrompido não vira chuva nem impede recuperação posterior', async () => {
    values.set(stateKey, '{broken');
    fetchMock.mockRejectedValueOnce(new Error('offline'));
    const service = create();
    await boot(service);
    expect(service.forSurcharge(id)?.activeNow).toBe(false);
    jest.setSystemTime(start + RAIN_POLL_MS);
    await service.refresh();
    expect(service.forSurcharge(id)?.activeNow).toBe(true);
  });
});
