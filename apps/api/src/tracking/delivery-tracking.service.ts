import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  ListDeliveryTrackingQuery,
  ReportDeliveryLocationPayload,
} from '@motoboycity/validation';
import type { DeliveryStatus, User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { endOfDayInSaoPaulo, startOfDayInSaoPaulo } from '../common/sao-paulo-time';

// FAILED continua rastreavel: o motoboy esta voltando com a mercadoria, e e
// justamente nesse trecho que a empresa quer saber onde ela esta.
const ACTIVE_TRACKING_STATUSES: DeliveryStatus[] = ['ACCEPTED', 'COLLECTED', 'DELIVERED', 'FAILED'];
const LOCATION_RETENTION_DAYS = 30;

export interface DeliveryTrackingPointItem {
  id: string;
  lat: number;
  lng: number;
  accuracy: number | null;
  capturedAt: string;
}

export interface DeliveryTrackingDetail {
  deliveryId: string;
  displayNumber: number;
  status: DeliveryStatus;
  isActive: boolean;
  driver: { id: string; name: string } | null;
  lastLocation: DeliveryTrackingPointItem | null;
  points: DeliveryTrackingPointItem[];
  historyAvailableSince: string;
}

export interface ActiveDeliveryTrackingItem {
  deliveryId: string;
  displayNumber: number;
  companyId: string;
  companyName: string;
  driver: { id: string; name: string; phone: string };
  status: DeliveryStatus;
  lastLocation: DeliveryTrackingPointItem | null;
}

@Injectable()
export class DeliveryTrackingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtimeGateway: RealtimeGateway,
  ) {}

  async report(
    user: User,
    deliveryId: string,
    payload: ReportDeliveryLocationPayload,
  ): Promise<DeliveryTrackingPointItem> {
    if (user.type !== 'DRIVER') {
      throw new ForbiddenException('Apenas o motoboy da entrega pode transmitir localização.');
    }
    const driver = await this.prisma.driver.findUnique({
      where: { userId: user.id },
      select: { id: true },
    });
    if (!driver)
      throw new ForbiddenException('Usuário não está vinculado a um cadastro de motoboy.');

    const delivery = await this.prisma.delivery.findUnique({
      where: { id: deliveryId },
      select: { id: true, driverId: true, companyId: true, status: true },
    });
    if (!delivery) throw new NotFoundException('Pedido não encontrado.');
    if (delivery.driverId !== driver.id) {
      throw new ForbiddenException('Você não está atribuído a este pedido.');
    }
    if (!ACTIVE_TRACKING_STATUSES.includes(delivery.status)) {
      throw new ConflictException('O rastreamento só é aceito durante uma entrega ativa.');
    }

    const capturedAt = new Date();
    const point = await this.prisma.$transaction(async (tx) => {
      const created = await tx.deliveryLocationPoint.create({
        data: {
          deliveryId: delivery.id,
          driverId: driver.id,
          lat: payload.lat,
          lng: payload.lng,
          accuracy: payload.accuracy,
          capturedAt,
        },
      });
      await tx.driver.update({
        where: { id: driver.id },
        data: {
          lastKnownLat: payload.lat,
          lastKnownLng: payload.lng,
          lastSeenAt: capturedAt,
        },
      });
      return created;
    });

    const item = this.toPoint(point);
    this.realtimeGateway.emitDeliveryLocation(delivery.companyId, {
      deliveryId: delivery.id,
      driverId: driver.id,
      ...item,
    });
    return item;
  }

  async detail(
    user: User,
    deliveryId: string,
    query: ListDeliveryTrackingQuery,
  ): Promise<DeliveryTrackingDetail> {
    const delivery = await this.prisma.delivery.findUnique({
      where: { id: deliveryId },
      include: {
        driver: { include: { user: { select: { name: true } } } },
      },
    });
    if (!delivery) throw new NotFoundException('Pedido não encontrado.');
    await this.assertCanReadDelivery(user, delivery.companyId, delivery.driverId);

    const historyAvailableSince = this.retentionCutoff();
    const points = await this.prisma.deliveryLocationPoint.findMany({
      where: {
        deliveryId,
        capturedAt: {
          gte: query.from ? this.startOfDay(query.from) : historyAvailableSince,
          ...(query.to && { lte: this.endOfDay(query.to) }),
        },
      },
      orderBy: { capturedAt: 'asc' },
      take: query.limit,
    });
    const lastLocation = points.at(-1)
      ? this.toPoint(points.at(-1)!)
      : await this.lastPointForDelivery(deliveryId, historyAvailableSince);

    return {
      deliveryId: delivery.id,
      displayNumber: delivery.displayNumber,
      status: delivery.status,
      isActive: ACTIVE_TRACKING_STATUSES.includes(delivery.status),
      driver: delivery.driver ? { id: delivery.driver.id, name: delivery.driver.user.name } : null,
      lastLocation,
      points: points.map((point) => this.toPoint(point)),
      historyAvailableSince: historyAvailableSince.toISOString(),
    };
  }

  async active(user: User): Promise<ActiveDeliveryTrackingItem[]> {
    const where = await this.activeDeliveryScope(user);
    const cutoff = this.retentionCutoff();
    const deliveries = await this.prisma.delivery.findMany({
      where,
      include: {
        company: { select: { tradeName: true } },
        driver: { include: { user: { select: { name: true, phone: true } } } },
        trackingPoints: {
          where: { capturedAt: { gte: cutoff } },
          orderBy: { capturedAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { statusChangedAt: 'asc' },
    });

    return deliveries.flatMap((delivery) => {
      if (!delivery.driver) return [];
      return [
        {
          deliveryId: delivery.id,
          displayNumber: delivery.displayNumber,
          companyId: delivery.companyId,
          companyName: delivery.company.tradeName,
          driver: {
            id: delivery.driver.id,
            name: delivery.driver.user.name,
            phone: delivery.driver.user.phone,
          },
          status: delivery.status,
          lastLocation: delivery.trackingPoints[0]
            ? this.toPoint(delivery.trackingPoints[0])
            : null,
        },
      ];
    });
  }

  async purgeExpiredPoints(now = new Date()): Promise<number> {
    const deleted = await this.prisma.deliveryLocationPoint.deleteMany({
      where: { capturedAt: { lt: this.retentionCutoff(now) } },
    });
    return deleted.count;
  }

  private async activeDeliveryScope(user: User) {
    const status = { in: ACTIVE_TRACKING_STATUSES };
    if (user.type === 'ADMIN') return { status };
    if (user.type === 'DRIVER') {
      const driver = await this.prisma.driver.findUnique({
        where: { userId: user.id },
        select: { id: true },
      });
      if (!driver)
        throw new ForbiddenException('Usuário não está vinculado a um cadastro de motoboy.');
      return { status, driverId: driver.id };
    }
    if (user.type === 'COMPANY_MEMBER') {
      const memberships = await this.prisma.companyTeamMember.findMany({
        where: { userId: user.id, active: true },
        select: { companyId: true },
      });
      if (memberships.length === 0)
        throw new ForbiddenException('Usuário não está vinculado a uma empresa ativa.');
      return { status, companyId: { in: memberships.map((membership) => membership.companyId) } };
    }
    throw new ForbiddenException('Seu perfil não pode consultar rastreamento.');
  }

  private async assertCanReadDelivery(
    user: User,
    companyId: string,
    driverId: string | null,
  ): Promise<void> {
    if (user.type === 'ADMIN') return;
    if (user.type === 'DRIVER') {
      const driver = await this.prisma.driver.findUnique({
        where: { userId: user.id },
        select: { id: true },
      });
      if (driver?.id === driverId) return;
      throw new ForbiddenException('Você não está atribuído a este pedido.');
    }
    if (user.type === 'COMPANY_MEMBER') {
      const membership = await this.prisma.companyTeamMember.findFirst({
        where: { userId: user.id, companyId, active: true },
        select: { id: true },
      });
      if (membership) return;
    }
    throw new ForbiddenException('Você não pode consultar a localização deste pedido.');
  }

  private async lastPointForDelivery(
    deliveryId: string,
    cutoff: Date,
  ): Promise<DeliveryTrackingPointItem | null> {
    const point = await this.prisma.deliveryLocationPoint.findFirst({
      where: { deliveryId, capturedAt: { gte: cutoff } },
      orderBy: { capturedAt: 'desc' },
    });
    return point ? this.toPoint(point) : null;
  }

  private toPoint(point: {
    id: string;
    lat: { toString(): string };
    lng: { toString(): string };
    accuracy: { toString(): string } | null;
    capturedAt: Date;
  }): DeliveryTrackingPointItem {
    return {
      id: point.id,
      lat: Number(point.lat),
      lng: Number(point.lng),
      accuracy: point.accuracy === null ? null : Number(point.accuracy),
      capturedAt: point.capturedAt.toISOString(),
    };
  }

  private retentionCutoff(now = new Date()): Date {
    return new Date(now.getTime() - LOCATION_RETENTION_DAYS * 24 * 60 * 60 * 1_000);
  }

  /**
   * O filtro por data e lido no relogio da operacao, nao em UTC.
   *
   * Com as pontas em `T00:00:00Z`/`T23:59:59Z`, o registro das 22h de terca
   * caia no recorte de quarta: tres horas de todo dia lancadas no dia errado.
   * Quem digita 22/08 no painel quer o dia 22 em Lajinha.
   */
  private startOfDay(value: string): Date {
    return startOfDayInSaoPaulo(value);
  }

  private endOfDay(value: string): Date {
    return endOfDayInSaoPaulo(value);
  }
}
