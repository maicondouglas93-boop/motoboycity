import { InjectQueue } from '@nestjs/bullmq';
import {
  ForbiddenException,
  HttpException,
  Injectable,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Queue } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import type { CreateDeliveryPayload } from '@motoboycity/validation';
import { PrismaService } from '../../prisma/prisma.service';
import { DeliveriesService } from '../../deliveries/deliveries.service';
import { AiqfomeClient, AiqfomeProviderError } from './aiqfome-client';
import { resolveAiqfomeWebhookUrl } from './aiqfome.config';
import {
  type AiqfomeOrderResponse,
  type AiqfomeWebhookEnvelope,
  type AiqfomeWebhookEventName,
} from './aiqfome-orders.schemas';
import { AiqfomeTokenService } from './aiqfome-token.service';
import { parseAiqfomeIntegrationConfig, type AiqfomeIntegrationConfig } from './aiqfome.schemas';

export const AIQFOME_INBOUND_QUEUE = 'aiqfome-inbound';
export const PROCESS_AIQFOME_INBOUND_JOB = 'process-aiqfome-inbound';
export const SCAN_AIQFOME_INBOUND_JOB = 'scan-aiqfome-inbound';

const FAILED_RETRY_DELAY_MS = 15 * 60_000;
const PROCESSING_STALE_AFTER_MS = 10 * 60_000;

const REQUIRED_WEBHOOK_EVENTS: readonly AiqfomeWebhookEventName[] = [
  'new-order',
  'read-order',
  'ready-order',
  'cancel-order',
  'order-refund',
];

