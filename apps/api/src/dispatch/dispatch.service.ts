import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { Prisma, type DeliveryStatus } from '@prisma/client';
import { AdminPlatformSettingsService } from '../admin/platform-settings/admin-platform-settings.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { PrismaService } from '../prisma/prisma.service';
import { LiveDriverPresenceService } from '../live-presence/live-driver-presence.service';

export const DISPATCH_QUEUE = 'dispatch';
export const OFFER_EXPIRE_JOB = 'offer-expire';
export const ACTIVATE_SCHEDULED_JOB = 'activate-scheduled';

const ASSIGNMENT_BLOCKING_STATUSES: DeliveryStatus[] = ['ACCEPTED', 'COLLECTED', 'DELIVERED'];

function expireJobId(offerId: string): string {
  return `expire-${offerId}`;
}

function activateJobId(deliveryId: string): string {
  return `activate-${deliveryId}`;
}

function offerAddress(
  address: {
    street: string | null;
    number: string | null;
    complement: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
    referenceNote: string | null;
  } | null,
) {
  return {
    street: address?.street ?? null,
    number: address?.number ?? null,
    complement: address?.complement ?? null,
    city: address?.city ?? null,
    state: address?.state ?? null,
    zip: address?.zip ?? null,
    referenceNote: address?.referenceNote ?? null,
  };
}

