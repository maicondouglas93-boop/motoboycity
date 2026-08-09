import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { AdminPlatformSettingsService } from '../admin/platform-settings/admin-platform-settings.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { PrismaService } from '../prisma/prisma.service';

export const DISPATCH_QUEUE = 'dispatch';
export const OFFER_EXPIRE_JOB = 'offer-expire';
export const ACTIVATE_SCHEDULED_JOB = 'activate-scheduled';

function expireJobId(offerId: string): string {
  return `expire-${offerId}`;
}

function activateJobId(deliveryId: string): string {
  return `activate-${deliveryId}`;
}

@Injectable()
export class DispatchService {
  private readonly logger = new Logger(DispatchService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly platformSettingsService: AdminPlatformSettingsService,
    private readonly realtimeGateway: RealtimeGateway,
    @InjectQueue(DISPATCH_QUEUE) private readonly dispatchQueue: Queue,
  ) {}

  /** Chamado antes de criar um pedido AWAITING_DRIVER — falha alto e claro
   * em vez de criar um pedido que nunca vai ser despachado. */
  async assertConfigured(): Promise<void> {
    const settings = await this.platformSettingsService.get();
    if (settings.dispatchOfferTimeoutSeconds === null) {
      throw new ConflictException(
        'O tempo de resposta do despacho ainda não foi configurado pelo admin.',
      );
    }
  }

  async scheduleActivation(deliveryId: string, scheduledAt: Date): Promise<void> {
    const delayMs = Math.max(0, scheduledAt.getTime() - Date.now());
    await this.dispatchQueue.add(
      ACTIVATE_SCHEDULED_JOB,
      { deliveryId },
      { delay: delayMs, jobId: activateJobId(deliveryId) },
    );
  }

  /** Tenta ofertar um pedido AWAITING_DRIVER específico ao próximo motoboy
   * elegível. Sem efeito (não lança erro) se o pedido já tem oferta
   * pendente, não está mais AWAITING_DRIVER, ou não há motoboy elegível —
   * chamado de vários gatilhos assíncronos (criação, expiração, motoboy
   * ficou disponível), então precisa ser seguro de repetir. */
  async dispatchDelivery(deliveryId: string): Promise<void> {
    const delivery = await this.prisma.delivery.findUnique({ where: { id: deliveryId } });
    if (!delivery || delivery.status !== 'AWAITING_DRIVER') {
      return;
    }

    const pendingOffer = await this.prisma.deliveryOffer.findFirst({
      where: { deliveryId, response: 'PENDING' },
    });
    if (pendingOffer) {
      return;
    }

    const settings = await this.platformSettingsService.get();
    if (settings.dispatchOfferTimeoutSeconds === null) {
      this.logger.warn(
        `Timeout de despacho não configurado — pedido ${deliveryId} segue aguardando.`,
      );
      return;
    }

    const alreadyOffered = await this.prisma.deliveryOffer.findMany({
      where: { deliveryId },
      select: { driverId: true },
    });

    const nextDriverId = await this.findNextEligibleDriverId(alreadyOffered.map((o) => o.driverId));
    if (!nextDriverId) {
      return;
    }

    const offer = await this.prisma.deliveryOffer.create({
      data: { deliveryId, driverId: nextDriverId, response: 'PENDING' },
    });

    await this.dispatchQueue.add(
      OFFER_EXPIRE_JOB,
      { offerId: offer.id },
      { delay: settings.dispatchOfferTimeoutSeconds * 1000, jobId: expireJobId(offer.id) },
    );

    this.realtimeGateway.emitToDriver(nextDriverId, 'delivery:offer', {
      offerId: offer.id,
      deliveryId: delivery.id,
      displayNumber: delivery.displayNumber,
      driverValue: Number(delivery.driverValue),
      distanceKm: delivery.distanceKm === null ? null : Number(delivery.distanceKm),
      requiresReturn: delivery.requiresReturn,
      expiresInSeconds: settings.dispatchOfferTimeoutSeconds,
    });
    this.realtimeGateway.emitAdminActivity(`Pedido #${delivery.displayNumber} ofertado a um motoboy.`);
  }

  /** Varre pedidos AWAITING_DRIVER sem oferta pendente e tenta despachar
   * cada um — chamado quando um motoboy fica disponível, já que não dá
   * pra saber de antemão qual pedido (se algum) ele deveria pegar. */
  async dispatchAvailableDeliveries(): Promise<void> {
    const candidates = await this.prisma.delivery.findMany({
      where: { status: 'AWAITING_DRIVER' },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });

    for (const candidate of candidates) {
      await this.dispatchDelivery(candidate.id);
    }
  }

  async handleOfferExpired(offerId: string): Promise<void> {
    const offer = await this.prisma.deliveryOffer.findUnique({ where: { id: offerId } });
    if (!offer || offer.response !== 'PENDING') {
      return;
    }

    await this.prisma.deliveryOffer.update({
      where: { id: offerId },
      data: { response: 'EXPIRED', respondedAt: new Date() },
    });

    this.realtimeGateway.emitToDriver(offer.driverId, 'delivery:offer-expired', { offerId });
    this.realtimeGateway.emitAdminActivity('Oferta expirou sem resposta, buscando o próximo motoboy.');

    await this.dispatchDelivery(offer.deliveryId);
  }

  async handleScheduledActivation(deliveryId: string): Promise<void> {
    const delivery = await this.prisma.delivery.findUnique({ where: { id: deliveryId } });
    if (!delivery || delivery.status !== 'SCHEDULED') {
      return;
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.delivery.update({
        where: { id: deliveryId },
        data: { status: 'AWAITING_DRIVER', statusChangedAt: new Date() },
      });
      await tx.deliveryStatusHistory.create({
        data: { deliveryId, fromStatus: 'SCHEDULED', toStatus: 'AWAITING_DRIVER' },
      });
    });

    this.realtimeGateway.emitAdminActivity(`Pedido #${delivery.displayNumber} agendado entrou na fila.`);
    await this.dispatchDelivery(deliveryId);
  }

  async cancelOfferTimeout(offerId: string): Promise<void> {
    await this.dispatchQueue.remove(expireJobId(offerId));
  }

  private async findNextEligibleDriverId(excludeDriverIds: string[]): Promise<string | null> {
    const busyOffers = await this.prisma.deliveryOffer.findMany({
      where: { response: 'PENDING' },
      select: { driverId: true },
    });
    const busyDriverIds = busyOffers.map((o) => o.driverId);
    const excluded = [...new Set([...excludeDriverIds, ...busyDriverIds])];

    const [nextPresence] = await this.prisma.driverPresenceLog.findMany({
      where: {
        wentOfflineAt: null,
        driverId: excluded.length > 0 ? { notIn: excluded } : undefined,
        driver: { approvalStatus: 'APPROVED', accountStatus: 'ACTIVE', availability: 'AVAILABLE' },
      },
      orderBy: { wentOnlineAt: 'asc' },
      take: 1,
      select: { driverId: true },
    });

    return nextPresence?.driverId ?? null;
  }
}