@Injectable()
export class AiqfomeWebhookService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly client: AiqfomeClient,
    private readonly tokenService: AiqfomeTokenService,
    private readonly deliveriesService: DeliveriesService,
    @InjectQueue(AIQFOME_INBOUND_QUEUE) private readonly queue: Queue,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.queue.add(
      SCAN_AIQFOME_INBOUND_JOB,
      {},
      {
        jobId: 'aiqfome-inbound-scan',
        repeat: { every: 30_000 },
        removeOnComplete: true,
        removeOnFail: 20,
      },
    );
    await this.enqueuePending();
  }

  /**
   * Recupera o intervalo entre persistir o inbox e conseguir falar com o
   * Redis. Eventos falhos aguardam antes de uma nova rodada para nao competir
   * com as tentativas exponenciais do proprio BullMQ.
   */
  async enqueuePending(): Promise<void> {
    const now = new Date();
    const staleBefore = new Date(now.getTime() - PROCESSING_STALE_AFTER_MS);
    await this.prisma.integrationInboundEvent.updateMany({
      where: { status: 'PROCESSING', updatedAt: { lt: staleBefore } },
      data: { status: 'FAILED', errorCode: 'STALE_PROCESSING_RECOVERED' },
    });

    const retryBefore = new Date(now.getTime() - FAILED_RETRY_DELAY_MS);
    const pending = await this.prisma.integrationInboundEvent.findMany({
      where: {
        OR: [{ status: 'RECEIVED' }, { status: 'FAILED', updatedAt: { lte: retryBefore } }],
      },
      orderBy: { receivedAt: 'asc' },
      take: 100,
      select: { id: true, attempts: true },
    });
    await Promise.all(pending.map((event) => this.enqueue(event.id, event.attempts)));
  }

  async activate(
    integrationId: string,
    config: AiqfomeIntegrationConfig,
  ): Promise<AiqfomeIntegrationConfig['webhook']> {
    if (config.webhook.status === 'ACTIVE' && config.webhook.secretDigest) {
      return config.webhook;
    }
    const integration = await this.prisma.integration.findUnique({
      where: { id: integrationId },
      select: { publicId: true },
    });
    if (!integration?.publicId || !config.store) {
      throw new AiqfomeProviderError('WEBHOOK_CONFIGURATION_INCOMPLETE');
    }

    const url = resolveAiqfomeWebhookUrl(this.configService, integration.publicId);
    const secret = randomBytes(32).toString('base64url');
    const secretDigest = digest(secret);

    const registrations = await this.tokenService.executeWithAccessToken(
      integrationId,
      async (accessToken) => {
        const existing = await this.client.listStoreWebhooks(config.store!.id, accessToken);
        await Promise.all(
          existing
            .filter((item) => item.url === url)
            .map((item) => this.client.deleteStoreWebhook(config.store!.id, item.id, accessToken)),
        );

        const definitions = await this.client.listWebhookEvents(accessToken);
        const byName = new Map(definitions.map((item) => [item.event, item.id]));
        const missing = REQUIRED_WEBHOOK_EVENTS.filter((event) => !byName.has(event));
        if (missing.length > 0) {
          throw new AiqfomeProviderError('WEBHOOK_EVENTS_MISSING');
        }

        await this.client.createStoreWebhooks(
          config.store!.id,
          REQUIRED_WEBHOOK_EVENTS.map((event) => ({
            url,
            secretKey: secret,
            webhookEventId: byName.get(event)!,
          })),
          accessToken,
        );

        const eventById = new Map(definitions.map((item) => [item.id, item.event]));
        const created = (await this.client.listStoreWebhooks(config.store!.id, accessToken))
          .filter((item) => item.url === url)
          .flatMap((item) => {
            const event =
              item.event ?? (item.webhookEventId ? eventById.get(item.webhookEventId) : undefined);
            return event && REQUIRED_WEBHOOK_EVENTS.includes(event) ? [{ id: item.id, event }] : [];
          });
        if (new Set(created.map((item) => item.event)).size !== REQUIRED_WEBHOOK_EVENTS.length) {
          throw new AiqfomeProviderError('WEBHOOK_REGISTRATION_INCOMPLETE');
        }
        return created.map((item) => ({ id: item.id, event: item.event }));
      },
    );

    return {
      status: 'ACTIVE',
      secretDigest,
      registrations,
      updatedAt: new Date().toISOString(),
    };
  }

  async deactivate(
    integrationId: string,
    config: AiqfomeIntegrationConfig,
  ): Promise<AiqfomeIntegrationConfig['webhook']> {
    if (!config.store || config.webhook.registrations.length === 0) {
      return inactiveWebhook();
    }
    await this.tokenService.executeWithAccessToken(integrationId, async (accessToken) => {
      await Promise.all(
        config.webhook.registrations.map((item) =>
          this.client.deleteStoreWebhook(config.store!.id, item.id, accessToken),
        ),
      );
    });
    return inactiveWebhook();
  }

  async reconcileConfiguredIntegrations(): Promise<void> {
    const global = await this.prisma.platformSettings.findUnique({
      where: { id: 'global' },
      select: { aiqfomeDispatchDelayMinutes: true },
    });

    let cursor: string | undefined;
    let attempted = 0;
    while (attempted < 20) {
      const integrations = await this.prisma.integration.findMany({
        where: { provider: 'AIQFOME', status: 'CONNECTED' },
        orderBy: { id: 'asc' },
        take: 100,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        select: { id: true, config: true },
      });
      if (integrations.length === 0) break;
      cursor = integrations.at(-1)?.id;

      for (const integration of integrations) {
        const config = parseAiqfomeIntegrationConfig(integration.config);
        const effectiveDelay =
          config.dispatchDelayMinutes ?? global?.aiqfomeDispatchDelayMinutes ?? null;
        if (
          !config.serviceTypeId ||
          effectiveDelay === null ||
          config.webhook.status === 'ACTIVE'
        ) {
          continue;
        }
        const lastAttempt = config.webhook.updatedAt
          ? new Date(config.webhook.updatedAt).getTime()
          : 0;
        if (Date.now() - lastAttempt < 5 * 60_000) continue;
        attempted += 1;
        try {
          const webhook = await this.activate(integration.id, config);
          await this.prisma.integration.update({
            where: { id: integration.id },
            data: {
              config: { ...config, webhook, errorCode: null } as Prisma.InputJsonValue,
              lastSyncAt: new Date(),
            },
          });
        } catch (error) {
          await this.prisma.integration.update({
            where: { id: integration.id },
            data: {
              config: {
                ...config,
                webhook: {
                  ...config.webhook,
                  status: 'ERROR',
                  updatedAt: new Date().toISOString(),
                },
                errorCode: safeErrorCode(error),
              } as Prisma.InputJsonValue,
            },
          });
        }
        if (attempted >= 20) break;
      }
      if (integrations.length < 100 || !cursor) break;
    }
  }

  async receive(
    publicId: string,
    authorization: string | undefined,
    envelope: AiqfomeWebhookEnvelope,
  ): Promise<{ accepted: true; duplicate: boolean }> {
    const integration = await this.prisma.integration.findFirst({
      where: { publicId, provider: 'AIQFOME', status: 'CONNECTED' },
      select: { id: true, config: true },
    });
    const config = parseAiqfomeIntegrationConfig(integration?.config);
    if (
      !integration ||
      config.webhook.status !== 'ACTIVE' ||
      !config.webhook.secretDigest ||
      !authorization ||
      !matchesDigest(authorization, config.webhook.secretDigest)
    ) {
      throw new UnauthorizedException('Webhook nao autorizado.');
    }
    if (!config.store || envelope.store_id !== config.store.id) {
      throw new ForbiddenException('Loja do webhook nao corresponde a integracao.');
    }

    const timestamp = eventTimestamp(envelope);
    const eventHash = digest(
      JSON.stringify({
        event: envelope.event,
        storeId: envelope.store_id,
        orderId: envelope.data.order_id,
        timestamp,
      }),
    );
    const normalizedPayload = {
      timestamp,
      ...(envelope.event === 'cancel-order' && envelope.data.reason
        ? { reason: envelope.data.reason.slice(0, 500) }
        : {}),
    };

    let event: { id: string; status: string; attempts: number };
    let duplicate = false;
    try {
      event = await this.prisma.integrationInboundEvent.create({
        data: {
          integrationId: integration.id,
          eventType: envelope.event,
          externalOrderId: envelope.data.order_id,
          storeId: envelope.store_id,
          eventHash,
          payload: normalizedPayload,
          eventAt: parseProviderDate(timestamp),
        },
        select: { id: true, status: true, attempts: true },
      });
    } catch (error) {
      if (!isUniqueConstraintError(error)) throw error;
      duplicate = true;
      event = await this.prisma.integrationInboundEvent.findUniqueOrThrow({
        where: { integrationId_eventHash: { integrationId: integration.id, eventHash } },
        select: { id: true, status: true, attempts: true },
      });
    }

    if (event.status === 'RECEIVED' || event.status === 'FAILED') {
      await this.enqueue(event.id, event.attempts);
    }
    return { accepted: true, duplicate };
  }

  async process(inboundEventId: string): Promise<void> {
    const claimed = await this.prisma.integrationInboundEvent.updateMany({
      where: { id: inboundEventId, status: { in: ['RECEIVED', 'FAILED'] } },
      data: { status: 'PROCESSING', attempts: { increment: 1 }, errorCode: null },
    });
    if (claimed.count !== 1) return;

    const event = await this.prisma.integrationInboundEvent.findUnique({
      where: { id: inboundEventId },
      include: { integration: { select: { id: true, companyId: true, config: true } } },
    });
    if (!event) return;
    if (!event.integration.companyId) {
      await this.finish(event.id, 'REVIEW', 'INTEGRATION_WITHOUT_COMPANY');
      return;
    }

    try {
      if (event.eventType === 'new-order') {
        await this.importOrder(event);
      } else if (event.eventType === 'cancel-order') {
        const payload = asRecord(event.payload);
        const result = await this.deliveriesService.cancelFromIntegration(
          event.integrationId,
          event.externalOrderId,
          typeof payload?.['reason'] === 'string' ? payload['reason'] : undefined,
        );
        if (result === 'REVIEW') {
          throw new InboundReviewError('CANCEL_AFTER_ACCEPTANCE');
        }
      }
      await this.finish(event.id, 'PROCESSED');
    } catch (error) {
      if (error instanceof InboundReviewError) {
        await this.finish(event.id, 'REVIEW', error.code);
        return;
      }
      if (error instanceof InboundIgnoredError) {
        await this.finish(event.id, 'IGNORED', error.code);
        return;
      }
      if (isPermanentProviderFailure(error)) {
        await this.finish(event.id, 'REVIEW', safeErrorCode(error));
        return;
      }
      await this.finish(event.id, 'FAILED', safeErrorCode(error));
      throw error;
    }
  }

  private async importOrder(event: {
    id: string;
    integrationId: string;
    externalOrderId: string;
    storeId: string;
    receivedAt: Date;
    integration: { companyId: string | null; config: unknown };
  }): Promise<void> {
    const config = parseAiqfomeIntegrationConfig(event.integration.config);
    if (!event.integration.companyId || !config.store || !config.serviceTypeId) {
      throw new InboundReviewError('INTEGRATION_SETTINGS_INCOMPLETE');
    }
    const global = await this.prisma.platformSettings.findUnique({
      where: { id: 'global' },
      select: { aiqfomeDispatchDelayMinutes: true },
    });
    const delayMinutes = config.dispatchDelayMinutes ?? global?.aiqfomeDispatchDelayMinutes ?? null;
    if (delayMinutes === null) {
      throw new InboundReviewError('DISPATCH_DELAY_NOT_CONFIGURED');
    }

    const response = await this.tokenService.executeWithAccessToken(
      event.integrationId,
      (accessToken) => this.client.getOrder(event.externalOrderId, accessToken),
    );
    const order = response.data;
    if (order.id !== event.externalOrderId || order.store.id !== event.storeId) {
      throw new InboundReviewError('ORDER_IDENTITY_MISMATCH');
    }
    if (order.is_cancelled || order.is_delivered) {
      throw new InboundIgnoredError(order.is_cancelled ? 'ORDER_CANCELLED' : 'ORDER_CLOSED');
    }
    if (order.is_pickup) throw new InboundReviewError('PICKUP_ORDER_NOT_SUPPORTED');
    if (order.is_aiqentrega_delivery) {
      throw new InboundReviewError('AIQENTREGA_ORDER_NOT_SUPPORTED');
    }
    if (order.is_scheduled) {
      throw new InboundReviewError('PROVIDER_SCHEDULED_ORDER_REQUIRES_REVIEW');
    }
    if (!order.user.address) throw new InboundReviewError('DELIVERY_ADDRESS_MISSING');

    const delivery = await this.deliveriesService.createFromIntegration(
      event.integration.companyId,
      event.integrationId,
      event.externalOrderId,
      mapAiqfomeOrderToDeliveryPayload(
        response,
        config.serviceTypeId,
        event.receivedAt,
        delayMinutes,
      ),
    );
    await this.prisma.$transaction([
      this.prisma.integrationInboundEvent.update({
        where: { id: event.id },
        data: { deliveryId: delivery.id },
      }),
      this.prisma.integration.update({
        where: { id: event.integrationId },
        data: { lastSyncAt: new Date() },
      }),
    ]);
  }

  private async enqueue(eventId: string, attempt: number): Promise<void> {
    await this.queue.add(
      PROCESS_AIQFOME_INBOUND_JOB,
      { eventId },
      {
        jobId: `aiqfome-inbound-${eventId}-${attempt}`,
        attempts: 8,
        backoff: { type: 'exponential', delay: 5_000 },
        removeOnComplete: true,
        removeOnFail: 200,
      },
    );
  }

  private async finish(
    id: string,
    status: 'PROCESSED' | 'IGNORED' | 'REVIEW' | 'FAILED',
    errorCode: string | null = null,
  ): Promise<void> {
    await this.prisma.integrationInboundEvent.update({
      where: { id },
      data: {
        status,
        errorCode,
        ...(status === 'FAILED' ? {} : { processedAt: new Date() }),
      },
    });
  }
}