@Injectable()
export class DispatchService {
  private readonly logger = new Logger(DispatchService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly platformSettingsService: AdminPlatformSettingsService,
    private readonly realtimeGateway: RealtimeGateway,
    private readonly livePresence: LiveDriverPresenceService,
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
    const delivery = await this.prisma.delivery.findUnique({
      where: { id: deliveryId },
      include: {
        company: { select: { regionId: true, tradeName: true } },
        serviceType: { select: { name: true } },
        addresses: true,
      },
    });
    if (!delivery || delivery.status !== 'AWAITING_DRIVER') {
      return;
    }

    const deliveries = delivery.batchId
      ? await this.prisma.delivery.findMany({
          where: { batchId: delivery.batchId },
          orderBy: { createdAt: 'asc' },
          include: {
            serviceType: { select: { name: true } },
            addresses: true,
          },
        })
      : [delivery];
    if (deliveries.some((item) => item.status !== 'AWAITING_DRIVER')) {
      return;
    }
    const deliveryIds = deliveries.map((item) => item.id);
    const serviceTypeIds = [...new Set(deliveries.map((item) => item.serviceTypeId))];

    const pendingOffer = delivery.batchId
      ? await this.prisma.deliveryOffer.findFirst({
          where: { deliveryId: { in: deliveryIds }, response: 'PENDING' },
        })
      : await this.prisma.deliveryOffer.findFirst({
          where: { deliveryId, response: 'PENDING' },
        });
    if (pendingOffer) {
      return;
    }

    const settings = await this.platformSettingsService.get();
    const timeoutSeconds = settings.dispatchOfferTimeoutSeconds;
    if (timeoutSeconds === null) {
      this.logger.warn(
        `Timeout de despacho não configurado — pedido ${deliveryId} segue aguardando.`,
      );
      return;
    }

    const alreadyOffered = delivery.batchId
      ? await this.prisma.deliveryOffer.findMany({
          where: { deliveryId: { in: deliveryIds } },
          select: { driverId: true },
        })
      : await this.prisma.deliveryOffer.findMany({
          where: { deliveryId },
          select: { driverId: true },
        });

    const nextDriverId = await this.findNextEligibleDriverId({
      excludeDriverIds: alreadyOffered.map((offer) => offer.driverId),
      regionId: delivery.company.regionId,
      serviceTypeIds,
    });
    if (!nextDriverId) {
      return;
    }

    const offers = await this.createPendingOffers({
      deliveryIds,
      driverId: nextDriverId,
      regionId: delivery.company.regionId,
      serviceTypeIds,
    });
    if (!offers) {
      return;
    }

    await Promise.all(
      offers.map((offer) =>
        this.dispatchQueue.add(
          OFFER_EXPIRE_JOB,
          { offerId: offer.id },
          { delay: timeoutSeconds * 1000, jobId: expireJobId(offer.id) },
        ),
      ),
    );

    this.realtimeGateway.emitToDriver(nextDriverId, 'delivery:offer', {
      offerId: offers[0]!.id,
      deliveryId: delivery.id,
      displayNumber: delivery.displayNumber,
      companyName: delivery.company.tradeName,
      paymentMethod: delivery.paymentMethod,
      totalValue: !delivery.destinationKnownAtCreation
        ? null
        : delivery.batchId
          ? deliveries.reduce((sum, item) => sum + Number(item.totalValue), 0)
          : Number(delivery.totalValue),
      driverValue: !delivery.destinationKnownAtCreation
        ? null
        : delivery.batchId
          ? deliveries.reduce((sum, item) => sum + Number(item.driverValue), 0)
          : Number(delivery.driverValue),
      platformValue: !delivery.destinationKnownAtCreation
        ? null
        : delivery.batchId
          ? deliveries.reduce((sum, item) => sum + Number(item.platformValue), 0)
          : Number(delivery.platformValue),
      distanceKm: !delivery.destinationKnownAtCreation
        ? null
        : delivery.batchId
          ? deliveries.reduce((sum, item) => sum + Number(item.distanceKm ?? 0), 0)
          : delivery.distanceKm === null
            ? null
            : Number(delivery.distanceKm),
      requiresReturn: delivery.batchId
        ? deliveries.some((item) => item.requiresReturn)
        : delivery.requiresReturn,
      deliveries: deliveries.map((item) => ({
        deliveryId: item.id,
        displayNumber: item.displayNumber,
        serviceTypeName: item.serviceType.name,
        destinationKnownAtCreation: item.destinationKnownAtCreation,
        pickupAddress: offerAddress(
          item.addresses.find((address) => address.type === 'PICKUP') ?? null,
        ),
        dropoffAddress: item.destinationKnownAtCreation
          ? offerAddress(item.addresses.find((address) => address.type === 'DROPOFF') ?? null)
          : null,
        totalValue: item.totalValue === null ? null : Number(item.totalValue),
        driverValue: item.driverValue === null ? null : Number(item.driverValue),
        platformValue: item.platformValue === null ? null : Number(item.platformValue),
        distanceKm: item.distanceKm === null ? null : Number(item.distanceKm),
        requiresReturn: item.requiresReturn,
      })),
      expiresInSeconds: timeoutSeconds,
      ...(delivery.batchId ? { batchId: delivery.batchId, deliveryCount: deliveries.length } : {}),
    });
    this.realtimeGateway.emitAdminActivity(
      `Pedido #${delivery.displayNumber} ofertado a um motoboy.`,
    );
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

    const offeredDelivery = await this.prisma.delivery.findUnique({
      where: { id: offer.deliveryId },
    });
    if (offeredDelivery?.batchId) {
      await this.expireBatchOffer(
        offerId,
        offer.driverId,
        offer.deliveryId,
        offeredDelivery.batchId,
      );
      return;
    }

    await this.prisma.deliveryOffer.update({
      where: { id: offerId },
      data: { response: 'EXPIRED', respondedAt: new Date() },
    });

    this.realtimeGateway.emitToDriver(offer.driverId, 'delivery:offer-expired', { offerId });
    this.realtimeGateway.emitAdminActivity(
      'Oferta expirou sem resposta, buscando o próximo motoboy.',
    );

    await this.dispatchDelivery(offer.deliveryId);
  }

