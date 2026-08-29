import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const REQUEST_TIMEOUT_MS = 8_000;
const ROUTES_ENDPOINT = 'https://routes.googleapis.com/directions/v2:computeRoutes';
const FIELD_MASK = 'routes.distanceMeters,routes.duration';
const GEOCODE_ENDPOINT = 'https://maps.googleapis.com/maps/api/geocode/json';

export type MapsWaypoint = { lat: number; lng: number } | { address: string };

export interface DistanceRequest {
  origin: MapsWaypoint;
  destination: MapsWaypoint;
}

export interface DistanceResult {
  distanceKm: number;
  durationMinutes: number;
}

export interface Coordinate {
  lat: number;
  lng: number;
}

export interface ReverseGeocodedAddress {
  street: string;
  number: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
}

export class GoogleMapsNotConfiguredError extends Error {
  constructor() {
    super('GOOGLE_MAPS_API_KEY não configurada. Contate o suporte.');
    this.name = 'GoogleMapsNotConfiguredError';
  }
}

export class GoogleMapsTimeoutError extends Error {
  constructor() {
    super('Tempo esgotado ao consultar a API do Google Maps.');
    this.name = 'GoogleMapsTimeoutError';
  }
}

export class GoogleMapsApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GoogleMapsApiError';
  }
}

interface RoutesApiRoute {
  distanceMeters?: number;
  duration?: string;
}

interface GeocodeApiResponse {
  status: string;
  error_message?: string;
  results?: Array<{
    formatted_address?: string;
    address_components?: Array<{
      long_name: string;
      short_name: string;
      types: string[];
    }>;
    geometry?: {
      location?: { lat: number; lng: number };
      location_type?: string;
    };
  }>;
}

type GeocodeResult = NonNullable<GeocodeApiResponse['results']>[number];

function addressComponent(
  result: GeocodeResult,
  types: string[],
  name: 'long_name' | 'short_name' = 'long_name',
): string | null {
  for (const type of types) {
    const component = result.address_components?.find((item) => item.types.includes(type));
    if (component?.[name]) return component[name];
  }
  return null;
}

/**
 * Precisoes que servem para conferir presenca fisica.
 *
 * `ROOFTOP` e o predio; `RANGE_INTERPOLATED` e estimado entre dois numeros
 * conhecidos da rua, com erro de dezenas de metros. As duas cabem num raio de
 * 200 m.
 *
 * `GEOMETRIC_CENTER` (centro da rua) e sobretudo `APPROXIMATE` (centro da
 * CIDADE) ficam de fora: `APPROXIMATE` significa que o Google nao achou o
 * endereco e devolveu um ponto qualquer da cidade. Comparar a posicao do
 * motoboy com isso recusaria entrega feita e aceitaria entrega que nao houve —
 * pior que nao conferir, porque parece conferencia.
 */
const PRECISOES_ACEITAS = new Set(['ROOFTOP', 'RANGE_INTERPOLATED']);

interface RoutesApiResponse {
  routes?: RoutesApiRoute[];
  error?: { code: number; message: string; status: string };
}

/**
 * Descreve a consulta para o log sem vazar dado de cliente.
 *
 * O texto do endereco NAO entra: ele identifica a casa de alguem. Coordenada
 * entra com 4 casas — cerca de 11 metros, suficiente para conferir a regiao no
 * mapa e insuficiente para apontar uma porta.
 */
function describeWaypoint(point: MapsWaypoint): string {
  if ('address' in point) return 'endereco';
  return `coord(${point.lat.toFixed(4)},${point.lng.toFixed(4)})`;
}

function describeRouteRequest(request: DistanceRequest): string {
  return `origem ${describeWaypoint(request.origin)} -> destino ${describeWaypoint(request.destination)}`;
}

function toWaypointPayload(point: MapsWaypoint): Record<string, unknown> {
  if ('address' in point) {
    return { address: point.address };
  }
  return { location: { latLng: { latitude: point.lat, longitude: point.lng } } };
}

