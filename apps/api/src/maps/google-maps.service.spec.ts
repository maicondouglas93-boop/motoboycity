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

  it('retorna distância em km e duração em minutos numa resposta válida', async () => {
    config.get.mockReturnValue('fake-api-key');
    fetchSpy.mockResolvedValue(jsonResponse({ routes: [{ distanceMeters: 5200, duration: '630s' }] }));

    const result = await service.getDistance(request);

    expect(result).toEqual({ distanceKm: 5.2, durationMinutes: 11 });
  });

  it('envia a chave no header X-Goog-Api-Key e as coordenadas no corpo da requisição', async () => {
    config.get.mockReturnValue('fake-api-key');
    fetchSpy.mockResolvedValue(jsonResponse({ routes: [{ distanceMeters: 1000, duration: '60s' }] }));

    await service.getDistance(request);

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://routes.googleapis.com/directions/v2:computeRoutes');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['X-Goog-Api-Key']).toBe('fake-api-key');
    expect((init.headers as Record<string, string>)['X-Goog-FieldMask']).toBe(
      'routes.distanceMeters,routes.duration',
    );

    const body = JSON.parse(init.body as string);
    expect(body.origin.location.latLng).toEqual({ latitude: -23.55, longitude: -46.63 });
    expect(body.destination.location.latLng).toEqual({ latitude: -23.56, longitude: -46.64 });
    expect(body.travelMode).toBe('DRIVE');
  });

  it('lança GoogleMapsApiError com a mensagem do Google quando o HTTP não é ok', async () => {
    config.get.mockReturnValue('fake-api-key');
    fetchSpy.mockResolvedValue(
      jsonResponse({ error: { code: 403, message: 'API key not valid.', status: 'PERMISSION_DENIED' } }, false, 403),
    );

    await expect(service.getDistance(request)).rejects.toThrow('API key not valid.');
  });

  it('lança GoogleMapsApiError quando a resposta não tem rota (routes vazio)', async () => {
    config.get.mockReturnValue('fake-api-key');
    fetchSpy.mockResolvedValue(jsonResponse({ routes: [] }));

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