  /**
   * Solta as ofertas pendentes de um motoboy que deixou de poder atender
   * (bloqueio/suspensao pelo admin) e devolve os pedidos para a fila.
   *
   * Reaproveita `handleOfferExpired` de proposito, em vez de escrever uma segunda
   * versao desse fluxo: ela ja trata lote, cancela o job de timeout, avisa o app e
   * redespacha. Duplicar isso significaria manter dois caminhos que precisam
   * concordar para sempre — e o de bloqueio, sendo raro, seria o que envelheceria.
   *
   * Sem isto, o pedido ficava parado ate a oferta expirar sozinha: ninguem mais era
   * chamado durante esse tempo, mesmo havendo motoboy livre.
   */
  async releasePendingOffersForDriver(driverId: string): Promise<number> {
    const pending = await this.prisma.deliveryOffer.findMany({
      where: { driverId, response: 'PENDING' },
      select: { id: true },
    });

    for (const offer of pending) {
      await this.cancelOfferTimeout(offer.id);
      // Idempotente: se a oferta saiu de PENDING nesse meio-tempo, ela nao faz nada.
      await this.handleOfferExpired(offer.id);
    }

    return pending.length;
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

    this.realtimeGateway.emitAdminActivity(
      `Pedido #${delivery.displayNumber} agendado entrou na fila.`,
    );
    this.realtimeGateway.emitDeliveryUpdated(delivery.companyId, {
      deliveryId,
      displayNumber: delivery.displayNumber,
      companyId: delivery.companyId,
      status: 'AWAITING_DRIVER',
    });
    await this.dispatchDelivery(deliveryId);
  }

  async cancelOfferTimeout(offerId: string): Promise<void> {
    await this.dispatchQueue.remove(expireJobId(offerId));
  }

  async cancelScheduledActivation(deliveryId: string): Promise<void> {
    await this.dispatchQueue.remove(activateJobId(deliveryId));
  }

  /** Chamado quando um pedido é cancelado (empresa/admin) — se havia uma
   * oferta pendente pra algum motoboy, ela deixa de valer: marca EXPIRED
   * (reaproveitando o enum, não é uma "expiração por timeout" de verdade,
   * mas semanticamente é o mesmo "essa oferta não vale mais"), cancela o
   * timeout agendado e avisa o motoboy. */
  async cancelPendingOfferForDelivery(deliveryId: string): Promise<void> {
    const pendingOffer = await this.prisma.deliveryOffer.findFirst({
      where: { deliveryId, response: 'PENDING' },
    });
    if (!pendingOffer) {
      return;
    }

    await this.prisma.deliveryOffer.update({
      where: { id: pendingOffer.id },
      data: { response: 'EXPIRED', respondedAt: new Date() },
    });
    await this.cancelOfferTimeout(pendingOffer.id);
    this.realtimeGateway.emitToDriver(pendingOffer.driverId, 'delivery:offer-cancelled', {
      offerId: pendingOffer.id,
    });
  }