export function mapAiqfomeOrderToDeliveryPayload(
  response: AiqfomeOrderResponse,
  serviceTypeId: string,
  receivedAt: Date,
  delayMinutes: number,
): CreateDeliveryPayload {
  const order = response.data;
  const address = order.user.address!;
  const name = `${order.user.name} ${order.user.surname}`.trim().slice(0, 120);
  const phone = normalizePhone(order.user.mobile_phone ?? order.user.phone_number);
  const prePaid = order.payment_method.pre_paid;
  const scheduledAt = new Date(receivedAt.getTime() + delayMinutes * 60_000).toISOString();
  const driverNote = buildDriverNote(order);
  const hasCoordinates = address.latitude != null && address.longitude != null;
  return {
    serviceTypeId,
    destinationKnownAtCreation: true as const,
    dropoffAddress: {
      street: address.street_name,
      number: address.number,
      ...(address.complement?.trim() ? { complement: address.complement.trim() } : {}),
      city: address.city_name,
      state: address.state_uf.toUpperCase(),
      zip: address.zip_code,
      ...(address.reference?.trim() ? { referenceNote: address.reference.trim() } : {}),
      ...(hasCoordinates ? { lat: Number(address.latitude), lng: Number(address.longitude) } : {}),
    },
    ...(name ? { recipientName: name } : {}),
    ...(phone ? { recipientPhone: phone } : {}),
    externalOrderNumber: order.id,
    driverNote,
    customerPaymentMethod: prePaid
      ? ('PREPAID' as const)
      : classifyPayment(order.payment_method.name),
    requiresReturn: !prePaid,
    requiresDeliveryProof: false,
    requiresCollectionRecipient: false,
    pickupSurchargeChargedToDriver: false,
    scheduledAt,
  };
}

