import type { Queue } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { AiqfomeClient, AiqfomeProviderError } from './aiqfome-client';
import { AiqfomeOutboundService } from './aiqfome-outbound.service';
import { AiqfomeTokenService } from './aiqfome-token.service';
import { AiqfomeWebhookService } from './aiqfome-webhook.service';

describe('AiqfomeOutboundService', () => {
  function createSubject() {
    const prisma = {
      integrationOutboundEvent: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue({
          id: 'outbound-1',
          integrationId: 'integration-1',
          deliveryId: 'delivery-1',
          externalOrderId: '25049',
          action: 'PICKUP_ONGOING',
          attempts: 1,
          createdAt: new Date('2026-08-28T14:00:00.000Z'),
          integration: { provider: 'AIQFOME', status: 'CONNECTED' },
        }),
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const tokenService = {
      executeWithAccessToken: jest.fn(
        async (_id: string, operation: (accessToken: string) => Promise<unknown>) =>
          operation('access-token'),
      ),
    };
    const client = { markLogisticStatus: jest.fn().mockResolvedValue(undefined) };
    const webhookService = { reconcileConfiguredIntegrations: jest.fn().mockResolvedValue(undefined) };
    const queue = { add: jest.fn().mockResolvedValue({}) };

    return {
      service: new AiqfomeOutboundService(
        prisma as unknown as PrismaService,
        tokenService as unknown as AiqfomeTokenService,
        client as unknown as AiqfomeClient,
        webhookService as unknown as AiqfomeWebhookService,
        queue as unknown as Queue,
      ),
      prisma,
      tokenService,
      client,
      queue,
    };
  }

  it('envia o marco oficial e conclui a outbox', async () => {
    const { service, prisma, client } = createSubject();

    await service.send('outbound-1');

    expect(client.markLogisticStatus).toHaveBeenCalledWith(
      '25049',
      'pickup-ongoing',
      'access-token',
    );
    expect(prisma.integrationOutboundEvent.update).toHaveBeenLastCalledWith({
      where: { id: 'outbound-1' },
      data: { status: 'SENT', sentAt: expect.any(Date), nextAttemptAt: null, errorCode: null },
    });
  });

  it('agenda retry quando o provedor falha temporariamente', async () => {
    const { service, prisma, client } = createSubject();
    client.markLogisticStatus.mockRejectedValue(
      new AiqfomeProviderError('LOGISTIC_STATUS_UPDATE_FAILED', 503),
    );

    await service.send('outbound-1');

    expect(prisma.integrationOutboundEvent.update).toHaveBeenLastCalledWith({
      where: { id: 'outbound-1' },
      data: expect.objectContaining({
        status: 'FAILED_RETRYABLE',
        errorCode: 'LOGISTIC_STATUS_UPDATE_FAILED',
        nextAttemptAt: expect.any(Date),
      }),
    });
  });

  it('nao ultrapassa um marco anterior ainda pendente', async () => {
    const { service, prisma, client } = createSubject();
    prisma.integrationOutboundEvent.findFirst.mockResolvedValue({
      status: 'FAILED_RETRYABLE',
      nextAttemptAt: new Date(Date.now() + 60_000),
    });

    await service.send('outbound-1');

    expect(client.markLogisticStatus).not.toHaveBeenCalled();
    expect(prisma.integrationOutboundEvent.update).toHaveBeenLastCalledWith({
      where: { id: 'outbound-1' },
      data: expect.objectContaining({
        status: 'FAILED_RETRYABLE',
        errorCode: 'PREVIOUS_EVENT_PENDING',
      }),
    });
  });

  it('falha fechado quando um marco anterior terminou em erro permanente', async () => {
    const { service, prisma, client } = createSubject();
    prisma.integrationOutboundEvent.findFirst.mockResolvedValue({
      status: 'FAILED_FINAL',
      nextAttemptAt: null,
    });

    await service.send('outbound-1');

    expect(client.markLogisticStatus).not.toHaveBeenCalled();
    expect(prisma.integrationOutboundEvent.update).toHaveBeenLastCalledWith({
      where: { id: 'outbound-1' },
      data: expect.objectContaining({
        status: 'FAILED_FINAL',
        errorCode: 'PREVIOUS_EVENT_FAILED',
        nextAttemptAt: null,
      }),
    });
  });
});
