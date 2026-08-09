import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import {
  GoogleMapsApiError,
  GoogleMapsNotConfiguredError,
  GoogleMapsService,
  GoogleMapsTimeoutError,
} from './google-maps.service';

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
  } as Response;
}

describe('GoogleMapsService', () => {
  let service: GoogleMapsService;
  let config: { get: jest.Mock };
  let fetchSpy: jest.SpyInstance;

  const request = { originLat: -23.55, originLng: -46.63, destinationLat: -23.56, destinationLng: -46.64 };

  beforeEach(async () => {
    config = { get: jest.fn() };
    fetchSpy = jest.spyOn(globalThis, 'fetch');

    const module: TestingModule = await Test.createTestingModule({
      providers: [GoogleMapsService, { provide: ConfigService, useValue: config }],
    }).compile();

    service = module.get(GoogleMapsService);
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('lança GoogleMapsNotConfiguredError quando não há chave configurada, sem chamar a API', async () => {
    config.get.mockReturnValue(undefined);

    await expect(service.getDistance(request)).rejects.toBeInstanceOf(GoogleMapsNotConfiguredError);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('retorna distância em km e duração em minutos numa resposta OK', async () => {
    config.get.mockReturnValue('fake-api-key');
    fetchSpy.mockResolvedValue(
      jsonResponse({
        status: 'OK',
        routes: [{ legs: [{ distance: { value: 5200 }, duration: { value: 630 } }] }],
      }),
    );

    const result = await service.getDistance(request);

    expect(result).toEqual({ distanceKm: 5.2, durationMinutes: 11 });
  });

  it('inclui a chave e as coordenadas na URL da requisição', async () => {
    config.get.mockReturnValue('fake-api-key');
    fetchSpy.mockResolvedValue(
      jsonResponse({ status: 'OK', routes: [{ legs: [{ distance: { value: 1000 }, duration: { value: 60 } }] }] }),
    );

    await service.getDistance(request);

    const calledUrl = fetchSpy.mock.calls[0][0] as URL;
    expect(calledUrl.searchParams.get('key')).toBe('fake-api-key');
    expect(calledUrl.searchParams.get('origin')).toBe('-23.55,-46.63');
    expect(calledUrl.searchParams.get('destination')).toBe('-23.56,-46.64');
  });

  it('lança GoogleMapsApiError quando o HTTP não é ok', async () => {
    config.get.mockReturnValue('fake-api-key');
    fetchSpy.mockResolvedValue(jsonResponse({}, false, 500));

    await expect(service.getDistance(request)).rejects.toBeInstanceOf(GoogleMapsApiError);
  });

  it('lança GoogleMapsApiError quando o status do corpo não é OK (ex.: REQUEST_DENIED)', async () => {
    config.get.mockReturnValue('fake-api-key');
    fetchSpy.mockResolvedValue(jsonResponse({ status: 'REQUEST_DENIED' }));

    await expect(service.getDistance(request)).rejects.toThrow('REQUEST_DENIED');
  });

  it('lança GoogleMapsApiError quando a resposta não tem rota (ex.: ZERO_RESULTS)', async () => {
    config.get.mockReturnValue('fake-api-key');
    fetchSpy.mockResolvedValue(jsonResponse({ status: 'OK', routes: [] }));

    await expect(service.getDistance(request)).rejects.toBeInstanceOf(GoogleMapsApiError);
  });

  it('lança GoogleMapsTimeoutError quando a requisição estoura o tempo (AbortError)', async () => {
    config.get.mockReturnValue('fake-api-key');
    fetchSpy.mockImplementation(() => {
      const error = new Error('The operation was aborted');
      error.name = 'AbortError';
      return Promise.reject(error);
    });

    await expect(service.getDistance(request)).rejects.toBeInstanceOf(GoogleMapsTimeoutError);
  });

  it('lança GoogleMapsApiError numa falha de rede genérica', async () => {
    config.get.mockReturnValue('fake-api-key');
    fetchSpy.mockRejectedValue(new Error('network down'));

    await expect(service.getDistance(request)).rejects.toBeInstanceOf(GoogleMapsApiError);
  });
});