  /** Motoboy aceita a oferta. As duas atualizações condicionais (oferta
   * PENDING->ACCEPTED, pedido AWAITING_DRIVER->ACCEPTED) rodam na mesma
   * transação e QUALQUER uma delas afetando 0 linhas lança e reverte tudo —
   * essa é a defesa contra corrida real (ex.: oferta expirando no exato
   * instante do aceite, ou o pedido sendo cancelado nesse meio-tempo). */
  async acceptOffer(
    offerId: string,
    driverId: string,
    respondingUserId: string,
  ): Promise<{ deliveryId: string; displayNumber: number }> {
    const offer = await this.prisma.deliveryOffer.findUnique({ where: { id: offerId } });
    if (!offer) {
      throw new NotFoundException('Oferta não encontrada.');
    }
    if (offer.driverId !== driverId) {
      throw new ForbiddenException('Esta oferta não pertence a este motoboy.');
    }

    const offeredDelivery = await this.prisma.delivery.findUnique({
      where: { id: offer.deliveryId },
    });
    if (offeredDelivery?.batchId) {
      return this.acceptBatchOffer(
        offerId,
        driverId,
        respondingUserId,
        offer.deliveryId,
        offeredDelivery.batchId,
      );
    }

    const delivery = await this.prisma.$transaction(async (tx) => {
      const offerUpdate = await tx.deliveryOffer.updateMany({
        where: { id: offerId, response: 'PENDING' },
        data: { response: 'ACCEPTED', respondedAt: new Date() },
      });
      if (offerUpdate.count === 0) {
        throw new ConflictException('Esta oferta não está mais disponível.');
      }

      const deliveryUpdate = await tx.delivery.updateMany({
        where: { id: offer.deliveryId, status: 'AWAITING_DRIVER' },
        data: { status: 'ACCEPTED', driverId, statusChangedAt: new Date() },
      });
      if (deliveryUpdate.count === 0) {
        throw new ConflictException('Este pedido já não está mais disponível.');
      }

      await tx.deliveryStatusHistory.create({
        data: {
          deliveryId: offer.deliveryId,
          fromStatus: 'AWAITING_DRIVER',
          toStatus: 'ACCEPTED',
          changedByUserId: respondingUserId,
        },
      });

      return tx.delivery.findUniqueOrThrow({ where: { id: offer.deliveryId } });
    });

    await this.cancelOfferTimeout(offerId);
    this.realtimeGateway.emitAdminActivity(
      `Pedido #${delivery.displayNumber} foi aceito por um motoboy.`,
    );
    this.realtimeGateway.emitDeliveryUpdated(delivery.companyId, {
      deliveryId: delivery.id,
      displayNumber: delivery.displayNumber,
      companyId: delivery.companyId,
      driverId,
      status: 'ACCEPTED',
    });

    return { deliveryId: delivery.id, displayNumber: delivery.displayNumber };
  }

  /** Motoboy recusa a oferta — mesma lógica de "não vale mais mais" do
   * timeout (handleOfferExpired), só que disparada pelo motoboy em vez do
   * job de expiração, então já cancela o job de expiração que não é mais
   * necessário e tenta despachar pro próximo da fila imediatamente. */
  async declineOffer(offerId: string, driverId: string): Promise<void> {
    const offer = await this.prisma.deliveryOffer.findUnique({ where: { id: offerId } });
    if (!offer) {
      throw new NotFoundException('Oferta não encontrada.');
    }
    if (offer.driverId !== driverId) {
      throw new ForbiddenException('Esta oferta não pertence a este motoboy.');
    }

    const offeredDelivery = await this.prisma.delivery.findUnique({
      where: { id: offer.deliveryId },
    });
    if (offeredDelivery?.batchId) {
      await this.declineBatchOffer(offerId, driverId, offer.deliveryId, offeredDelivery.batchId);
      return;
    }

    const offerUpdate = await this.prisma.deliveryOffer.updateMany({
      where: { id: offerId, response: 'PENDING' },
      data: { response: 'DECLINED', respondedAt: new Date() },
    });
    if (offerUpdate.count === 0) {
      throw new ConflictException('Esta oferta não está mais pendente.');
    }

    await this.cancelOfferTimeout(offerId);
    this.realtimeGateway.emitAdminActivity(
      'Motoboy recusou uma oferta, buscando o próximo da fila.',
    );
    await this.dispatchDelivery(offer.deliveryId);
  }

