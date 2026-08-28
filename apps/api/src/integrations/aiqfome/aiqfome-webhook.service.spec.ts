import { UnauthorizedException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { Queue } from 'bullmq';
import type { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { DeliveriesService } from '../../deliveries/deliveries.service';
import { AiqfomeClient } from './aiqfome-client';
import { AiqfomeTokenService } from './aiqfome-token.service';
import { AiqfomeWebhookService } from './aiqfome-webhook.service';

describe('AiqfomeWebhookService', () => {
  const secret = 'segredo-webhook-de-teste';
  const publicId = '11111111-1111-4111-8111-111111111111';
  const integrationId = '22222222-2222-4222-8222-222222222222';
  const webhookConfig = {
    version: 2,
    dispatchTrigger: 'NEW_ORDER_DELAYED',
    acceptedPayment: 'PREPAID_AND_ON_DELIVERY',
    store: { id: '54044', name: 'Loja', status: 'OPEN', document: '123', address: null },
    scopes: ['aqf:store:read', 'aqf:store:create', 'aqf:order:read', 'aqf:order:create'],
    serviceTypeId: '33333333-3333-4333-8333-333333333333',
    dispatchDelayMinutes: 10,
    webhook: {
      status: 'ACTIVE',
      secretDigest: createHash('sha256').update(secret).digest('hex'),
      registrations: [{ id: '1', event: 'new-order' }],
      updatedAt: '2026-08-28T12:00:00.000Z',
    },
    errorCode: null,
  };
  const envelope = {
    event: 'new-order' as const,
    store_id: '54044',
    data: { order_id: '68670787', created_at: '2026-08-28 09:00:00', user_name: 'Nao persistir' },
  };

  function subject() {
    const prisma = {
      integration: {
        findFirst: jest.fn().mockResolvedValue({ id: integrationId, config: webhookConfig }),
      },
      integrationInboundEvent: {
        create: jest.fn().mockResolvedValue({ id: 'event-1', status: 'RECEIVED', attempts: 0 }),
        findUniqueOrThrow: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const queue = { add: jest.fn().mockResolvedValue(undefined) };
    return {
      service: new AiqfomeWebhookService(
        prisma as unknown as PrismaService,
        {} as ConfigService,
        {} as AiqfomeClient,
        {} as AiqfomeTokenService,
        {} as DeliveriesService,
        queue as unknown as Queue,
      ),
      prisma,
      queue,
    };
  }

  it('autentica, persiste somente o envelope normalizado e enfileira', async () => {
    const { service, prisma, queue } = subject();

    await expect(service.receive(publicId, secret, envelope)).resolves.toEqual({
      accepted: true,
      duplicate: false,
    });

    const data = prisma.integrationInboundEvent.create.mock.calls[0]?.[0]?.data;
    expect(data).toMatchObject({
      integrationId,
      eventType: 'new-order',
      externalOrderId: '68670787',
      storeId: '54044',
      payload: { timestamp: '2026-08-28 09:00:00' },
    });
    expect(JSON.stringify(data)).not.toContain('Nao persistir');
    expect(queue.add).toHaveBeenCalledWith(
      'process-aiqfome-inbound',
      { eventId: 'event-1' },
      expect.objectContaining({ attempts: 8 }),
    );
  });

  it('rejeita segredo incorreto antes de persistir qualquer evento', async () => {
    const { service, prisma, queue } = subject();

    await expect(service.receive(publicId, 'segredo-incorreto', envelope)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(prisma.integrationInboundEvent.create).not.toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('recupera eventos persistidos quando o enfileiramento inicial falhou', async () => {
    const { service, prisma, queue } = subject();
    prisma.integrationInboundEvent.findMany.mockResolvedValue([
      { id: 'event-pendente', attempts: 3 },
    ]);

    await service.enqueuePending();

    expect(prisma.integrationInboundEvent.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'PROCESSING' }),
        data: { status: 'FAILED', errorCode: 'STALE_PROCESSING_RECOVERED' },
      }),
    );
    expect(queue.add).toHaveBeenCalledWith(
      'process-aiqfome-inbound',
      { eventId: 'event-pendente' },
      expect.objectContaining({ jobId: 'aiqfome-inbound-event-pendente-3' }),
    );
  });
});
