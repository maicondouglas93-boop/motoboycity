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
import {
  aiqfomeOrderResponseSchema,
  aiqfomeWebhookEventNameSchema,
  type AiqfomeOrderResponse,
  type AiqfomeWebhookEventName,
} from './aiqfome-orders.schemas';

const REQUEST_TIMEOUT_MS = 15_000;
const AIQ_USER_AGENT = 'MOTOboyCity (maicondouglas93@gmail.com)';

export interface AiqfomeWebhookEventDefinition {
  id: string;
  event: AiqfomeWebhookEventName;
}

export interface AiqfomeStoreWebhook {
  id: string;
  url: string;
  event?: AiqfomeWebhookEventName;
  webhookEventId?: string;
}

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

    return this.requestToken(body, 'TOKEN_EXCHANGE_FAILED');
  }

  async refreshToken(refreshToken: string): Promise<AiqfomeTokenResponse> {
    const runtime = requireAiqfomeRuntimeConfig(this.config);
    const body = new URLSearchParams({
      client_id: runtime.clientId,
      client_secret: runtime.clientSecret,
      redirect_uri: runtime.redirectUri,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    });

    return this.requestToken(body, 'TOKEN_REFRESH_FAILED');
  }

  private async requestToken(
    body: URLSearchParams,
    errorCode: string,
  ): Promise<AiqfomeTokenResponse> {
    const response = await this.safeFetch(AIQFOME_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    return this.parseResponse(response, aiqfomeTokenResponseSchema, errorCode);
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

  async getOrder(orderId: string, accessToken: string): Promise<AiqfomeOrderResponse> {
    const response = await this.authorizedGet(
      `/orders/${encodeURIComponent(orderId)}`,
      accessToken,
    );
    return this.parseResponse(response, aiqfomeOrderResponseSchema, 'ORDER_LOOKUP_FAILED');
  }

  async listWebhookEvents(accessToken: string): Promise<AiqfomeWebhookEventDefinition[]> {
    const response = await this.authorizedGet('/auxiliary/webhook-events', accessToken);
    const body = await this.parseUnknownResponse(response, 'WEBHOOK_EVENTS_LOOKUP_FAILED');
    return extractWebhookRows(body, false).map(({ id, event }) => ({ id, event }));
  }

  async createStoreWebhooks(
    storeId: string,
    webhooks: Array<{ url: string; secretKey: string; webhookEventId: string }>,
    accessToken: string,
  ): Promise<void> {
    const response = await this.authorizedRequest(
      `/store/${encodeURIComponent(storeId)}/webhooks`,
      accessToken,
      {
        method: 'POST',
        body: JSON.stringify({
          webhooks: webhooks.map((item) => ({
            url: item.url,
            secret_key: item.secretKey,
            webhook_event_id: item.webhookEventId,
          })),
        }),
      },
    );
    await this.assertSuccess(response, 'WEBHOOK_CREATE_FAILED');
  }

  async listStoreWebhooks(storeId: string, accessToken: string): Promise<AiqfomeStoreWebhook[]> {
    const response = await this.authorizedGet(
      `/store/${encodeURIComponent(storeId)}/webhooks`,
      accessToken,
    );
    const body = await this.parseUnknownResponse(response, 'WEBHOOK_LIST_FAILED');
    return extractWebhookRows(body, true);
  }

  async deleteStoreWebhook(storeId: string, webhookId: string, accessToken: string): Promise<void> {
    const response = await this.authorizedRequest(
      `/store/${encodeURIComponent(storeId)}/webhooks/${encodeURIComponent(webhookId)}`,
      accessToken,
      { method: 'DELETE' },
    );
    await this.assertSuccess(response, 'WEBHOOK_DELETE_FAILED');
  }

  async markLogisticStatus(
    orderId: string,
    status: 'pickup-ongoing' | 'delivery-ongoing' | 'order-delivered' | 'delivery-canceled',
    accessToken: string,
  ): Promise<void> {
    const response = await this.authorizedRequest(
      `/logistic/${encodeURIComponent(orderId)}/${status}`,
      accessToken,
      { method: 'POST' },
    );
    await this.assertSuccess(response, 'LOGISTIC_STATUS_UPDATE_FAILED');
  }

  private authorizedGet(path: string, accessToken: string): Promise<Response> {
    return this.authorizedRequest(path, accessToken);
  }

  private authorizedRequest(
    path: string,
    accessToken: string,
    init: RequestInit = {},
  ): Promise<Response> {
    return this.safeFetch(`${AIQFOME_API_BASE_URL}${path}`, {
      ...init,
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${accessToken}`,
        'Aiq-User-Agent': AIQ_USER_AGENT,
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...init.headers,
      },
    });
  }

  private async assertSuccess(response: Response, errorCode: string): Promise<void> {
    if (!response.ok) {
      throw new AiqfomeProviderError(errorCode, response.status);
    }
  }

  private async parseUnknownResponse(response: Response, errorCode: string): Promise<unknown> {
    if (!response.ok) throw new AiqfomeProviderError(errorCode, response.status);
    try {
      return await response.json();
    } catch {
      throw new AiqfomeProviderError(`${errorCode}_INVALID_JSON`);
    }
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

function extractWebhookRows(body: unknown, requireUrl: false): AiqfomeWebhookEventDefinition[];
function extractWebhookRows(body: unknown, requireUrl: true): AiqfomeStoreWebhook[];
function extractWebhookRows(
  body: unknown,
  requireUrl: boolean,
): AiqfomeWebhookEventDefinition[] | AiqfomeStoreWebhook[] {
  const rows = unwrapRows(body);
  const normalized = rows.flatMap((row) => {
    const record = asRecord(row);
    if (!record) return [];
    const eventRecord =
      asRecord(record['webhook_event']) ??
      asRecord(record['webhookEvent']) ??
      asRecord(record['event']);
    const eventValue =
      firstString(record, ['event', 'event_name', 'webhook_event_name', 'name', 'slug', 'key']) ??
      (eventRecord
        ? firstString(eventRecord, ['event', 'event_name', 'name', 'slug', 'key'])
        : null);
    const event = aiqfomeWebhookEventNameSchema.safeParse(eventValue);
    const id = firstString(
      record,
      requireUrl ? ['id', 'webhook_id'] : ['id', 'webhook_id', 'webhook_event_id', 'event_id'],
    );
    const webhookEventId =
      firstString(record, ['webhook_event_id', 'event_id']) ??
      (eventRecord ? firstString(eventRecord, ['id']) : null);
    const url = firstString(record, ['url', 'webhook_url', 'callback_url']);
    if (!id || (requireUrl && (!url || (!event.success && !webhookEventId)))) return [];
    if (!requireUrl && !event.success) return [];
    return [
      {
        id,
        ...(event.success ? { event: event.data } : {}),
        ...(requireUrl ? { url: url!, ...(webhookEventId ? { webhookEventId } : {}) } : {}),
      },
    ];
  });

  if (rows.length > 0 && normalized.length === 0) {
    throw new AiqfomeProviderError('WEBHOOK_RESPONSE_INVALID');
  }
  return normalized as AiqfomeWebhookEventDefinition[] | AiqfomeStoreWebhook[];
}

function unwrapRows(body: unknown): unknown[] {
  if (Array.isArray(body)) return body;
  const record = asRecord(body);
  if (!record) return [];
  for (const key of ['data', 'webhooks', 'events']) {
    if (Array.isArray(record[key])) return record[key];
  }
  return [];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function firstString(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return null;
}