  private async acceptBatchOffer(
    offerId: string,
    driverId: string,
    respondingUserId: string,
    deliveryId: string,
    batchId: string,
  ): Promise<{
    deliveryId: string;
    displayNumber: number;
    batchId: string;
    deliveryIds: string[];
    displayNumbers: number[];
  }> {
    const deliveries = await this.prisma.delivery.findMany({
      where: { batchId },
      orderBy: { createdAt: 'asc' },
    });
    const deliveryIds = deliveries.map((delivery) => delivery.id);
    const offers = await this.prisma.deliveryOffer.findMany({
      where: { deliveryId: { in: deliveryIds }, driverId, response: 'PENDING' },
      select: { id: true },
    });
    if (offers.length !== deliveryIds.length) {
      throw new ConflictException('O lote não está mais disponível para aceite.');
    }
    const offerIds = offers.map((offer) => offer.id);

    await this.prisma.$transaction(async (tx) => {
      const offerUpdate = await tx.deliveryOffer.updateMany({
        where: { id: { in: offerIds }, response: 'PENDING' },
        data: { response: 'ACCEPTED', respondedAt: new Date() },
      });
      if (offerUpdate.count !== offerIds.length) {
        throw new ConflictException('O lote não está mais disponível para aceite.');
      }
      const deliveryUpdate = await tx.delivery.updateMany({
        where: { id: { in: deliveryIds }, status: 'AWAITING_DRIVER' },
        data: { status: 'ACCEPTED', driverId, statusChangedAt: new Date() },
      });
      if (deliveryUpdate.count !== deliveryIds.length) {
        throw new ConflictException('O lote já não está mais disponível.');
      }
      await tx.deliveryStatusHistory.createMany({
        data: deliveryIds.map((id) => ({
          deliveryId: id,
          fromStatus: 'AWAITING_DRIVER',
          toStatus: 'ACCEPTED',
          changedByUserId: respondingUserId,
        })),
      });
    });

    await Promise.all(offerIds.map((id) => this.cancelOfferTimeout(id)));
    const accepted = deliveries.find((delivery) => delivery.id === deliveryId)!;
    this.realtimeGateway.emitAdminActivity(
      `Lote de ${deliveries.length} pedidos foi aceito por um motoboy.`,
    );
    for (const item of deliveries) {
      this.realtimeGateway.emitDeliveryUpdated(item.companyId, {
        deliveryId: item.id,
        displayNumber: item.displayNumber,
        companyId: item.companyId,
        batchId,
        driverId,
        status: 'ACCEPTED',
      });
    }
    return {
      deliveryId,
      displayNumber: accepted.displayNumber,
      batchId,
      deliveryIds,
      displayNumbers: deliveries.map((delivery) => delivery.displayNumber),
    };
  }

  private async expireBatchOffer(
    offerId: string,
    driverId: string,
    deliveryId: string,
    batchId: string,
  ): Promise<void> {
    const deliveries = await this.prisma.delivery.findMany({ where: { batchId } });
    const deliveryIds = deliveries.map((delivery) => delivery.id);
    const offers = await this.prisma.deliveryOffer.findMany({
      where: { deliveryId: { in: deliveryIds }, driverId, response: 'PENDING' },
      select: { id: true },
    });
    if (offers.length !== deliveryIds.length || !offers.some((offer) => offer.id === offerId)) {
      return;
    }
    const offerIds = offers.map((offer) => offer.id);
    const update = await this.prisma.deliveryOffer.updateMany({
      where: { id: { in: offerIds }, response: 'PENDING' },
      data: { response: 'EXPIRED', respondedAt: new Date() },
    });
    if (update.count !== offerIds.length) {
      return;
    }
    await Promise.all(offerIds.map((id) => this.cancelOfferTimeout(id)));
    this.realtimeGateway.emitToDriver(driverId, 'delivery:offer-expired', { offerId });
    this.realtimeGateway.emitAdminActivity('Oferta de lote expirou, buscando o próximo motoboy.');
    await this.dispatchDelivery(deliveryId);
  }

  private async declineBatchOffer(
    offerId: string,
    driverId: string,
    deliveryId: string,
    batchId: string,
  ): Promise<void> {
    const deliveries = await this.prisma.delivery.findMany({ where: { batchId } });
    const deliveryIds = deliveries.map((delivery) => delivery.id);
    const offers = await this.prisma.deliveryOffer.findMany({
      where: { deliveryId: { in: deliveryIds }, driverId, response: 'PENDING' },
      select: { id: true },
    });
    if (offers.length !== deliveryIds.length || !offers.some((offer) => offer.id === offerId)) {
      throw new ConflictException('Este lote não está mais pendente.');
    }
    const offerIds = offers.map((offer) => offer.id);
    const update = await this.prisma.deliveryOffer.updateMany({
      where: { id: { in: offerIds }, response: 'PENDING' },
      data: { response: 'DECLINED', respondedAt: new Date() },
    });
    if (update.count !== offerIds.length) {
      throw new ConflictException('Este lote não está mais pendente.');
    }
    await Promise.all(offerIds.map((id) => this.cancelOfferTimeout(id)));
    this.realtimeGateway.emitAdminActivity('Motoboy recusou um lote, buscando o próximo motoboy.');
    await this.dispatchDelivery(deliveryId);
  }

