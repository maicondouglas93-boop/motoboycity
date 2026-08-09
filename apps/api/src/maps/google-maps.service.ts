import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const REQUEST_TIMEOUT_MS = 8_000;
const ROUTES_ENDPOINT = 'https://routes.googleapis.com/directions/v2:computeRoutes';
const FIELD_MASK = 'routes.distanceMeters,routes.duration';

export interface DistanceRequest {
  originLat: number;
  originLng: number;
  destinationLat: number;
  destinationLng: number;
}

export interface DistanceResult {
  distanceKm: number;
  durationMinutes: number;
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

interface RoutesApiResponse {
  routes?: RoutesApiRoute[];
  error?: { code: number; message: string; status: string };
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
          origin: { location: { latLng: { latitude: request.originLat, longitude: request.originLng } } },
          destination: {
            location: { latLng: { latitude: request.destinationLat, longitude: request.destinationLng } },
          },
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
