import type { Prisma } from '@prisma/client';
import { IntegrationOutboxRecorder } from './integration-outbox-recorder.service';

describe('IntegrationOutboxRecorder', () => {
  const service = new IntegrationOutboxRecorder();

  it('grava o marco logistico na mesma transacao para pedido integrado', async () => {
    const tx = {
      delivery: {
        findUnique: jest.fn().mockResolvedValue({
          integrationId: 'integration-1',
          externalOrderId: '68670787',
        }),
      },
      integrationOutboundEvent: { upsert: jest.fn().mockResolvedValue({}) },
    };

    await service.record(tx as unknown as Prisma.TransactionClient, 'delivery-1', 'COLLECTED');

    expect(tx.integrationOutboundEvent.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          integrationId: 'integration-1',
          deliveryId: 'delivery-1',
          externalOrderId: '68670787',
          action: 'DELIVERY_ONGOING',
        }),
      }),
    );
  });

  it('nao cria evento para pedido manual', async () => {
    const tx = {
      delivery: {
        findUnique: jest.fn().mockResolvedValue({ integrationId: null, externalOrderId: null }),
      },
      integrationOutboundEvent: { upsert: jest.fn() },
    };

    await service.record(tx as unknown as Prisma.TransactionClient, 'delivery-1', 'ACCEPTED');
    expect(tx.integrationOutboundEvent.upsert).not.toHaveBeenCalled();
  });
});