  /**
   * A leitura inicial de dispatchDelivery serve apenas para escolher o próximo
   * motoboy. A decisão de criar oferta é revalidada sob lock de linha na mesma
   * transação: cancelamento concorre com esse lock, e o índice parcial único
   * no banco é a última defesa contra dois processos criando PENDING.
   */
  private async createPendingOffers({
    deliveryIds,
    driverId,
    regionId,
    serviceTypeIds,
  }: {
    deliveryIds: string[];
    driverId: string;
    regionId: string;
    serviceTypeIds: string[];
  }) {
    if (!(await this.livePresence.isLive(driverId))) {
      return null;
    }
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const lockedDeliveries = await tx.$queryRaw<Array<{ id: string }>>(
            Prisma.sql`
              SELECT "id"
              FROM "deliveries"
              WHERE "id" IN (${Prisma.join(deliveryIds)})
                AND "status" = 'AWAITING_DRIVER'
              ORDER BY "id"
              FOR UPDATE
            `,
          );
          if (lockedDeliveries.length !== deliveryIds.length) {
            return null;
          }

          const eligibleDriver = await tx.driver.findFirst({
            where: { id: driverId, ...this.eligibleDriverWhere(regionId, serviceTypeIds) },
            select: { id: true },
          });
          if (!eligibleDriver) {
            return null;
          }

          const pendingOffer = await tx.deliveryOffer.findFirst({
            where: { deliveryId: { in: deliveryIds }, response: 'PENDING' },
          });
          if (pendingOffer) {
            return null;
          }

          return Promise.all(
            deliveryIds.map((id) =>
              tx.deliveryOffer.create({
                data: { deliveryId: id, driverId, response: 'PENDING' },
              }),
            ),
          );
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        (error.code === 'P2002' || error.code === 'P2034')
      ) {
        this.logger.debug(
          `Corrida de dispatch detectada para ${deliveryIds.join(', ')}; nenhuma oferta duplicada foi emitida.`,
        );
        return null;
      }
      throw error;
    }
  }

  private async findNextEligibleDriverId({
    excludeDriverIds,
    regionId,
    serviceTypeIds,
  }: {
    excludeDriverIds: string[];
    regionId: string;
    serviceTypeIds: string[];
  }): Promise<string | null> {
    const busyOffers = await this.prisma.deliveryOffer.findMany({
      where: { response: 'PENDING' },
      select: { driverId: true },
    });
    const busyDriverIds = busyOffers.map((o) => o.driverId);
    const excluded = [...new Set([...excludeDriverIds, ...busyDriverIds])];

    const presences = await this.prisma.driverPresenceLog.findMany({
      where: {
        wentOfflineAt: null,
        driverId: excluded.length > 0 ? { notIn: excluded } : undefined,
        driver: this.eligibleDriverWhere(regionId, serviceTypeIds),
      },
      orderBy: { wentOnlineAt: 'asc' },
      take: 50,
      select: { driverId: true },
    });

    for (const presence of presences) {
      if (await this.livePresence.isLive(presence.driverId)) return presence.driverId;
    }
    return null;
  }

  private eligibleDriverWhere(regionId: string, serviceTypeIds: string[]): Prisma.DriverWhereInput {
    return {
      regionId,
      approvalStatus: 'APPROVED',
      accountStatus: 'ACTIVE',
      availability: 'AVAILABLE',
      deliveries: { none: { status: { in: ASSIGNMENT_BLOCKING_STATUSES } } },
      AND: serviceTypeIds.map((serviceTypeId) => ({
        serviceTypes: {
          some: { serviceTypeId, serviceType: { active: true } },
        },
      })),
    };
  }
}
