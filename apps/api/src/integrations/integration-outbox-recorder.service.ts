import { Injectable } from '@nestjs/common';
import type { DeliveryStatus, IntegrationLogisticAction, Prisma } from '@prisma/client';

const ACTION_BY_STATUS: Partial<Record<DeliveryStatus, IntegrationLogisticAction>> = {
  ACCEPTED: 'PICKUP_ONGOING',
  COLLECTED: 'DELIVERY_ONGOING',
  DELIVERED: 'ORDER_DELIVERED',
  CANCELLED: 'DELIVERY_CANCELED',
  FAILED: 'DELIVERY_CANCELED',
};

@Injectable()
export class IntegrationOutboxRecorder {
  async record(
    tx: Prisma.TransactionClient,
    deliveryId: string,
    toStatus: DeliveryStatus,
  ): Promise<void> {
    const action = ACTION_BY_STATUS[toStatus];
    if (!action) return;
    const delivery = await tx.delivery.findUnique({
      where: { id: deliveryId },
      select: { integrationId: true, externalOrderId: true },
    });
    if (!delivery?.integrationId || !delivery.externalOrderId) return;

    await tx.integrationOutboundEvent.upsert({
      where: {
        integrationId_deliveryId_action: {
          integrationId: delivery.integrationId,
          deliveryId,
          action,
        },
      },
      create: {
        integrationId: delivery.integrationId,
        deliveryId,
        externalOrderId: delivery.externalOrderId,
        action,
      },
      update: {},
    });
  }
}