function buildDriverNote(order: AiqfomeOrderResponse['data']): string {
  const payment = order.payment_method.pre_paid
    ? 'Pagamento online confirmado no aiqfome.'
    : `Pagamento na entrega: ${order.payment_method.name}.`;
  const change =
    !order.payment_method.pre_paid && Number(order.payment_method.change ?? 0) > 0
      ? ` Troco para R$ ${Number(order.payment_method.change).toFixed(2).replace('.', ',')}.`
      : '';
  const observation = order.order_observations?.trim()
    ? ` Observacao do pedido: ${order.order_observations.trim()}`
    : '';
  return `${payment}${change}${observation}`.slice(0, 500);
}

function classifyPayment(value: string): 'CARD' | 'CASH' | 'PIX' | undefined {
  const normalized = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  if (normalized.includes('dinheiro')) return 'CASH';
  if (normalized.includes('pix')) return 'PIX';
  if (
    ['cartao', 'credito', 'debito', 'visa', 'master', 'elo', 'amex'].some((term) =>
      normalized.includes(term),
    )
  ) {
    return 'CARD';
  }
  return undefined;
}

function normalizePhone(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const digits = value.replace(/\D/g, '');
  return digits.length >= 8 && digits.length <= 15 ? digits : undefined;
}

function eventTimestamp(envelope: AiqfomeWebhookEnvelope): string | null {
  for (const key of ['created_at', 'read_at', 'ready_at', 'canceled_at'] as const) {
    const value = envelope.data[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function parseProviderDate(value: string | null): Date | null {
  if (!value) return null;
  const parsed = new Date(value.includes('T') ? value : value.replace(' ', 'T'));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function matchesDigest(value: string, expectedHex: string): boolean {
  const actual = Buffer.from(digest(value), 'hex');
  const expected = Buffer.from(expectedHex, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function inactiveWebhook(): AiqfomeIntegrationConfig['webhook'] {
  return {
    status: 'INACTIVE',
    secretDigest: null,
    registrations: [],
    updatedAt: new Date().toISOString(),
  };
}

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

function isPermanentProviderFailure(error: unknown): boolean {
  if (error instanceof HttpException) {
    const status = error.getStatus();
    return status >= 400 && status < 500 && status !== 429;
  }
  if (!(error instanceof AiqfomeProviderError)) return false;
  return (
    error.httpStatus !== undefined &&
    error.httpStatus >= 400 &&
    error.httpStatus < 500 &&
    error.httpStatus !== 429
  );
}

function safeErrorCode(error: unknown): string {
  if (error instanceof AiqfomeProviderError) return error.code.slice(0, 100);
  if (error instanceof Error && error.name) return error.name.slice(0, 100);
  return 'INBOUND_PROCESSING_FAILED';
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

class InboundReviewError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'InboundReviewError';
  }
}

class InboundIgnoredError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'InboundIgnoredError';
  }
}