/**
 * Wrapper fino sobre a Routes API do Google Maps (computeRoutes) — não a
 * Directions API legada, que o Google não habilita mais por padrão em
 * projetos novos e recomenda migrar pra esta. Sem cache aqui — cache de
 * resultado é responsabilidade de quem chama (ex.: a criação de Delivery na
 * Fase 03), porque só ela sabe a chave de cache correta (endereços
 * congelados do pedido).
 */
@Injectable()
export class GoogleMapsService {
  private readonly logger = new Logger(GoogleMapsService.name);

  constructor(private readonly config: ConfigService) {}

  /**
   * Converte endereco em coordenada.
   *
   * Devolve `null` — e nao lanca — quando o Google nao encontra o endereco, ou
   * quando encontra com precisao ruim demais para provar presenca fisica.
   * Endereco mal digitado, rua sem numero no mapa e zona rural sao rotina numa
   * cidade pequena, e nenhum desses casos pode impedir a loja de lancar o
   * pedido. Quem chama decide o que fazer sem a coordenada.
   *
   * Lanca apenas quando a falha e de infraestrutura (chave ausente, rede,
   * tempo esgotado), porque ai o problema e nosso e nao do endereco.
   */
  async geocode(address: string): Promise<Coordinate | null> {
    const apiKey = this.config.get<string>('GOOGLE_MAPS_API_KEY');
    if (!apiKey) {
      throw new GoogleMapsNotConfiguredError();
    }

    const url = new URL(GEOCODE_ENDPOINT);
    url.searchParams.set('address', address);
    url.searchParams.set('key', apiKey);
    // Sem este recorte o Google resolve "Rua Sucupira" em qualquer pais.
    url.searchParams.set('region', 'br');
    url.searchParams.set('language', 'pt-BR');

    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(url, { signal: controller.signal });
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new GoogleMapsTimeoutError();
      }
      throw new GoogleMapsApiError('Falha de rede ao geocodificar o endereço.');
    } finally {
      clearTimeout(timeoutHandle);
    }

    if (!response.ok) {
      throw new GoogleMapsApiError(`Geocodificação retornou HTTP ${response.status}.`);
    }

    const body = (await response.json()) as GeocodeApiResponse;

    // ZERO_RESULTS e resposta legitima: o endereco nao existe para o Google.
    if (body.status === 'ZERO_RESULTS') return null;
    if (body.status !== 'OK') {
      throw new GoogleMapsApiError(
        `Geocodificação retornou erro: ${body.error_message ?? body.status}`,
      );
    }

    const geometria = body.results?.[0]?.geometry;
    const local = geometria?.location;
    if (!local) return null;

    // Sem precisao declarada o resultado nao e confiavel para conferir presenca.
    const precisao = geometria?.location_type ?? '';
    if (!PRECISOES_ACEITAS.has(precisao)) return null;

    return { lat: local.lat, lng: local.lng };
  }

  /**
   * Converte a coordenada capturada pelo app em endereco legivel.
   *
   * Diferente do `geocode`, o resultado serve apenas para explicar no painel
   * onde a entrega terminou. Ele nunca participa do calculo de distancia ou
   * preco, portanto uma rua aproximada e melhor que esconder a localizacao —
   * as coordenadas originais continuam sendo a fonte auditavel.
   */
  async reverseGeocode(coordinate: Coordinate): Promise<ReverseGeocodedAddress | null> {
    const apiKey = this.config.get<string>('GOOGLE_MAPS_API_KEY');
    if (!apiKey) {
      throw new GoogleMapsNotConfiguredError();
    }

    const url = new URL(GEOCODE_ENDPOINT);
    url.searchParams.set('latlng', `${coordinate.lat},${coordinate.lng}`);
    url.searchParams.set('key', apiKey);
    url.searchParams.set('region', 'br');
    url.searchParams.set('language', 'pt-BR');

    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(url, { signal: controller.signal });
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new GoogleMapsTimeoutError();
      }
      throw new GoogleMapsApiError('Falha de rede ao identificar o endereço da coordenada.');
    } finally {
      clearTimeout(timeoutHandle);
    }

    if (!response.ok) {
      throw new GoogleMapsApiError(`Geocodificação reversa retornou HTTP ${response.status}.`);
    }

    const body = (await response.json()) as GeocodeApiResponse;
    if (body.status === 'ZERO_RESULTS') return null;
    if (body.status !== 'OK') {
      throw new GoogleMapsApiError(
        `Geocodificação reversa retornou erro: ${body.error_message ?? body.status}`,
      );
    }

    const result = body.results?.[0];
    if (!result) return null;

    const route = addressComponent(result, ['route']);
    const formatted = result.formatted_address?.trim() || null;
    if (!route && !formatted) return null;

    // Se o Google nao separou a rua, o endereco formatado ainda e mais util
    // que "Endereco nao informado". Nesse fallback nao repetimos cidade/UF.
    if (!route) {
      return {
        street: formatted!,
        number: null,
        city: null,
        state: null,
        zip: null,
      };
    }

    return {
      street: route,
      number: addressComponent(result, ['street_number']),
      city: addressComponent(result, [
        'locality',
        'administrative_area_level_2',
        'sublocality_level_1',
      ]),
      state: addressComponent(result, ['administrative_area_level_1'], 'short_name'),
      zip: addressComponent(result, ['postal_code']),
    };
  }

  async getDistance(request: DistanceRequest): Promise<DistanceResult> {
    const apiKey = this.config.get<string>('GOOGLE_MAPS_API_KEY');
    if (!apiKey) {
      throw new GoogleMapsNotConfiguredError();
    }

    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(ROUTES_ENDPOINT, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': FIELD_MASK,
        },
        body: JSON.stringify({
          origin: toWaypointPayload(request.origin),
          destination: toWaypointPayload(request.destination),
          travelMode: 'DRIVE',
        }),
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new GoogleMapsTimeoutError();
      }
      throw new GoogleMapsApiError('Falha de rede ao consultar a API do Google Maps.');
    } finally {
      clearTimeout(timeoutHandle);
    }

    const body = (await response.json()) as RoutesApiResponse;

    if (!response.ok) {
      throw new GoogleMapsApiError(
        `API do Google Maps retornou erro: ${body.error?.message ?? `HTTP ${response.status}`}`,
      );
    }

    const route = body.routes?.[0];
    if (route === undefined) {
      // Lista vazia: o Google entendeu os dois pontos e nao ligou um ao outro.
      // A frase e preservada ao pe da letra porque `deliveries.service` decide
      // por ela se vale a pena tentar outra forma de endereco.
      this.logger.warn(
        `Routes API sem rota: ${describeRouteRequest(request)}, HTTP ${response.status}, 0 rotas.`,
      );
      throw new GoogleMapsApiError('Resposta da API do Google Maps sem rota válida.');
    }
    if (typeof route.duration !== 'string') {
      // Rota veio, mas sem o campo que a field mask pediu. E defeito de
      // contrato, nao ausencia de caminho — e nao adianta tentar outro endereco.
      this.logger.warn(
        `Routes API com resposta incompleta: ${describeRouteRequest(request)}, ` +
          `HTTP ${response.status}, campos ${Object.keys(route).join(',') || 'nenhum'}.`,
      );
      throw new GoogleMapsApiError('Resposta da API do Google Maps veio incompleta.');
    }

    /**
     * `distanceMeters` AUSENTE vale ZERO, e nao "sem rota".
     *
     * O JSON do proto3 omite inteiro de valor padrao, entao uma rota de 0 m
     * chega com `duration: "0s"` e sem `distanceMeters`. Tratar essa ausencia
     * como resposta invalida foi o que travou a conclusao de pedidos marcados
     * praticamente em cima do ponto de coleta: nenhum raio adiantava, porque a
     * recusa acontecia antes de qualquer conta de distancia.
     *
     * Zero e um numero legitimo. Quem decide o preco de uma corrida de 0 km e a
     * tabela — que cobra a taxa base — e nao este wrapper.
     */
    const distanceMeters = route.distanceMeters ?? 0;
    const durationSeconds = Number(route.duration.replace('s', ''));

    return {
      distanceKm: Math.round((distanceMeters / 1000) * 100) / 100,
      durationMinutes: Math.round(durationSeconds / 60),
    };
  }
}
