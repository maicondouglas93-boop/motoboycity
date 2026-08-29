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

  const request = {
    origin: { lat: -23.55, lng: -46.63 },
    destination: { lat: -23.56, lng: -46.64 },
  };

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

  describe('geocode', () => {
    function resultado(locationType: string) {
      return {
        status: 'OK',
        results: [
          {
            geometry: {
              location: { lat: -20.1522, lng: -41.6232 },
              location_type: locationType,
            },
          },
        ],
      };
    }

    it('devolve a coordenada quando o Google acerta o prédio', async () => {
      config.get.mockReturnValue('fake-api-key');
      fetchSpy.mockResolvedValue(jsonResponse(resultado('ROOFTOP')));

      await expect(service.geocode('Rua X, 1')).resolves.toEqual({
        lat: -20.1522,
        lng: -41.6232,
      });
    });

    it('aceita coordenada interpolada entre dois números da rua', async () => {
      config.get.mockReturnValue('fake-api-key');
      fetchSpy.mockResolvedValue(jsonResponse(resultado('RANGE_INTERPOLATED')));

      await expect(service.geocode('Rua X, 1')).resolves.not.toBeNull();
    });

    it('descarta APPROXIMATE, que é o centro da cidade e não o endereço', async () => {
      // Aceitar isto seria pior que nao conferir: a regra compararia a posicao
      // do motoboy com o centro de Lajinha e recusaria entrega que aconteceu.
      config.get.mockReturnValue('fake-api-key');
      fetchSpy.mockResolvedValue(jsonResponse(resultado('APPROXIMATE')));

      await expect(service.geocode('Rua X, 1')).resolves.toBeNull();
    });

    it('descarta GEOMETRIC_CENTER, que é o centro da rua', async () => {
      config.get.mockReturnValue('fake-api-key');
      fetchSpy.mockResolvedValue(jsonResponse(resultado('GEOMETRIC_CENTER')));

      await expect(service.geocode('Rua X, 1')).resolves.toBeNull();
    });

    it('devolve null quando o endereço não existe, sem lançar', async () => {
      // Endereco mal digitado nao pode impedir a loja de lancar o pedido.
      config.get.mockReturnValue('fake-api-key');
      fetchSpy.mockResolvedValue(jsonResponse({ status: 'ZERO_RESULTS' }));

      await expect(service.geocode('Rua Inexistente, 999')).resolves.toBeNull();
    });

    it('lança quando o problema é nosso, e não do endereço', async () => {
      config.get.mockReturnValue('fake-api-key');
      fetchSpy.mockResolvedValue(
        jsonResponse({ status: 'REQUEST_DENIED', error_message: 'chave sem permissão' }),
      );

      await expect(service.geocode('Rua X, 1')).rejects.toBeInstanceOf(GoogleMapsApiError);
    });
  });

  describe('reverseGeocode', () => {
    it('separa rua, numero, cidade, UF e CEP da coordenada final', async () => {
      config.get.mockReturnValue('fake-api-key');
      fetchSpy.mockResolvedValue(
        jsonResponse({
          status: 'OK',
          results: [
            {
              formatted_address: 'Avenida Antonio Florencio Alvim, 205 - Lajinha - MG',
              address_components: [
                {
                  long_name: 'Avenida Antonio Florencio Alvim',
                  short_name: 'Av. Antonio Florencio Alvim',
                  types: ['route'],
                },
                { long_name: '205', short_name: '205', types: ['street_number'] },
                { long_name: 'Lajinha', short_name: 'Lajinha', types: ['locality'] },
                {
                  long_name: 'Minas Gerais',
                  short_name: 'MG',
                  types: ['administrative_area_level_1'],
                },
                { long_name: '36980-000', short_name: '36980-000', types: ['postal_code'] },
              ],
            },
          ],
        }),
      );

      await expect(service.reverseGeocode({ lat: -20.1509698, lng: -41.6146408 })).resolves.toEqual(
        {
          street: 'Avenida Antonio Florencio Alvim',
          number: '205',
          city: 'Lajinha',
          state: 'MG',
          zip: '36980-000',
        },
      );

      const [requestUrl] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      expect(requestUrl.searchParams.get('latlng')).toBe('-20.1509698,-41.6146408');
      expect(requestUrl.searchParams.get('language')).toBe('pt-BR');
    });

    it('usa o endereco formatado quando o Google nao separa a rua', async () => {
      config.get.mockReturnValue('fake-api-key');
      fetchSpy.mockResolvedValue(
        jsonResponse({
          status: 'OK',
          results: [{ formatted_address: 'Estrada sem nome, Lajinha - MG, Brasil' }],
        }),
      );

      await expect(service.reverseGeocode({ lat: -20.15, lng: -41.61 })).resolves.toEqual({
        street: 'Estrada sem nome, Lajinha - MG, Brasil',
        number: null,
        city: null,
        state: null,
        zip: null,
      });
    });

    it('devolve null quando a coordenada nao possui endereco conhecido', async () => {
      config.get.mockReturnValue('fake-api-key');
      fetchSpy.mockResolvedValue(jsonResponse({ status: 'ZERO_RESULTS' }));

      await expect(service.reverseGeocode({ lat: -20.15, lng: -41.61 })).resolves.toBeNull();
    });
  });

  it('lança GoogleMapsNotConfiguredError quando não há chave configurada, sem chamar a API', async () => {
    config.get.mockReturnValue(undefined);

    await expect(service.getDistance(request)).rejects.toBeInstanceOf(GoogleMapsNotConfiguredError);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('retorna distância em km e duração em minutos numa resposta válida', async () => {
    config.get.mockReturnValue('fake-api-key');
    fetchSpy.mockResolvedValue(
      jsonResponse({ routes: [{ distanceMeters: 5200, duration: '630s' }] }),
    );

    const result = await service.getDistance(request);

    expect(result).toEqual({ distanceKm: 5.2, durationMinutes: 11 });
  });

  /**
   * O JSON do proto3 omite inteiro de valor padrao: uma rota de 0 m chega com
   * `duration: "0s"` e SEM `distanceMeters`. Tratar essa ausencia como resposta
   * invalida travou a conclusao de pedidos marcados em cima do ponto de coleta
   * — e nenhum raio adiantava, porque a recusa vinha antes de qualquer conta.
   */
  it('lê rota de zero metro, que o Google devolve sem o campo distanceMeters', async () => {
    config.get.mockReturnValue('fake-api-key');
    fetchSpy.mockResolvedValue(jsonResponse({ routes: [{ duration: '0s' }] }));

    await expect(service.getDistance(request)).resolves.toEqual({
      distanceKm: 0,
      durationMinutes: 0,
    });
  });

  it('trata lista de rotas vazia como ausência de rota', async () => {
    config.get.mockReturnValue('fake-api-key');
    fetchSpy.mockResolvedValue(jsonResponse({ routes: [] }));

    await expect(service.getDistance(request)).rejects.toThrow('sem rota válida');
  });

  /**
   * Rota presente e sem `duration` e defeito de contrato, nao ausencia de
   * caminho — e a mensagem precisa ser outra, porque quem chama decide pela
   * frase se vale tentar o mesmo trajeto de outra forma.
   */
  it('separa resposta incompleta de ausência de rota', async () => {
    config.get.mockReturnValue('fake-api-key');
    fetchSpy.mockResolvedValue(jsonResponse({ routes: [{ distanceMeters: 1200 }] }));

    await expect(service.getDistance(request)).rejects.toThrow('veio incompleta');
  });

  it('envia a chave no header X-Goog-Api-Key e as coordenadas no corpo da requisição', async () => {
    config.get.mockReturnValue('fake-api-key');
    fetchSpy.mockResolvedValue(
      jsonResponse({ routes: [{ distanceMeters: 1000, duration: '60s' }] }),
    );

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

  it('aceita endereço em texto em vez de coordenadas (origem e destino independentes)', async () => {
    config.get.mockReturnValue('fake-api-key');
    fetchSpy.mockResolvedValue(
      jsonResponse({ routes: [{ distanceMeters: 3000, duration: '300s' }] }),
    );

    await service.getDistance({
      origin: { address: 'Av. Paulista, 1000, São Paulo - SP' },
      destination: { lat: -23.56, lng: -46.64 },
    });

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.origin).toEqual({ address: 'Av. Paulista, 1000, São Paulo - SP' });
    expect(body.destination.location.latLng).toEqual({ latitude: -23.56, longitude: -46.64 });
  });

  it('lança GoogleMapsApiError com a mensagem do Google quando o HTTP não é ok', async () => {
    config.get.mockReturnValue('fake-api-key');
    fetchSpy.mockResolvedValue(
      jsonResponse(
        { error: { code: 403, message: 'API key not valid.', status: 'PERMISSION_DENIED' } },
        false,
        403,
      ),
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
