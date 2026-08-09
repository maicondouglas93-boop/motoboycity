import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const REQUEST_TIMEOUT_MS = 8_000;
const DIRECTIONS_ENDPOINT = 'https://maps.googleapis.com/maps/api/directions/json';

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

interface DirectionsApiResponse {
  status: string;
  routes?: Array<{
    legs?: Array<{
      distance?: { value: number };
      duration?: { value: number };
    }>;
  }>;
}

/**
 * Wrapper fino sobre a Directions API do Google Maps. Sem cache aqui — cache
 * de resultado é responsabilidade de quem chama (ex.: a criação de Delivery
 * na Fase 03), porque só ela sabe a chave de cache correta (endereços
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

    const url = new URL(DIRECTIONS_ENDPOINT);
    url.searchParams.set('origin', `${request.originLat},${request.originLng}`);
    url.searchParams.set('destination', `${request.destinationLat},${request.destinationLng}`);
    url.searchParams.set('key', apiKey);

    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(url, { signal: controller.signal });
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new GoogleMapsTimeoutError();
      }
      throw new GoogleMapsApiError('Falha de rede ao consultar a API do Google Maps.');
    } finally {
      clearTimeout(timeoutHandle);
    }

    if (!response.ok) {
      throw new GoogleMapsApiError(`API do Google Maps retornou HTTP ${response.status}.`);
    }

    const body = (await response.json()) as DirectionsApiResponse;

    if (body.status !== 'OK') {
      throw new GoogleMapsApiError(`API do Google Maps retornou status "${body.status}".`);
    }

    const leg = body.routes?.[0]?.legs?.[0];
    if (!leg?.distance || !leg?.duration) {
      throw new GoogleMapsApiError('Resposta da API do Google Maps sem rota válida.');
    }

    return {
      distanceKm: Math.round((leg.distance.value / 1000) * 100) / 100,
      durationMinutes: Math.round(leg.duration.value / 60),
    };
  }
}
