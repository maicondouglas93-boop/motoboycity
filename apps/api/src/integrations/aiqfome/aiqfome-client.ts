import { BadGatewayException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AiqfomeStoreSummary } from '@motoboycity/types';
import {
  AIQFOME_API_BASE_URL,
  AIQFOME_TOKEN_URL,
  requireAiqfomeRuntimeConfig,
} from './aiqfome.config';
import {
  aiqfomeStoreInfoResponseSchema,
  aiqfomeStoresResponseSchema,
  aiqfomeTokenResponseSchema,
  type AiqfomeTokenResponse,
} from './aiqfome.schemas';

const REQUEST_TIMEOUT_MS = 15_000;
const AIQ_USER_AGENT = 'MOTOboyCity (maicondouglas93@gmail.com)';

@Injectable()
export class AiqfomeClient {
  constructor(private readonly config: ConfigService) {}

  async exchangeCode(code: string): Promise<AiqfomeTokenResponse> {
    const runtime = requireAiqfomeRuntimeConfig(this.config);
    const body = new URLSearchParams({
      client_id: runtime.clientId,
      client_secret: runtime.clientSecret,
      redirect_uri: runtime.redirectUri,
      code,
      grant_type: 'authorization_code',
    });

    const response = await this.safeFetch(AIQFOME_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    return this.parseResponse(response, aiqfomeTokenResponseSchema, 'TOKEN_EXCHANGE_FAILED');
  }

  async resolveAuthorizedStore(accessToken: string): Promise<AiqfomeStoreSummary> {
    const storesResponse = await this.authorizedGet('/store', accessToken);
    const stores = await this.parseResponse(
      storesResponse,
      aiqfomeStoresResponseSchema,
      'STORE_LOOKUP_FAILED',
    );

    if (stores.data.length !== 1) {
      throw new AiqfomeProviderError('STORE_COUNT_INVALID');
    }

    const store = stores.data[0];
    if (!store) {
      throw new AiqfomeProviderError('STORE_COUNT_INVALID');
    }
    const infoResponse = await this.authorizedGet(
      `/store/${encodeURIComponent(store.id)}/info`,
      accessToken,
    );
    const info = await this.parseResponse(
      infoResponse,
      aiqfomeStoreInfoResponseSchema,
      'STORE_INFO_FAILED',
    );

    if (info.data.id !== store.id) {
      throw new AiqfomeProviderError('STORE_ID_MISMATCH');
    }

    return {
      id: store.id,
      name: info.data.name,
      status: store.status,
      document: normalizeDocument(info.data.document_number),
      address: store.address
        ? {
            street: store.address.street_name,
            number: store.address.number,
            city: store.address.city_name,
            state: store.address.state_uf,
          }
        : null,
    };
  }

  private authorizedGet(path: string, accessToken: string): Promise<Response> {
    return this.safeFetch(`${AIQFOME_API_BASE_URL}${path}`, {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${accessToken}`,
        'Aiq-User-Agent': AIQ_USER_AGENT,
      },
    });
  }

  private async safeFetch(url: string, init: RequestInit): Promise<Response> {
    try {
      return await fetch(url, {
        ...init,
        redirect: 'error',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      throw new BadGatewayException('Não foi possível comunicar com o aiqfome.');
    }
  }

  private async parseResponse<T>(
    response: Response,
    schema: { safeParse(value: unknown): { success: true; data: T } | { success: false } },
    errorCode: string,
  ): Promise<T> {
    if (!response.ok) {
      throw new AiqfomeProviderError(errorCode, response.status);
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new AiqfomeProviderError(`${errorCode}_INVALID_JSON`);
    }

    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      throw new AiqfomeProviderError(`${errorCode}_INVALID_RESPONSE`);
    }
    return parsed.data;
  }
}

export class AiqfomeProviderError extends Error {
  constructor(
    readonly code: string,
    readonly httpStatus?: number,
  ) {
    super(code);
    this.name = 'AiqfomeProviderError';
  }
}

export function normalizeDocument(value: string): string {
  return value.replace(/\D/g, '');
}
