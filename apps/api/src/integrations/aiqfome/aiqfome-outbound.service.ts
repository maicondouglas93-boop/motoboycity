import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, OnModuleInit } from '@nestjs/common';
import type { IntegrationLogisticAction } from '@prisma/client';
import type { Queue } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { INTEGRATION_OUTBOUND_QUEUE } from '../integration-events.module';
import { AiqfomeClient, AiqfomeProviderError } from './aiqfome-client';
import { AiqfomeTokenService } from './aiqfome-token.service';
import { AiqfomeWebhookService } from './aiqfome-webhook.service';

export const SCAN_INTEGRATION_OUTBOX_JOB = 'scan-integration-outbox';
export const SEND_INTEGRATION_OUTBOX_JOB = 'send-integration-outbox';

@Injectable()
export class AiqfomeOutboundService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokenService: AiqfomeTokenService,
    private readonly client: AiqfomeClient,
    private readonly webhookService: AiqfomeWebhookService,
    @InjectQueue(INTEGRATION_OUTBOUND_QUEUE) private readonly queue: Queue,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.queue.add(
      SCAN_INTEGRATION_OUTBOX_JOB,
      {},
      {
        jobId: 'integration-outbox-scan',
        repeat: { every: 30_000 },
        removeOnComplete: true,
        removeOnFail: 20,
      },
    );
    await this.enqueuePending();
  }

  async enqueuePending(): Promise<void> {
    await this.webhookService.reconcileConfiguredIntegrations();
    const staleBefore = new Date(Date.now() - 10 * 60_000);
    await this.prisma.integrationOutboundEvent.updateMany({
      where: { status: 'PROCESSING', updatedAt: { lt: staleBefore } },
      data: { status: 'FAILED_RETRYABLE', nextAttemptAt: new Date() },
    });
    const pending = await this.prisma.integrationOutboundEvent.findMany({
      where: {
        OR: [
          { status: 'PENDING' },
          { status: 'FAILED_RETRYABLE', nextAttemptAt: { lte: new Date() } },
        ],
      },
      orderBy: { createdAt: 'asc' },
      take: 100,
      select: { id: true },
    });
    for (const event of pending) {
      await this.queue.add(
        SEND_INTEGRATION_OUTBOX_JOB,
        { eventId: event.id },
        {
          jobId: `integration-outbound-${event.id}-${Date.now()}`,
          removeOnComplete: true,
          removeOnFail: true,
        },
      );
    }
  }

  async send(eventId: string): Promise<void> {
    const claimed = await this.prisma.integrationOutboundEvent.updateMany({
      where: {
        id: eventId,
        OR: [
          { status: 'PENDING' },
          { status: 'FAILED_RETRYABLE', nextAttemptAt: { lte: new Date() } },
        ],
      },
      data: { status: 'PROCESSING', attempts: { increment: 1 }, errorCode: null },
    });
    if (claimed.count !== 1) return;

    const event = await this.prisma.integrationOutboundEvent.findUnique({
      where: { id: eventId },
      include: { integration: { select: { provider: true, status: true } } },
    });
    if (!event) return;
    if (event.integration.provider !== 'AIQFOME') {
      await this.fail(event.id, event.attempts, 'FAILED_FINAL', 'PROVIDER_NOT_SUPPORTED');
      return;
    }
    if (event.integration.status !== 'CONNECTED') {
      await this.fail(event.id, event.attempts, 'FAILED_RETRYABLE', 'INTEGRATION_NOT_CONNECTED');
      return;
    }

    const previous = await this.prisma.integrationOutboundEvent.findFirst({
      where: {
        deliveryId: event.deliveryId,
        createdAt: { lt: event.createdAt },
        status: { not: 'SENT' },
      },
      orderBy: { createdAt: 'asc' },
      select: { status: true, nextAttemptAt: true },
    });
    if (previous) {
      if (previous.status === 'FAILED_FINAL') {
        await this.fail(event.id, event.attempts, 'FAILED_FINAL', 'PREVIOUS_EVENT_FAILED');
      } else {
        await this.deferBehindPrevious(event.id, previous.nextAttemptAt);
      }
      return;
    }

    try {
      await this.tokenService.executeWithAccessToken(event.integrationId, (accessToken) =>
        this.client.markLogisticStatus(
          event.externalOrderId,
          logisticStatus(event.action),
          accessToken,
        ),
      );
      await this.prisma.integrationOutboundEvent.update({
        where: { id: event.id },
        data: { status: 'SENT', sentAt: new Date(), nextAttemptAt: null, errorCode: null },
      });
    } catch (error) {
      const final = isPermanent(error);
      await this.fail(
        event.id,
        event.attempts,
        final ? 'FAILED_FINAL' : 'FAILED_RETRYABLE',
        error instanceof AiqfomeProviderError ? error.code : 'OUTBOUND_SEND_FAILED',
      );
    }
  }

  private async fail(
    id: string,
    attempts: number,
    status: 'FAILED_RETRYABLE' | 'FAILED_FINAL',
    errorCode: string,
  ): Promise<void> {
    const delayMinutes = Math.min(60, 2 ** Math.min(attempts, 6));
    await this.prisma.integrationOutboundEvent.update({
      where: { id },
      data: {
        status,
        errorCode: errorCode.slice(0, 100),
        nextAttemptAt:
          status === 'FAILED_RETRYABLE' ? new Date(Date.now() + delayMinutes * 60_000) : null,
      },
    });
  }

  private async deferBehindPrevious(id: string, previousNextAttemptAt: Date | null): Promise<void> {
    const minimumRetryAt = new Date(Date.now() + 30_000);
    await this.prisma.integrationOutboundEvent.update({
      where: { id },
      data: {
        status: 'FAILED_RETRYABLE',
        errorCode: 'PREVIOUS_EVENT_PENDING',
        nextAttemptAt:
          previousNextAttemptAt && previousNextAttemptAt > minimumRetryAt
            ? previousNextAttemptAt
            : minimumRetryAt,
      },
    });
  }
}

function logisticStatus(action: IntegrationLogisticAction) {
  if (action === 'PICKUP_ONGOING') return 'pickup-ongoing' as const;
  if (action === 'DELIVERY_ONGOING') return 'delivery-ongoing' as const;
  if (action === 'ORDER_DELIVERED') return 'order-delivered' as const;
  return 'delivery-canceled' as const;
}

function isPermanent(error: unknown): boolean {
  return (
    error instanceof AiqfomeProviderError &&
    error.httpStatus !== undefined &&
    error.httpStatus >= 400 &&
    error.httpStatus < 500 &&
    error.httpStatus !== 429
  );
}
