import { Injectable } from '@nestjs/common';
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
    geometry?: {
      location?: { lat: number; lng: number };
      location_type?: string;
    };
  }>;
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
    if (typeof route?.distanceMeters !== 'number' || typeof route?.duration !== 'string') {
      throw new GoogleMapsApiError('Resposta da API do Google Maps sem rota válida.');
    }

    const durationSeconds = Number(route.duration.replace('s', ''));

    return {
      distanceKm: Math.round((route.distanceMeters / 1000) * 100) / 100,
      durationMinutes: Math.round(durationSeconds / 60),
    };
  }
}
