import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { Prisma, type DeliveryOffer, type DeliveryStatus } from '@prisma/client';
import type { AcceptOfferResult, DeliveryOfferPayload } from '@motoboycity/types';
import { AdminPlatformSettingsService } from '../admin/platform-settings/admin-platform-settings.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { PrismaService } from '../prisma/prisma.service';
import { LiveDriverPresenceService } from '../live-presence/live-driver-presence.service';
import { PushService, type PushMessage } from '../push/push.service';
import { deliveryActivityMessage } from '../common/status-labels';
import { buildOfferPayload, remainingSeconds } from './offer-payload';

export const DISPATCH_QUEUE = 'dispatch';
export const OFFER_EXPIRE_JOB = 'offer-expire';
export const ACTIVATE_SCHEDULED_JOB = 'activate-scheduled';

type PendingOfferCreationResult = { offers: DeliveryOffer[] } | { retryNextDriver: boolean };

/**
 * Status em que o motoboy ainda tem trabalho em maos e nao pode receber outra
 * atribuicao. FAILED entra na lista: a entrega nao deu certo, mas ele esta com
 * a mercadoria do cliente voltando para a loja — mais ocupado, nao menos.
 */
const ASSIGNMENT_BLOCKING_STATUSES: DeliveryStatus[] = [
  'ACCEPTED',
  'COLLECTED',
  'DELIVERED',
  'FAILED',
];

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
    private readonly livePresence: LiveDriverPresenceService,
    private readonly pushService: PushService,
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
   * ficou disponível), então precisa ser seguro de repetir.
   *
   * `excludeDriverIds` tira alguem desta rodada por um motivo que nao esta
   * registrado em oferta nenhuma — hoje, o motoboy que acabou de devolver o
   * pedido a fila. Sem isso, o redespacho seguinte poderia devolver o mesmo
   * pedido para a mesma pessoa em segundos. E de propósito que a exclusao vale
   * so para esta chamada: se daqui a meia hora ele estiver de volta e o pedido
   * continuar parado, ofertar de novo e o certo. */
  async dispatchDelivery(
    deliveryId: string,
    options?: { excludeDriverIds?: string[] },
  ): Promise<void> {
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

    const excludedDriverIds = new Set([
      ...alreadyOffered.map((offer) => offer.driverId),
      ...(options?.excludeDriverIds ?? []),
    ]);
    let nextDriverId: string;
    let offers: DeliveryOffer[];

    // A seleção acontece antes do lock. Se outro dispatch ocupar esse
    // motoboy nesse intervalo, tenta o próximo em vez de deixar o pedido
    // parado até algum gatilho futuro varrer a fila novamente.
    for (;;) {
      const candidateDriverId = await this.findNextEligibleDriverId({
        excludeDriverIds: [...excludedDriverIds],
        regionId: delivery.company.regionId,
        serviceTypeIds,
      });
      if (!candidateDriverId) return;

      const creation = await this.createPendingOffers({
        deliveryIds,
        driverId: candidateDriverId,
        regionId: delivery.company.regionId,
        serviceTypeIds,
      });
      if ('offers' in creation) {
        nextDriverId = candidateDriverId;
        offers = creation.offers;
        break;
      }
      if (!creation.retryNextDriver) return;
      excludedDriverIds.add(candidateDriverId);
    }

    const scheduledTimeouts = await Promise.allSettled(
      offers.map((offer) =>
        this.dispatchQueue.add(
          OFFER_EXPIRE_JOB,
          { offerId: offer.id },
          { delay: timeoutSeconds * 1000, jobId: expireJobId(offer.id) },
        ),
      ),
    );
    const schedulingFailure = scheduledTimeouts.find(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );
    if (schedulingFailure) {
      const offerIds = offers.map((offer) => offer.id);

      // A oferta so pode continuar PENDING se todos os jobs que a expiram
      // existirem. Sem esta compensacao, uma indisponibilidade do Redis deixa
      // o pedido preso para sempre: novas tentativas encontram a oferta
      // pendente e retornam, mas nenhum timeout existe para libera-la.
      await this.prisma.deliveryOffer.updateMany({
        where: { id: { in: offerIds }, response: 'PENDING' },
        data: { response: 'EXPIRED', respondedAt: new Date() },
      });

      // Em lote, alguns jobs podem ter sido criados antes de outro falhar.
      // Remove os que chegaram ao Redis; uma remocao que falhar e inofensiva,
      // pois handleOfferExpired e idempotente para ofertas ja EXPIRED.
      await Promise.allSettled(offerIds.map((offerId) => this.cancelOfferTimeout(offerId)));
      throw schedulingFailure.reason;
    }

    // A oferta valida consome a vez deste motoboy. A mudanca de prioridade e
    // operacional e nao pode invalidar uma oferta que ja nasceu com timeout;
    // por isso uma falha isolada aqui e registrada, mas nao interrompe o envio.
    try {
      await this.livePresence.moveToDispatchTail(nextDriverId);
    } catch (error: unknown) {
      this.logger.warn(
        `Nao foi possivel mover o motoboy ${nextDriverId} para o fim da fila: ${String(error)}`,
      );
    }

    this.realtimeGateway.emitToDriver(
      nextDriverId,
      'delivery:offer',
      buildOfferPayload({
        offerId: offers[0]!.id,
        principal: delivery,
        entregas: deliveries,
        expiresInSeconds: timeoutSeconds,
      }),
    );
    this.realtimeGateway.emitAdminActivity(
      `Pedido #${delivery.displayNumber} ofertado a um motoboy.`,
    );

    /**
     * O push e o que faz a oferta chegar com o APLICATIVO FECHADO.
     *
     * O socket acima so alcanca quem esta com o app aberto, e o caso que
     * interessa e o oposto: o motoboy esperando corrida com o celular no bolso.
     * Sem isto, a oferta expira sozinha e o pedido volta para a fila sem que
     * ninguem tenha sido avisado de verdade.
     *
     * Nao bloqueia o despacho: se o Firebase estiver fora do ar ou nao
     * configurado, o pedido segue ofertado e o prazo continua correndo. Push
     * indisponivel nao pode virar pedido nao despachado.
     */
    const quantidade = deliveries.length;
    const expiresAtEpochMs = Date.now() + timeoutSeconds * 1000;
    const corpo =
      quantidade > 1
        ? `O lote com ${quantidade} entregas está disponível.`
        : `O pedido #${delivery.displayNumber} está disponível.`;
    try {
      await this.pushService.sendToDriver(nextDriverId, {
        kind: 'offer',
        title: 'Pedido disponível',
        body: corpo,
        data: {
          type: 'offer',
          offerId: offers[0]!.id,
          deliveryId: delivery.id,
          expiresInSeconds: String(timeoutSeconds),
          expiresAtEpochMs: String(expiresAtEpochMs),
        },
      });
    } catch (error: unknown) {
      this.logger.warn(`Falha ao enviar push da oferta ${offers[0]!.id}: ${String(error)}`);
    }
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
    if (!offer) {
      return;
    }
    if (offer.response === 'EXPIRED') {
      // A expiração pode ter sido persistida antes de uma falha no redespacho.
      // Repetir o job precisa retomar essa segunda metade, e dispatchDelivery e
      // idempotente quando o pedido ja mudou ou ganhou outra oferta.
      await this.dispatchDelivery(offer.deliveryId);
      return;
    }
    if (offer.response !== 'PENDING') {
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
    await this.notifyOfferResolved(offer.driverId, [offerId], 'expired');
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
      // Idempotente: se a oferta saiu de PENDING nesse meio-tempo, ela nao faz nada.
      // Expira antes de remover o timeout: se a operacao falhar, o job segue
      // ativo como compensacao e tenta novamente no prazo normal da oferta.
      try {
        await this.handleOfferExpired(offer.id);
      } catch (error) {
        const current = await this.prisma.deliveryOffer.findUnique({
          where: { id: offer.id },
          select: { response: true },
        });
        if (current?.response !== 'EXPIRED') {
          throw error;
        }
        // Se apenas o redespacho falhou depois do EXPIRED, a segunda chamada
        // entra no ramo idempotente acima e conclui sem esperar o timeout.
        await this.handleOfferExpired(offer.id);
      }
      await this.cancelOfferTimeout(offer.id);
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
    await this.notifyOfferResolved(pendingOffer.driverId, [pendingOffer.id], 'cancelled');
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
  ): Promise<AcceptOfferResult> {
    const offer = await this.prisma.deliveryOffer.findUnique({ where: { id: offerId } });
    if (!offer) {
      throw new NotFoundException('Oferta não encontrada.');
    }
    if (offer.driverId !== driverId) {
      throw new ForbiddenException('Esta oferta não pertence a este motoboy.');
    }

    const acceptedBeforeRetry = await this.acceptedOfferResult(offer, driverId);
    if (acceptedBeforeRetry) {
      await this.finishAcceptedOfferRetry(driverId, acceptedBeforeRetry);
      return acceptedBeforeRetry;
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

    let delivery: { id: string; displayNumber: number; companyId: string };
    try {
      delivery = await this.prisma.$transaction(async (tx) => {
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
    } catch (error) {
      if (error instanceof ConflictException) {
        const acceptedDuringRace = await this.acceptedOfferResultById(offerId, driverId);
        if (acceptedDuringRace) {
          await this.finishAcceptedOfferRetry(driverId, acceptedDuringRace);
          return acceptedDuringRace;
        }
      }
      throw error;
    }

    await this.cancelOfferTimeout(offerId);
    await this.notifyOfferResolved(driverId, [offerId], 'accepted');
    await this.emitAcceptedActivities([delivery], driverId);
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
    await this.notifyOfferResolved(driverId, [offerId], 'declined');
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

    try {
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
    } catch (error) {
      if (error instanceof ConflictException) {
        const acceptedDuringRace = await this.acceptedOfferResultById(offerId, driverId);
        if (
          acceptedDuringRace?.batchId === batchId &&
          acceptedDuringRace.deliveryIds &&
          acceptedDuringRace.displayNumbers
        ) {
          await this.finishAcceptedOfferRetry(driverId, acceptedDuringRace);
          return {
            deliveryId: acceptedDuringRace.deliveryId,
            displayNumber: acceptedDuringRace.displayNumber,
            batchId,
            deliveryIds: acceptedDuringRace.deliveryIds,
            displayNumbers: acceptedDuringRace.displayNumbers,
          };
        }
      }
      throw error;
    }

    await Promise.all(offerIds.map((id) => this.cancelOfferTimeout(id)));
    await this.notifyOfferResolved(driverId, offerIds, 'accepted');
    const accepted = deliveries.find((delivery) => delivery.id === deliveryId)!;
    await this.emitAcceptedActivities(deliveries, driverId);
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

  private async acceptedOfferResultById(
    offerId: string,
    driverId: string,
  ): Promise<AcceptOfferResult | null> {
    const offer = await this.prisma.deliveryOffer.findUnique({ where: { id: offerId } });
    if (!offer || offer.driverId !== driverId) return null;
    return this.acceptedOfferResult(offer, driverId);
  }

  private async acceptedOfferResult(
    offer: { deliveryId: string; driverId: string; response: string },
    driverId: string,
  ): Promise<AcceptOfferResult | null> {
    if (offer.driverId !== driverId || offer.response !== 'ACCEPTED') return null;

    const principal = await this.prisma.delivery.findUnique({ where: { id: offer.deliveryId } });
    if (!principal || principal.driverId !== driverId) return null;
    if (!principal.batchId) {
      return { deliveryId: principal.id, displayNumber: principal.displayNumber };
    }

    const deliveries = await this.prisma.delivery.findMany({
      where: { batchId: principal.batchId },
      orderBy: { createdAt: 'asc' },
    });
    if (deliveries.length === 0 || deliveries.some((item) => item.driverId !== driverId)) {
      return null;
    }
    return {
      deliveryId: principal.id,
      displayNumber: principal.displayNumber,
      batchId: principal.batchId,
      deliveryIds: deliveries.map((item) => item.id),
      displayNumbers: deliveries.map((item) => item.displayNumber),
    };
  }

  private async finishAcceptedOfferRetry(
    driverId: string,
    result: AcceptOfferResult,
  ): Promise<void> {
    const deliveryIds = result.deliveryIds ?? [result.deliveryId];
    const offers = await this.prisma.deliveryOffer.findMany({
      where: { driverId, deliveryId: { in: deliveryIds }, response: 'ACCEPTED' },
      select: { id: true },
    });
    const offerIds = offers.map((item) => item.id);
    await Promise.allSettled(offerIds.map((id) => this.cancelOfferTimeout(id)));
    await this.notifyOfferResolved(driverId, offerIds, 'accepted');
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
    await this.notifyOfferResolved(driverId, offerIds, 'expired');
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
    await this.notifyOfferResolved(driverId, offerIds, 'declined');
    this.realtimeGateway.emitAdminActivity('Motoboy recusou um lote, buscando o próximo motoboy.');
    await this.dispatchDelivery(deliveryId);
  }

  /**
   * Fecha a apresentação nativa em todos os aparelhos do motoboy assim que a
   * API deixa de considerar a oferta pendente. O socket sozinho não alcança um
   * processo Android adormecido e deixaria uma notificação antiga acionável.
   */
  private async notifyOfferResolved(
    driverId: string,
    offerIds: string[],
    reason: 'accepted' | 'declined' | 'expired' | 'cancelled',
  ): Promise<void> {
    const uniqueOfferIds = [...new Set(offerIds)];
    if (uniqueOfferIds.length === 0) return;

    const message: PushMessage = {
      kind: 'offer-update',
      title: 'Oferta atualizada',
      body: 'A oferta não está mais pendente.',
      data: {
        type: 'offer-resolved',
        offerId: uniqueOfferIds[0]!,
        offerIds: uniqueOfferIds.join(','),
        reason,
      },
    };

    try {
      await this.pushService.sendToDriver(driverId, message);
    } catch (error: unknown) {
      this.logger.warn(
        `Falha ao sincronizar encerramento da oferta ${uniqueOfferIds[0]}: ${String(error)}`,
      );
    }
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
  }): Promise<PendingOfferCreationResult> {
    if (!(await this.livePresence.isLive(driverId))) {
      return { retryNextDriver: true };
    }
    const limiteSimultaneo = await this.limiteDeEntregasSimultaneas();
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          // Serializa a escolha do mesmo motoboy entre pedidos diferentes.
          // O lock das entregas abaixo impede oferta duplicada por pedido; este
          // segundo eixo impede dois dispatches concorrentes de ocuparem o
          // mesmo slot de apresentação do aplicativo do entregador.
          await tx.$queryRaw<Array<{ id: string }>>(
            Prisma.sql`
              SELECT "id"
              FROM "drivers"
              WHERE "id" = ${driverId}
              FOR UPDATE
            `,
          );

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
            return { retryNextDriver: false };
          }

          const eligibleDriver = await tx.driver.findFirst({
            where: { id: driverId, ...this.eligibleDriverWhere(regionId, serviceTypeIds) },
            select: { id: true },
          });
          if (!eligibleDriver) {
            return { retryNextDriver: true };
          }

          /**
           * O teto e conferido DENTRO da transacao, e nao so na escolha do
           * motoboy: entre escolher e ofertar, ele pode ter aceitado outra
           * corrida e estourado o limite.
           */
          if (!(await this.cabeMaisUmaEntrega(driverId, limiteSimultaneo, tx))) {
            return { retryNextDriver: true };
          }

          const pendingOfferForDriver = await tx.deliveryOffer.findFirst({
            where: { driverId, response: 'PENDING' },
            select: { id: true },
          });
          if (pendingOfferForDriver) {
            return { retryNextDriver: true };
          }

          const pendingOffer = await tx.deliveryOffer.findFirst({
            where: { deliveryId: { in: deliveryIds }, response: 'PENDING' },
          });
          if (pendingOffer) {
            return { retryNextDriver: false };
          }

          return {
            offers: await Promise.all(
              deliveryIds.map((id) =>
                tx.deliveryOffer.create({
                  data: { deliveryId: id, driverId, response: 'PENDING' },
                }),
              ),
            ),
          };
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
        return { retryNextDriver: error.code === 'P2034' };
      }
      throw error;
    }
  }

  /**
   * A vitrine: pedidos que ninguem aceitou e ficaram sem oferta pendente.
   *
   * O empurrao sozinho tem um buraco. Quando todo motoboy elegivel ja recebeu a
   * oferta e deixou passar, `dispatchDelivery` retorna em silencio — e como
   * quem ja recebeu fica excluido da proxima rodada, o pedido so volta a se
   * mexer se aparecer um motoboy NOVO. Quem deixou expirar nunca mais o ve.
   *
   * Aqui ele reaparece para todos. E de proposito que a exclusao nao se aplica:
   * deixar uma oferta expirar as 11h nao e recusar aquele pedido para sempre.
   */
  async listAvailableForDriver(driverId: string) {
    const driver = await this.prisma.driver.findUnique({
      where: { id: driverId },
      include: { serviceTypes: { select: { serviceTypeId: true } } },
    });
    if (!driver) return [];

    const serviceTypeIds = driver.serviceTypes.map((item) => item.serviceTypeId);
    if (serviceTypeIds.length === 0) return [];

    /**
     * A vitrine some quando o motoboy atinge o teto de entregas simultaneas —
     * a mesma regra do despacho automatico. Sem teto configurado ela continua
     * disponivel, porque ele pode juntar varias entregas na mesma saida.
     */
    const limiteSimultaneo = await this.limiteDeEntregasSimultaneas();
    if (!(await this.cabeMaisUmaEntrega(driverId, limiteSimultaneo))) return [];

    const deliveries = await this.prisma.delivery.findMany({
      where: {
        status: 'AWAITING_DRIVER',
        driverId: null,
        company: { regionId: driver.regionId },
        serviceTypeId: { in: serviceTypeIds },
        // Sem oferta pendente: se alguem esta com o pedido na mao agora, ele
        // ainda nao esta livre para a vitrine.
        offers: { none: { response: 'PENDING' } },
      },
      // Mais antigo primeiro: o pedido que espera ha mais tempo e o que mais
      // precisa de alguem.
      orderBy: { createdAt: 'asc' },
      take: 50,
      include: {
        company: { select: { tradeName: true } },
        serviceType: { select: { name: true } },
        addresses: true,
      },
    });

    /**
     * Mapeado para a forma do contrato, e nao devolvido cru: o objeto do Prisma
     * traz `Decimal`, campos internos e relacoes que o app nao usa — e um deles
     * mudar de nome quebraria o app sem ninguem perceber.
     */
    return deliveries.map((delivery) => ({
      id: delivery.id,
      displayNumber: delivery.displayNumber,
      companyName: delivery.company.tradeName,
      serviceTypeName: delivery.serviceType.name,
      destinationKnownAtCreation: delivery.destinationKnownAtCreation,
      distanceKm: delivery.distanceKm === null ? null : Number(delivery.distanceKm),
      driverValue: delivery.driverValue === null ? null : Number(delivery.driverValue),
      requiresReturn: delivery.requiresReturn,
      batchId: delivery.batchId,
      addresses: delivery.addresses.map((address) => ({
        type: address.type,
        street: address.street,
        number: address.number,
        complement: address.complement,
        city: address.city,
        state: address.state,
        zip: address.zip,
        lat: address.lat === null ? null : Number(address.lat),
        lng: address.lng === null ? null : Number(address.lng),
        referenceNote: address.referenceNote,
      })),
      createdAt: delivery.createdAt.toISOString(),
    }));
  }

  /**
   * O motoboy assume um pedido da vitrine.
   *
   * A protecao contra dois assumindo ao mesmo tempo e a mesma do aceite de
   * oferta: `updateMany` condicional e checagem de `count`. Quem chegar em
   * segundo encontra zero linhas atualizadas e recebe conflito, em vez de os
   * dois acharem que pegaram.
   */
  async claimDelivery(
    deliveryId: string,
    driverId: string,
    claimingUserId: string,
  ): Promise<AcceptOfferResult> {
    const alvo = await this.prisma.delivery.findUnique({ where: { id: deliveryId } });
    if (!alvo) {
      throw new NotFoundException('Pedido não encontrado.');
    }
    const claimedBeforeRetry = await this.assignedDeliveryResult(alvo, driverId);
    if (claimedBeforeRetry) {
      return claimedBeforeRetry;
    }
    if (alvo.status !== 'AWAITING_DRIVER' || alvo.driverId !== null) {
      throw new ConflictException('Este pedido já não está mais disponível.');
    }

    const pendente = await this.prisma.deliveryOffer.findFirst({
      where: { deliveryId, response: 'PENDING' },
    });
    if (pendente) {
      throw new ConflictException('Este pedido está oferecido a outro motoboy neste momento.');
    }

    // O lote e assumido inteiro, como no aceite de oferta: os itens de um lote
    // compartilham motoboy por construcao.
    const irmaos = alvo.batchId
      ? await this.prisma.delivery.findMany({ where: { batchId: alvo.batchId } })
      : [alvo];
    if (irmaos.some((item) => item.status !== 'AWAITING_DRIVER' || item.driverId !== null)) {
      throw new ConflictException('Este lote já não está mais disponível por inteiro.');
    }
    const ids = irmaos.map((item) => item.id);

    let delivery: {
      id: string;
      displayNumber: number;
      companyId: string;
      status: DeliveryStatus;
      batchId: string | null;
    };
    try {
      delivery = await this.prisma.$transaction(async (tx) => {
        const atualizadas = await tx.delivery.updateMany({
          where: { id: { in: ids }, status: 'AWAITING_DRIVER', driverId: null },
          data: { status: 'ACCEPTED', driverId, statusChangedAt: new Date() },
        });
        if (atualizadas.count !== ids.length) {
          throw new ConflictException('Este pedido já não está mais disponível.');
        }

        for (const id of ids) {
          await tx.deliveryStatusHistory.create({
            data: {
              deliveryId: id,
              fromStatus: 'AWAITING_DRIVER',
              toStatus: 'ACCEPTED',
              changedByUserId: claimingUserId,
              note: 'Assumido pelo motoboy a partir dos pedidos disponíveis.',
            },
          });
        }

        return tx.delivery.findUniqueOrThrow({ where: { id: deliveryId } });
      });
    } catch (error) {
      if (error instanceof ConflictException) {
        const claimedDuringRace = await this.assignedDeliveryResultById(deliveryId, driverId);
        if (claimedDuringRace) return claimedDuringRace;
      }
      throw error;
    }

    await this.emitAcceptedActivities(irmaos, driverId);
    this.realtimeGateway.emitDeliveryUpdated(delivery.companyId, {
      deliveryId: delivery.id,
      status: delivery.status,
    });

    if (!delivery.batchId) {
      return { deliveryId: delivery.id, displayNumber: delivery.displayNumber };
    }
    return {
      deliveryId: delivery.id,
      displayNumber: delivery.displayNumber,
      batchId: delivery.batchId,
      deliveryIds: ids,
      displayNumbers: irmaos.map((item) => item.displayNumber),
    };
  }

  private async assignedDeliveryResultById(
    deliveryId: string,
    driverId: string,
  ): Promise<AcceptOfferResult | null> {
    const delivery = await this.prisma.delivery.findUnique({ where: { id: deliveryId } });
    if (!delivery) return null;
    return this.assignedDeliveryResult(delivery, driverId);
  }

  private async assignedDeliveryResult(
    delivery: {
      id: string;
      displayNumber: number;
      batchId: string | null;
      driverId: string | null;
      status: DeliveryStatus;
    },
    driverId: string,
  ): Promise<AcceptOfferResult | null> {
    if (delivery.driverId !== driverId || delivery.status === 'AWAITING_DRIVER') return null;
    if (!delivery.batchId) {
      return { deliveryId: delivery.id, displayNumber: delivery.displayNumber };
    }

    const deliveries = await this.prisma.delivery.findMany({
      where: { batchId: delivery.batchId },
      orderBy: { createdAt: 'asc' },
    });
    if (deliveries.length === 0 || deliveries.some((item) => item.driverId !== driverId)) {
      return null;
    }
    return {
      deliveryId: delivery.id,
      displayNumber: delivery.displayNumber,
      batchId: delivery.batchId,
      deliveryIds: deliveries.map((item) => item.id),
      displayNumbers: deliveries.map((item) => item.displayNumber),
    };
  }

  /**
   * O motoboy devolve a fila um pedido que aceitou e nao vai conseguir entregar.
   *
   * Ate agora esse caminho nao existia: um pedido aceito que travou so saia
   * pela mao do admin, e ate la o motoboy segurava uma entrega que nao ia
   * acontecer enquanto a loja esperava. E o par que faltava da vitrine — o
   * pedido volta para AWAITING_DRIVER e reaparece para todos.
   *
   * SO DE `ACCEPTED`. Depois de `COLLECTED` a mercadoria esta com o motoboy, e
   * devolver o pedido a fila deixaria o pacote orfao: outro assumiria uma
   * entrega cuja carga esta na garupa de um terceiro. Esse caso ja tem caminho
   * proprio, que e o insucesso (`markFailed`) — ele devolve a mercadoria a loja.
   */
  async returnDeliveryToQueue(
    deliveryId: string,
    driverId: string,
    reason: string,
    actingUserId: string,
  ): Promise<{ deliveryId: string; displayNumber: number; returnedCount: number }> {
    const alvo = await this.prisma.delivery.findUnique({ where: { id: deliveryId } });
    if (!alvo) {
      throw new NotFoundException('Pedido não encontrado.');
    }
    if (alvo.driverId !== driverId) {
      throw new ForbiddenException('Este pedido não está atribuído a este motoboy.');
    }
    if (alvo.status !== 'ACCEPTED') {
      throw new ConflictException(
        alvo.status === 'COLLECTED'
          ? 'A mercadoria já está com você. Registre o insucesso da entrega para devolvê-la à loja.'
          : 'Este pedido não pode mais ser devolvido à fila.',
      );
    }

    // O lote volta inteiro, como e assumido inteiro: devolver metade deixaria o
    // motoboy com um pedaco de uma corrida que ele acabou de dizer que nao faz.
    const irmaos = alvo.batchId
      ? await this.prisma.delivery.findMany({ where: { batchId: alvo.batchId } })
      : [alvo];
    if (irmaos.some((item) => item.driverId !== driverId || item.status !== 'ACCEPTED')) {
      throw new ConflictException('Este lote não pode ser devolvido por inteiro.');
    }
    const ids = irmaos.map((item) => item.id);

    const delivery = await this.prisma.$transaction(async (tx) => {
      const atualizadas = await tx.delivery.updateMany({
        where: { id: { in: ids }, driverId, status: 'ACCEPTED' },
        data: { status: 'AWAITING_DRIVER', driverId: null, statusChangedAt: new Date() },
      });
      if (atualizadas.count !== ids.length) {
        throw new ConflictException('Este pedido já não está mais com este motoboy.');
      }

      for (const id of ids) {
        await tx.deliveryStatusHistory.create({
          data: {
            deliveryId: id,
            fromStatus: 'ACCEPTED',
            toStatus: 'AWAITING_DRIVER',
            changedByUserId: actingUserId,
            note: `Devolvido à fila pelo motoboy: ${reason}`,
          },
        });
      }

      return tx.delivery.findUniqueOrThrow({ where: { id: deliveryId } });
    });

    this.realtimeGateway.emitAdminActivity(
      `Pedido #${delivery.displayNumber} foi devolvido à fila pelo motoboy: ${reason}`,
    );
    for (const id of ids) {
      this.realtimeGateway.emitDeliveryUpdated(delivery.companyId, {
        deliveryId: id,
        status: 'AWAITING_DRIVER',
      });
    }

    // Uma chamada so: para lote, `dispatchDelivery` ja trata os irmaos juntos.
    await this.dispatchDelivery(deliveryId, { excludeDriverIds: [driverId] });

    return {
      deliveryId: delivery.id,
      displayNumber: delivery.displayNumber,
      returnedCount: ids.length,
    };
  }

  /**
   * A oferta que esta esperando resposta deste motoboy agora, se houver.
   *
   * Existe porque a oferta so chegava pelo socket: se ela foi criada com o
   * aplicativo FECHADO, abrir o aplicativo depois nao mostrava nada — o motoboy
   * via a notificacao, entrava, e encontrava a tela vazia enquanto o prazo
   * corria.
   */
  async findPendingOfferForDriver(driverId: string): Promise<DeliveryOfferPayload | null> {
    const offer = await this.prisma.deliveryOffer.findFirst({
      where: { driverId, response: 'PENDING' },
      orderBy: { offeredAt: 'desc' },
    });
    if (!offer) {
      return null;
    }

    const delivery = await this.prisma.delivery.findUnique({
      where: { id: offer.deliveryId },
      include: {
        company: { select: { tradeName: true } },
        serviceType: { select: { name: true } },
        addresses: true,
      },
    });
    if (!delivery || delivery.status !== 'AWAITING_DRIVER') {
      return null;
    }

    const settings = await this.platformSettingsService.get();
    if (settings.dispatchOfferTimeoutSeconds === null) {
      return null;
    }

    const entregas = delivery.batchId
      ? await this.prisma.delivery.findMany({
          where: { batchId: delivery.batchId },
          orderBy: { createdAt: 'asc' },
          include: { serviceType: { select: { name: true } }, addresses: true },
        })
      : [delivery];

    return buildOfferPayload({
      offerId: offer.id,
      principal: delivery,
      entregas,
      expiresInSeconds: remainingSeconds(offer.offeredAt, settings.dispatchOfferTimeoutSeconds),
    });
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

    const orderedDriverIds = await this.livePresence.orderForDispatch(
      presences.map((presence) => presence.driverId),
    );
    const limiteSimultaneo = await this.limiteDeEntregasSimultaneas();
    for (const driverId of orderedDriverIds) {
      if (!(await this.livePresence.isLive(driverId))) continue;
      if (!(await this.cabeMaisUmaEntrega(driverId, limiteSimultaneo))) continue;
      return driverId;
    }
    return null;
  }

  /**
   * Quantas entregas o motoboy pode carregar ao mesmo tempo.
   *
   * `null` = sem limite, que e o padrao. Em cidade pequena o motoboy junta
   * varias entregas na mesma saida; travar em uma por vez o obrigaria a voltar
   * a loja entre cada corrida e derrubaria a capacidade da operacao.
   */
  private async limiteDeEntregasSimultaneas(): Promise<number | null> {
    const settings = await this.platformSettingsService.get();
    const limite = settings.maxConcurrentDeliveriesPerDriver;
    return limite === null || limite === undefined ? null : limite;
  }

  /**
   * O motoboy ainda cabe mais uma entrega?
   *
   * Fica FORA do `where` porque o Prisma nao filtra por contagem de relacao:
   * `none` responde "tem alguma?", e o que precisamos e "tem menos que N?".
   * Entao a contagem e feita aqui, no cliente que vier fazer a pergunta.
   *
   * Recebe o `tx` para poder rodar dentro da transacao que emite a oferta —
   * contar fora dela abriria janela para duas ofertas passarem juntas pelo
   * mesmo teto.
   */
  private async cabeMaisUmaEntrega(
    driverId: string,
    limiteSimultaneo: number | null,
    tx: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<boolean> {
    if (limiteSimultaneo === null) return true;

    const emAndamento = await tx.delivery.count({
      where: { driverId, status: { in: ASSIGNMENT_BLOCKING_STATUSES } },
    });
    return emAndamento < limiteSimultaneo;
  }

  /**
   * O aceite nasce neste servico, antes de DeliveriesService montar o detalhe
   * completo. Esta consulta curta evita que o feed em tempo real diga apenas
   * "um motoboy" enquanto o historico recarregado ja conhece os nomes.
   */
  private async emitAcceptedActivities(
    items: Array<{ id: string; displayNumber: number; companyId: string }>,
    driverId: string,
  ): Promise<void> {
    let enriched: Array<{ id: string; company: { tradeName: string } }> = [];
    let driver: { user: { name: string } } | null = null;
    try {
      const [foundDeliveries, foundDriver] = await Promise.all([
        this.prisma.delivery.findMany({
          where: { id: { in: items.map((item) => item.id) } },
          include: { company: { select: { tradeName: true } } },
        }),
        this.prisma.driver.findUnique({
          where: { id: driverId },
          include: { user: { select: { name: true } } },
        }),
      ]);
      enriched = foundDeliveries ?? [];
      driver = foundDriver ?? null;
    } catch (error) {
      // A entrega ja foi aceita. Falha ao enriquecer uma mensagem auxiliar nao
      // pode transformar sucesso operacional em erro e induzir uma repeticao.
      this.logger.warn(`Falha ao enriquecer atividade de aceite: ${String(error)}`);
    }
    const enrichedById = new Map(enriched.map((item) => [item.id, item]));

    for (const item of items) {
      const complete = enrichedById.get(item.id);
      this.realtimeGateway.emitAdminActivity({
        type: 'DELIVERY_STATUS_CHANGED',
        message: deliveryActivityMessage({
          displayNumber: item.displayNumber,
          companyName: complete?.company?.tradeName,
          status: 'ACCEPTED',
          driverName: driver?.user.name,
        }),
        deliveryId: item.id,
        displayNumber: item.displayNumber,
        companyId: item.companyId,
        ...(complete?.company?.tradeName ? { companyName: complete.company.tradeName } : {}),
        driverId,
        ...(driver?.user.name ? { driverName: driver.user.name } : {}),
        status: 'ACCEPTED',
      });
    }
  }

  private eligibleDriverWhere(regionId: string, serviceTypeIds: string[]): Prisma.DriverWhereInput {
    /**
     * Sem filtro por entregas em andamento.
     *
     * Antes havia `deliveries: { none: ... }`, que travava o motoboy em uma
     * corrida por vez. Em cidade pequena ele junta varias entregas na mesma
     * saida, e a regra o obrigava a voltar a loja entre cada uma. O teto, se a
     * operacao precisar de um, vem de `maxConcurrentDeliveriesPerDriver` e e
     * aplicado por `cabeMaisUmaEntrega`.
     */
    return {
      regionId,
      approvalStatus: 'APPROVED',
      accountStatus: 'ACTIVE',
      availability: 'AVAILABLE',
      AND: serviceTypeIds.map((serviceTypeId) => ({
        serviceTypes: {
          some: { serviceTypeId, serviceType: { active: true } },
        },
      })),
    };
  }
}
