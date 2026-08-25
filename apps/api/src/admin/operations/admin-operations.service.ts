import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  AdminActivityQuery,
  DeliveryOperationsQuery,
  ReorderDispatchQueuePayload,
} from '@motoboycity/validation';
import type {
  AdminDeliveryDispatchAudit,
  AdminDispatchQueueResult,
  AdminOperationsResult,
  OperationalActivityEvent,
  OperationalActivityType,
  SilentDriverItem,
} from '@motoboycity/types';
import type { DeliveryOfferResponse, User } from '@prisma/client';
import { DeliveriesService } from '../../deliveries/deliveries.service';
import { LiveDriverPresenceService } from '../../live-presence/live-driver-presence.service';
import { PrismaService } from '../../prisma/prisma.service';
import { RealtimeGateway } from '../../realtime/realtime.gateway';
import { LocationSilenceService } from '../../tracking/location-silence.service';
import { deliveryActivityMessage, offerActivityMessage } from '../../common/status-labels';

const ACTIVE_DRIVER_DELIVERY_STATUSES = ['ACCEPTED', 'COLLECTED', 'DELIVERED'] as const;
const ADMIN_CANCELLED_RETENTION_MS = 15 * 60 * 1000;

@Injectable()
export class AdminOperationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly deliveriesService: DeliveriesService,
    private readonly livePresence: LiveDriverPresenceService,
    private readonly locationSilenceService: LocationSilenceService,
    private readonly realtimeGateway: RealtimeGateway,
  ) {}

  /** Delega: a regra de silencio vive junto do rastreamento, que e o dono do dado. */
  silentDrivers(): Promise<SilentDriverItem[]> {
    return this.locationSilenceService.listSilentDrivers();
  }

  async overview(user: User, filters: DeliveryOperationsQuery): Promise<AdminOperationsResult> {
    const cancelledSince = new Date(Date.now() - ADMIN_CANCELLED_RETENTION_MS);
    const [deliveries, snapshots] = await Promise.all([
      this.deliveriesService.operations(user, filters, {
        statuses: ['CANCELLED'],
        changedSince: cancelledSince,
        // A janela de 15 minutos ja limita o volume. Um teto por quantidade
        // faria cancelamentos sumirem cedo em um pico operacional.
        limit: null,
      }),
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
        user: { select: { name: true, phone: true, avatarUrl: true } },
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

    const unorderedOnlineDrivers = drivers
      .flatMap((driver) => {
        const snapshot = snapshotByDriver.get(driver.id);
        if (!snapshot) return [];
        return [
          {
            id: driver.id,
            name: driver.user.name,
            phone: driver.user.phone,
            avatarUrl: driver.user.avatarUrl,
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
      })
      .sort((left, right) => {
        const leftTime = left.availabilitySince
          ? new Date(left.availabilitySince).getTime()
          : Number.MAX_SAFE_INTEGER;
        const rightTime = right.availabilitySince
          ? new Date(right.availabilitySince).getTime()
          : Number.MAX_SAFE_INTEGER;
        return leftTime - rightTime || left.id.localeCompare(right.id);
      });
    const orderedDriverIds = await this.livePresence.orderForDispatch(
      unorderedOnlineDrivers.map((driver) => driver.id),
    );
    const driverById = new Map(unorderedOnlineDrivers.map((driver) => [driver.id, driver]));
    const onlineDrivers = orderedDriverIds.flatMap((driverId, index) => {
      const driver = driverById.get(driverId);
      return driver ? [{ ...driver, queuePosition: index + 1 }] : [];
    });

    return {
      ...deliveries,
      // Os contadores precisam representar exatamente o que ainda esta na
      // fila, nao todo o historico terminal armazenado no banco.
      counts: {
        ...deliveries.counts,
        COMPLETED: 0,
        CANCELLED: deliveries.recent.length,
      },
      onlineDrivers,
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * Reordena somente motoboys que continuam online. Quem entrou enquanto o
   * admin editava e anexado ao fim; quem saiu obriga a tela a atualizar para
   * evitar que uma decisao seja salva sobre uma fila antiga.
   */
  async reorderDispatchQueue(
    user: User,
    payload: ReorderDispatchQueuePayload,
  ): Promise<AdminDispatchQueueResult> {
    const snapshots = await this.livePresence.listActive();
    const activeDriverIds = snapshots.map((snapshot) => snapshot.driverId);
    const activeDriverIdSet = new Set(activeDriverIds);
    const offlineDriverIds = payload.driverIds.filter(
      (driverId) => !activeDriverIdSet.has(driverId),
    );
    if (offlineDriverIds.length > 0) {
      throw new ConflictException(
        'A fila mudou porque um motoboy ficou offline. Atualize e tente novamente.',
      );
    }

    const currentOrder = await this.livePresence.orderForDispatch(activeDriverIds);
    const requestedDriverIds = new Set(payload.driverIds);
    const finalOrder = [
      ...payload.driverIds,
      ...currentOrder.filter((driverId) => !requestedDriverIds.has(driverId)),
    ];
    await this.livePresence.replaceDispatchOrder(finalOrder);

    const updatedAt = new Date().toISOString();
    this.realtimeGateway.emitAdminActivity({
      type: 'GENERIC',
      message: `${user.name} alterou a sequencia da fila de motoboys.`,
    });
    this.realtimeGateway.emitDispatchQueueUpdated({ driverIds: finalOrder, updatedAt });
    return { driverIds: finalOrder, updatedAt };
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
          changedByUser: {
            select: {
              name: true,
              type: true,
              driver: { select: { id: true } },
            },
          },
          delivery: {
            select: {
              id: true,
              displayNumber: true,
              companyId: true,
              status: true,
              company: { select: { tradeName: true } },
              driver: {
                select: {
                  id: true,
                  user: { select: { name: true } },
                },
              },
            },
          },
        },
      }),
      this.prisma.deliveryOffer.findMany({
        where: { offeredAt: { lt: before } },
        orderBy: { offeredAt: 'desc' },
        take,
        include: {
          delivery: {
            select: {
              id: true,
              displayNumber: true,
              companyId: true,
              company: { select: { tradeName: true } },
            },
          },
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
      ...histories.map((history) => {
        const actorDriver =
          history.changedByUser?.type === 'DRIVER' && history.changedByUser.driver
            ? {
                id: history.changedByUser.driver.id,
                name: history.changedByUser.name,
              }
            : null;
        const assignedDriver = history.delivery.driver
          ? {
              id: history.delivery.driver.id,
              name: history.delivery.driver.user.name,
            }
          : null;
        const driver = actorDriver ?? assignedDriver;

        return {
          id: `status:${history.id}`,
          type: (history.toStatus === 'CANCELLED'
            ? 'DELIVERY_CANCELLED'
            : history.fromStatus === null
              ? 'DELIVERY_CREATED'
              : 'DELIVERY_STATUS_CHANGED') as OperationalActivityType,
          message: deliveryActivityMessage({
            displayNumber: history.delivery.displayNumber,
            companyName: history.delivery.company.tradeName,
            status: history.toStatus,
            driverName: driver?.name,
          }),
          at: history.changedAt.toISOString(),
          deliveryId: history.delivery.id,
          displayNumber: history.delivery.displayNumber,
          companyId: history.delivery.companyId,
          companyName: history.delivery.company.tradeName,
          ...(driver ? { driverId: driver.id, driverName: driver.name } : {}),
          status: history.delivery.status,
        };
      }),
      ...offers.map((offer) => ({
        id: `offer:${offer.id}:${offer.response}`,
        type: this.offerActivityType(offer.response),
        message: offerActivityMessage({
          displayNumber: offer.delivery.displayNumber,
          companyName: offer.delivery.company.tradeName,
          response: offer.response,
          driverName: offer.driver.user.name,
        }),
        at: (offer.respondedAt ?? offer.offeredAt).toISOString(),
        deliveryId: offer.delivery.id,
        displayNumber: offer.delivery.displayNumber,
        companyId: offer.delivery.companyId,
        companyName: offer.delivery.company.tradeName,
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
