import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  AdminActivityQuery,
  DeliveryOperationsQuery,
} from '@motoboycity/validation';
import type {
  AdminDeliveryDispatchAudit,
  AdminOperationsResult,
  OperationalActivityEvent,
  OperationalActivityType,
} from '@motoboycity/types';
import type { DeliveryOfferResponse, User } from '@prisma/client';
import { DeliveriesService } from '../../deliveries/deliveries.service';
import { LiveDriverPresenceService } from '../../live-presence/live-driver-presence.service';
import { PrismaService } from '../../prisma/prisma.service';

const ACTIVE_DRIVER_DELIVERY_STATUSES = ['ACCEPTED', 'COLLECTED', 'DELIVERED'] as const;

@Injectable()
export class AdminOperationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly deliveriesService: DeliveriesService,
    private readonly livePresence: LiveDriverPresenceService,
  ) {}

  async overview(
    user: User,
    filters: DeliveryOperationsQuery,
  ): Promise<AdminOperationsResult> {
    const [deliveries, snapshots] = await Promise.all([
      this.deliveriesService.operations(user, filters),
      this.livePresence.listActive(),
    ]);
    const snapshotByDriver = new Map(snapshots.map((snapshot) => [snapshot.driverId, snapshot]));
    const drivers = await this.prisma.driver.findMany({
      where: {
        id: { in: snapshots.map((snapshot) => snapshot.driverId) },
        availability: 'AVAILABLE',
        approvalStatus: 'APPROVED',
        accountStatus: 'ACTIVE',
      },
      include: {
        user: { select: { name: true, phone: true } },
        presenceLogs: {
          where: { wentOfflineAt: null },
          orderBy: { wentOnlineAt: 'desc' },
          take: 1,
        },
        serviceTypes: { include: { serviceType: true } },
        deliveries: {
          where: { status: { in: [...ACTIVE_DRIVER_DELIVERY_STATUSES] } },
          select: { id: true },
        },
      },
    });

    return {
      ...deliveries,
      onlineDrivers: drivers.flatMap((driver) => {
        const snapshot = snapshotByDriver.get(driver.id);
        if (!snapshot) return [];
        return [
          {
            id: driver.id,
            name: driver.user.name,
            phone: driver.user.phone,
            appVersion: snapshot.appVersion,
            availabilitySince: driver.presenceLogs[0]?.wentOnlineAt.toISOString() ?? null,
            serviceTypes: driver.serviceTypes.map((assignment) => ({
              id: assignment.serviceType.id,
              code: assignment.serviceType.code,
              name: assignment.serviceType.name,
              isPrimary: assignment.isPrimary,
            })),
            location: {
              id: `presence:${driver.id}`,
              lat: snapshot.lat,
              lng: snapshot.lng,
              accuracy: snapshot.accuracy,
              capturedAt: snapshot.capturedAt,
            },
            activeDeliveryIds: driver.deliveries.map((delivery) => delivery.id),
          },
        ];
      }),
      generatedAt: new Date().toISOString(),
    };
  }

  async activity(query: AdminActivityQuery): Promise<OperationalActivityEvent[]> {
    const before = query.before ? new Date(query.before) : new Date();
    const take = query.limit;
    const [histories, offers, presences] = await Promise.all([
      this.prisma.deliveryStatusHistory.findMany({
        where: { changedAt: { lt: before } },
        orderBy: { changedAt: 'desc' },
        take,
        include: {
          delivery: {
            select: {
              id: true,
              displayNumber: true,
              companyId: true,
              status: true,
              company: { select: { tradeName: true } },
            },
          },
        },
      }),
      this.prisma.deliveryOffer.findMany({
        where: { offeredAt: { lt: before } },
        orderBy: { offeredAt: 'desc' },
        take,
        include: {
          delivery: { select: { id: true, displayNumber: true, companyId: true } },
          driver: { include: { user: { select: { name: true } } } },
        },
      }),
      this.prisma.driverPresenceLog.findMany({
        where: { wentOnlineAt: { lt: before } },
        orderBy: { wentOnlineAt: 'desc' },
        take,
        include: { driver: { include: { user: { select: { name: true } } } } },
      }),
    ]);

    const events: OperationalActivityEvent[] = [
      ...histories.map((history) => ({
        id: `status:${history.id}`,
        type: (history.toStatus === 'CANCELLED'
          ? 'DELIVERY_CANCELLED'
          : history.fromStatus === null
            ? 'DELIVERY_CREATED'
            : 'DELIVERY_STATUS_CHANGED') as OperationalActivityType,
        message: `Pedido #${history.delivery.displayNumber}: ${history.toStatus}.`,
        at: history.changedAt.toISOString(),
        deliveryId: history.delivery.id,
        displayNumber: history.delivery.displayNumber,
        companyId: history.delivery.companyId,
        companyName: history.delivery.company.tradeName,
        status: history.delivery.status,
      })),
      ...offers.map((offer) => ({
        id: `offer:${offer.id}:${offer.response}`,
        type: this.offerActivityType(offer.response),
        message: `Oferta do pedido #${offer.delivery.displayNumber}: ${offer.response}.`,
        at: (offer.respondedAt ?? offer.offeredAt).toISOString(),
        deliveryId: offer.delivery.id,
        displayNumber: offer.delivery.displayNumber,
        companyId: offer.delivery.companyId,
        driverId: offer.driverId,
        driverName: offer.driver.user.name,
      })),
      ...presences.flatMap((presence) => [
        {
          id: `presence:${presence.id}:online`,
          type: 'DRIVER_ONLINE' as const,
          message: `${presence.driver.user.name} ficou online.`,
          at: presence.wentOnlineAt.toISOString(),
          driverId: presence.driverId,
          driverName: presence.driver.user.name,
        },
        ...(presence.wentOfflineAt
          ? [
              {
                id: `presence:${presence.id}:offline`,
                type: 'DRIVER_OFFLINE' as const,
                message: `${presence.driver.user.name} ficou offline.`,
                at: presence.wentOfflineAt.toISOString(),
                driverId: presence.driverId,
                driverName: presence.driver.user.name,
              },
            ]
          : []),
      ]),
    ];
    return events
      .filter((event) => new Date(event.at) < before)
      .sort((left, right) => right.at.localeCompare(left.at))
      .slice(0, take);
  }

  async dispatchAudit(deliveryId: string): Promise<AdminDeliveryDispatchAudit> {
    const exists = await this.prisma.delivery.findUnique({
      where: { id: deliveryId },
      select: { id: true },
    });
    if (!exists) throw new NotFoundException('Pedido não encontrado.');
    const offers = await this.prisma.deliveryOffer.findMany({
      where: { deliveryId },
      orderBy: { offeredAt: 'asc' },
      include: { driver: { include: { user: { select: { name: true } } } } },
    });
    return {
      deliveryId,
      offers: offers.map((offer) => ({
        id: offer.id,
        offerId: offer.id,
        driver: { id: offer.driverId, name: offer.driver.user.name },
        offeredAt: offer.offeredAt.toISOString(),
        respondedAt: offer.respondedAt?.toISOString() ?? null,
        response: offer.response,
      })),
    };
  }

  private offerActivityType(response: DeliveryOfferResponse): OperationalActivityType {
    switch (response) {
      case 'ACCEPTED':
        return 'OFFER_ACCEPTED';
      case 'DECLINED':
        return 'OFFER_DECLINED';
      case 'EXPIRED':
        return 'OFFER_EXPIRED';
      default:
        return 'OFFER_CREATED';
    }
  }
}
