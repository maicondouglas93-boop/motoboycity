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
import type {
  AcceptOfferResult,
  AdminTargetedDispatchResult,
  DeliveryOfferPayload,
} from '@motoboycity/types';
import { AdminPlatformSettingsService } from '../admin/platform-settings/admin-platform-settings.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { PrismaService } from '../prisma/prisma.service';
import { LiveDriverPresenceService } from '../live-presence/live-driver-presence.service';
import { PushService, type PushMessage } from '../push/push.service';
import { deliveryActivityMessage } from '../common/status-labels';
import { buildOfferPayload, remainingSeconds } from './offer-payload';
import { IntegrationOutboxRecorder } from '../integrations/integration-outbox-recorder.service';
import {
  DriverPunishmentService,
  type RefusalKind,
} from '../driver-punishment/driver-punishment.service';

export const DISPATCH_QUEUE = 'dispatch';
export const OFFER_EXPIRE_JOB = 'offer-expire';
export const ACTIVATE_SCHEDULED_JOB = 'activate-scheduled';
export const PICKUP_EXPIRE_JOB = 'pickup-expire';
export const PUNISHMENT_EXPIRE_JOB = 'punishment-expire';
export const SWEEP_DISPATCH_JOB = 'sweep-dispatch';

type PendingOfferCreationResult = { offers: DeliveryOffer[] } | { retryNextDriver: boolean };

class PickupExpiryRaceError extends Error {}

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

function pickupExpireJobId(deliveryId: string, deadlineAt: Date): string {
  return `pickup-expire-${deliveryId}-${deadlineAt.getTime()}`;
}

function punishmentExpireJobId(punishmentId: string): string {
  return `punishment-expire-${punishmentId}`;
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
    private readonly integrationOutbox: IntegrationOutboxRecorder,
    private readonly punishmentService: DriverPunishmentService,
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

  private async pickupDeadlineFrom(acceptedAt: Date): Promise<Date | null> {
    const settings = await this.platformSettingsService.get();
    const timeoutMinutes = settings.pickupAssignmentTimeoutMinutes;
    if (timeoutMinutes === null || timeoutMinutes === undefined) return null;
    return new Date(acceptedAt.getTime() + timeoutMinutes * 60_000);
  }

  private async schedulePickupExpiry(
    deliveryId: string,
    driverId: string,
    deadlineAt: Date | null,
  ): Promise<void> {
    if (!deadlineAt) return;

    await this.dispatchQueue.add(
      PICKUP_EXPIRE_JOB,
      {
        deliveryId,
        expectedDriverId: driverId,
        expectedDeadlineAt: deadlineAt.toISOString(),
      },
      {
        delay: Math.max(0, deadlineAt.getTime() - Date.now()),
        jobId: pickupExpireJobId(deliveryId, deadlineAt),
        attempts: 5,
        backoff: { type: 'exponential', delay: 5_000 },
      },
    );
  }

  /**
   * Prazo de coleta para uma atribuicao que comeca agora.
   *
   * Publico porque a troca de entregador pelo painel precisa do mesmo relogio:
   * o job pendente carrega o motoboy antigo e vira no-op depois da troca, e sem
   * um prazo novo o pedido justamente reatribuido — o que ja deu problema — era
   * o unico que ficava sem ninguem cobrando a coleta. `null` quando a operacao
   * nao configurou prazo, e ai nao ha nada a cobrar.
   */
  async novoPrazoDeColeta(): Promise<Date | null> {
    return this.pickupDeadlineFrom(new Date());
  }

  /** Agenda a cobranca do prazo devolvido por `novoPrazoDeColeta`. */
  async agendarPrazoDeColeta(
    deliveryId: string,
    driverId: string,
    deadlineAt: Date | null,
  ): Promise<void> {
    await this.schedulePickupExpiry(deliveryId, driverId, deadlineAt);
  }

  private async ensurePickupExpiry(deliveryId: string, driverId: string): Promise<void> {
    const delivery = await this.prisma.delivery.findUnique({
      where: { id: deliveryId },
      select: { status: true, driverId: true, pickupDeadlineAt: true },
    });
    if (
      !delivery ||
      delivery.status !== 'ACCEPTED' ||
      delivery.driverId !== driverId ||
      !delivery.pickupDeadlineAt
    ) {
      return;
    }
    await this.schedulePickupExpiry(deliveryId, driverId, delivery.pickupDeadlineAt);
  }

  async handlePickupExpired(
    deliveryId: string,
    expectedDriverId: string,
    expectedDeadlineAt: string,
  ): Promise<void> {
    const deadlineAt = new Date(expectedDeadlineAt);
    if (Number.isNaN(deadlineAt.getTime())) {
      this.logger.warn(`Prazo de coleta invalido no job do pedido ${deliveryId}.`);
      return;
    }

    const target = await this.prisma.delivery.findUnique({ where: { id: deliveryId } });
    if (!target) return;

    // Se a transicao ja foi gravada mas o redespacho falhou, uma tentativa do
    // BullMQ chega aqui e conclui somente a parte externa que ficou pendente.
    if (
      target.status === 'AWAITING_DRIVER' &&
      target.driverId === null &&
      target.pickupDeadlineAt === null
    ) {
      await this.dispatchDelivery(deliveryId, { excludeDriverIds: [expectedDriverId] });
      return;
    }

    if (
      target.status !== 'ACCEPTED' ||
      target.driverId !== expectedDriverId ||
      target.pickupDeadlineAt?.getTime() !== deadlineAt.getTime()
    ) {
      return;
    }

    const deliveries = target.batchId
      ? await this.prisma.delivery.findMany({
          where: { batchId: target.batchId },
          orderBy: { createdAt: 'asc' },
        })
      : [target];
    const deliveryIds = deliveries.map((item) => item.id);
    const expiredAt = new Date();

    try {
      await this.prisma.$transaction(async (tx) => {
        const updated = await tx.delivery.updateMany({
          where: {
            id: { in: deliveryIds },
            status: 'ACCEPTED',
            driverId: expectedDriverId,
            pickupDeadlineAt: deadlineAt,
          },
          data: {
            status: 'AWAITING_DRIVER',
            driverId: null,
            pickupDeadlineAt: null,
            statusChangedAt: expiredAt,
          },
        });
        if (updated.count !== deliveryIds.length) {
          // Coleta e expiracao podem tocar o mesmo registro no mesmo instante.
          // Lancar reverte inclusive uma atualizacao parcial do lote.
          throw new PickupExpiryRaceError();
        }

        await tx.deliveryStatusHistory.createMany({
          data: deliveryIds.map((id) => ({
            deliveryId: id,
            fromStatus: 'ACCEPTED' as const,
            toStatus: 'AWAITING_DRIVER' as const,
            note: 'Prazo de coleta expirado; pedido devolvido automaticamente ao despacho.',
          })),
        });
      });
    } catch (error) {
      if (error instanceof PickupExpiryRaceError) return;
      throw error;
    }

    this.realtimeGateway.emitToDriver(expectedDriverId, 'delivery:pickup-expired', {
      deliveryIds,
    });
    this.realtimeGateway.emitAdminActivity(
      `Prazo de coleta do pedido #${target.displayNumber} expirou; buscando outro motoboy.`,
    );
    for (const item of deliveries) {
      this.realtimeGateway.emitDeliveryUpdated(item.companyId, {
        deliveryId: item.id,
        displayNumber: item.displayNumber,
        companyId: item.companyId,
        driverId: null,
        status: 'AWAITING_DRIVER',
      });
    }
    await this.pushService
      .sendToDriver(expectedDriverId, {
        title: 'Prazo de coleta encerrado',
        body: `O pedido #${target.displayNumber} voltou para a fila e sera enviado a outro motoboy.`,
        kind: 'general',
        data: { type: 'pickup-expired', deliveryIds: deliveryIds.join(',') },
      })
      .catch((error) =>
        this.logger.warn(`Falha ao avisar expiracao da coleta por push: ${String(error)}`),
      );

    await this.dispatchDelivery(deliveryId, { excludeDriverIds: [expectedDriverId] });
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
        companyId: delivery.companyId,
        regionId: delivery.company.regionId,
        serviceTypeIds,
        quantidade: deliveryIds.length,
      });
      if (!candidateDriverId) return;

      const creation = await this.createPendingOffers({
        deliveryIds,
        driverId: candidateDriverId,
        companyId: delivery.companyId,
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

    const offeredAt = offers[0]!.offeredAt;
    const expiresAtEpochMs = offeredAt.getTime() + timeoutSeconds * 1000;

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
        expiresInSeconds: remainingSeconds(offeredAt, timeoutSeconds),
        expiresAtEpochMs,
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
          expiresInSeconds: String(remainingSeconds(offeredAt, timeoutSeconds)),
          expiresAtEpochMs: String(expiresAtEpochMs),
        },
      });
    } catch (error: unknown) {
      this.logger.warn(`Falha ao enviar push da oferta ${offers[0]!.id}: ${String(error)}`);
    }
  }

  /**
   * Reoferta manual do painel administrativo.
   *
   * Diferente do despacho automatico, nao exclui quem ja recusou ou deixou a
   * oferta expirar: o administrador esta escolhendo conscientemente aquela
   * pessoa. Todas as demais protecoes continuam valendo sob lock.
   */
  async reofferDeliveryToDriver(
    deliveryId: string,
    driverId: string,
    audit: { adminId: string; adminName: string; reason: string },
  ): Promise<AdminTargetedDispatchResult> {
    const delivery = await this.prisma.delivery.findUnique({
      where: { id: deliveryId },
      include: {
        company: { select: { regionId: true, tradeName: true } },
        serviceType: { select: { name: true } },
        addresses: true,
      },
    });
    if (!delivery) {
      throw new NotFoundException('Pedido nao encontrado.');
    }
    if (delivery.status !== 'AWAITING_DRIVER' || delivery.driverId !== null) {
      throw new ConflictException('Somente pedidos buscando motoboy podem ser reenviados.');
    }

    const deliveries = delivery.batchId
      ? await this.prisma.delivery.findMany({
          where: { batchId: delivery.batchId },
          orderBy: { createdAt: 'asc' },
          include: { serviceType: { select: { name: true } }, addresses: true },
        })
      : [delivery];
    if (deliveries.some((item) => item.status !== 'AWAITING_DRIVER' || item.driverId !== null)) {
      throw new ConflictException('O lote mudou de estado. Atualize o painel e tente novamente.');
    }

    const deliveryIds = deliveries.map((item) => item.id);
    const pendingOffer = await this.prisma.deliveryOffer.findFirst({
      where: { deliveryId: { in: deliveryIds }, response: 'PENDING' },
      select: { id: true },
    });
    if (pendingOffer) {
      throw new ConflictException('Este pedido ja esta tocando para um motoboy.');
    }

    const settings = await this.platformSettingsService.get();
    const timeoutSeconds = settings.dispatchOfferTimeoutSeconds;
    if (timeoutSeconds === null) {
      throw new ConflictException('Configure o tempo de resposta das ofertas antes de reenviar.');
    }

    const serviceTypeIds = [...new Set(deliveries.map((item) => item.serviceTypeId))];
    if (await this.isCompanyBlocked(driverId, delivery.companyId)) {
      throw new ConflictException('Este motoboy esta bloqueado para atender esta empresa.');
    }
    const selectedDriver = await this.prisma.driver.findFirst({
      where: {
        id: driverId,
        ...this.eligibleDriverWhere(delivery.company.regionId, serviceTypeIds, delivery.companyId),
      },
      select: { id: true, user: { select: { name: true } } },
    });
    if (!selectedDriver) {
      throw new ConflictException(
        'O motoboy nao esta ativo ou nao atende a regiao e a modalidade deste pedido.',
      );
    }
    if (!(await this.livePresence.isLive(driverId))) {
      throw new ConflictException('O motoboy esta sem localizacao online neste momento.');
    }
    if (await this.punishmentService.activeFor(driverId)) {
      throw new ConflictException('O motoboy esta temporariamente fora do despacho.');
    }
    const limiteSimultaneo = await this.limiteDeEntregasSimultaneas();
    if (!(await this.cabeMaisUmaEntrega(driverId, limiteSimultaneo, deliveries.length))) {
      throw new ConflictException(
        deliveries.length > 1
          ? 'O lote nao cabe no limite de entregas simultaneas deste motoboy.'
          : 'O motoboy atingiu o limite de entregas simultaneas.',
      );
    }
    const driverPendingOffer = await this.prisma.deliveryOffer.findFirst({
      where: { driverId, response: 'PENDING' },
      select: { id: true },
    });
    if (driverPendingOffer) {
      throw new ConflictException('O motoboy ja esta respondendo outra oferta.');
    }

    const creation = await this.createPendingOffers({
      deliveryIds,
      driverId,
      companyId: delivery.companyId,
      regionId: delivery.company.regionId,
      serviceTypeIds,
    });
    if (!('offers' in creation)) {
      throw new ConflictException(
        'O pedido ou o motoboy mudou de estado. Atualize o painel e tente novamente.',
      );
    }
    const offers = creation.offers;

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
      await this.prisma.deliveryOffer.updateMany({
        where: { id: { in: offerIds }, response: 'PENDING' },
        data: { response: 'EXPIRED', respondedAt: new Date() },
      });
      await Promise.allSettled(offerIds.map((offerId) => this.cancelOfferTimeout(offerId)));
      throw schedulingFailure.reason;
    }

    const offeredAt = offers[0]!.offeredAt;
    const expiresAtEpochMs = offeredAt.getTime() + timeoutSeconds * 1000;

    try {
      await this.livePresence.moveToDispatchTail(driverId);
    } catch (error: unknown) {
      this.logger.warn(
        `Nao foi possivel mover o motoboy ${driverId} para o fim da fila: ${String(error)}`,
      );
    }

    this.realtimeGateway.emitToDriver(
      driverId,
      'delivery:offer',
      buildOfferPayload({
        offerId: offers[0]!.id,
        principal: delivery,
        entregas: deliveries,
        expiresInSeconds: remainingSeconds(offeredAt, timeoutSeconds),
        expiresAtEpochMs,
      }),
    );
    this.realtimeGateway.emitAdminActivity(
      `${audit.adminName} reenviou o pedido #${delivery.displayNumber} para ${selectedDriver.user.name}.`,
    );

    const quantidade = deliveries.length;
    const body =
      quantidade > 1
        ? `O lote com ${quantidade} entregas esta disponivel.`
        : `O pedido #${delivery.displayNumber} esta disponivel.`;
    try {
      await this.pushService.sendToDriver(driverId, {
        kind: 'offer',
        title: 'Pedido disponivel',
        body,
        data: {
          type: 'offer',
          offerId: offers[0]!.id,
          deliveryId: delivery.id,
          expiresInSeconds: String(remainingSeconds(offeredAt, timeoutSeconds)),
          expiresAtEpochMs: String(expiresAtEpochMs),
        },
      });
    } catch (error: unknown) {
      this.logger.warn(`Falha ao enviar push da oferta ${offers[0]!.id}: ${String(error)}`);
    }

    try {
      await this.prisma.deliveryStatusHistory.createMany({
        data: deliveryIds.map((id) => ({
          deliveryId: id,
          fromStatus: 'AWAITING_DRIVER' as const,
          toStatus: 'AWAITING_DRIVER' as const,
          changedByUserId: audit.adminId,
          note:
            `Oferta reenviada manualmente para ${selectedDriver.user.name}. ` +
            `Motivo: ${audit.reason}`,
        })),
      });
    } catch (error: unknown) {
      this.logger.warn(
        `Falha ao auditar reoferta manual do pedido ${deliveryId}: ${String(error)}`,
      );
    }

    return {
      deliveryIds,
      driverId,
      driverName: selectedDriver.user.name,
      offerIds: offers.map((offer) => offer.id),
    };
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

  /**
   * A rede de seguranca do despacho: roda sozinha, de minuto em minuto.
   *
   * Ate aqui o despacho era 100% orientado a evento. Um pedido agendado tinha
   * UM gatilho — o job no Redis — e se aquele `queue.add` falhasse (ele roda
   * depois do commit, entao o pedido ja estava gravado), nada mais no sistema
   * olhava para `SCHEDULED`: a reconciliacao de presenca so poe motoboy
   * offline, e a varredura de fila so enxerga `AWAITING_DRIVER`. O pedido
   * esperava para sempre por uma hora que nunca chegava. Isso atinge TODO
   * pedido importado do aiqfome, que nasce agendado por construcao.
   *
   * A propria integracao ja tinha essa rede — varredura a cada 30s e resgate de
   * `PROCESSING` travado. O despacho era o unico lado do sistema sem ela.
   *
   * Idempotente por desenho: cada passo reusa um caminho que ja checa o estado
   * antes de agir, entao rodar duas vezes junto nao duplica nada.
   */
  async sweepStuckDeliveries(): Promise<void> {
    const agora = new Date();
    const agendados = await this.prisma.delivery.findMany({
      where: { status: 'SCHEDULED' },
      orderBy: { scheduledAt: 'asc' },
      take: 200,
      select: { id: true, scheduledAt: true },
    });

    for (const agendado of agendados) {
      // Sem data e um registro quebrado: nunca teria hora para ativar. Entra na
      // fila agora, que e melhor do que ficar invisivel para sempre.
      if (!agendado.scheduledAt) {
        this.logger.warn(`Pedido ${agendado.id} esta SCHEDULED sem data; ativando pela varredura.`);
        await this.handleScheduledActivation(agendado.id);
        continue;
      }
      if (agendado.scheduledAt <= agora) {
        await this.handleScheduledActivation(agendado.id);
        continue;
      }

      /**
       * Ainda no futuro: conserta o job ANTES de ele fazer falta, em vez de
       * esperar o pedido atrasar para descobrir que ninguem ia acorda-lo.
       */
      const job = await this.dispatchQueue.getJob(activateJobId(agendado.id));
      if (!job) {
        this.logger.warn(
          `Ativacao do pedido agendado ${agendado.id} estava sem job; reagendada pela varredura.`,
        );
        await this.scheduleActivation(agendado.id, agendado.scheduledAt);
      }
    }

    await this.dispatchAvailableDeliveries();
  }

  /**
   * Contabiliza a recusa/expiracao e, se ela fechar a conta, tira o motoboy do
   * despacho pelo tempo configurado.
   *
   * Roda ANTES do redespacho de proposito: sem isso o mesmo motoboy que acabou
   * de recusar continuaria elegivel para o proximo pedido da varredura, e a
   * punicao so valeria a partir da oferta seguinte.
   *
   * Nunca interrompe o fluxo do pedido. A entrega precisa continuar procurando
   * motoboy mesmo que a punicao falhe — o pedido e do cliente, a punicao e uma
   * regra de gestao de frota.
   */
  private async registrarRecusa(
    driverId: string,
    deliveryId: string,
    kind: RefusalKind,
  ): Promise<void> {
    try {
      const punicao = await this.punishmentService.registerRefusal({
        driverId,
        deliveryId,
        kind,
      });
      if (!punicao) return;

      /**
       * O fim do castigo precisa de um gatilho proprio.
       *
       * Hoje a unica coisa que varre pedidos parados e um motoboy ficando
       * online. Se todos os elegiveis estiverem punidos, o pedido fica na fila
       * sem oferta nenhuma e ninguem acorda o despacho quando o prazo vence.
       */
      await this.dispatchQueue.add(
        PUNISHMENT_EXPIRE_JOB,
        { punishmentId: punicao.id },
        {
          delay: Math.max(0, punicao.expiresAt.getTime() - Date.now()),
          jobId: punishmentExpireJobId(punicao.id),
          attempts: 3,
          backoff: { type: 'exponential', delay: 5_000 },
        },
      );
    } catch (error: unknown) {
      this.logger.warn(
        `Falha ao registrar recusa do motoboy ${driverId} no pedido ${deliveryId}: ${String(error)}`,
      );
    }
  }

  /** Fim de uma punicao: varre a fila, que pode ter ficado parada por falta de
   * motoboy elegivel enquanto ele estava fora. */
  async handlePunishmentExpired(): Promise<void> {
    await this.dispatchAvailableDeliveries();
  }

  /**
   * Aceitar trabalho zera a sequencia de recusas.
   *
   * Nao pode derrubar um aceite que ja foi persistido: o pedido esta na mao do
   * motoboy, e falhar aqui devolveria um erro que o aplicativo leria como
   * "nao consegui aceitar" — o pior desfecho possivel para um contador.
   */
  private async zerarSequenciaDeRecusas(driverId: string): Promise<void> {
    try {
      await this.punishmentService.registerAcceptance(driverId);
    } catch (error: unknown) {
      this.logger.warn(
        `Falha ao zerar a sequencia de recusas do motoboy ${driverId}: ${String(error)}`,
      );
    }
  }

  /**
   * @param options.punish quando `false`, a oferta deixa de valer sem
   * contabilizar recusa. E o caso de quem foi bloqueado pelo admin: as ofertas
   * dele voltam para a fila por esta mesma funcao, e cobrar isso como recusa
   * puniria o motoboy por uma decisao que nao foi dele.
   */
  async handleOfferExpired(offerId: string, options?: { punish?: boolean }): Promise<void> {
    const punish = options?.punish ?? true;
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
        punish,
      );
      return;
    }

    /**
     * Condicional, e nao um `update` direto: a leitura acima pode estar velha.
     *
     * O motoboy recusando no ultimo segundo e a loja cancelando no ultimo
     * segundo caem os dois aqui. Sem o `where` de `PENDING`, esta escrita
     * sobrepunha a resposta dele — o historico passava a dizer "expirou" para
     * quem apertou recusar — e o `registrarRecusa` abaixo rodava de novo:
     * contava duas vezes a mesma recusa, ou punia o motoboy por um pedido que
     * a loja retirou. Perder a corrida aqui significa que outro caminho ja
     * resolveu a oferta e ja cuidou do redespacho.
     */
    const expiracao = await this.prisma.deliveryOffer.updateMany({
      where: { id: offerId, response: 'PENDING' },
      data: { response: 'EXPIRED', respondedAt: new Date() },
    });
    if (expiracao.count === 0) {
      this.logger.debug(
        `Oferta ${offerId} deixou de estar pendente antes da expiracao; nada foi contabilizado.`,
      );
      return;
    }

    this.realtimeGateway.emitToDriver(offer.driverId, 'delivery:offer-expired', { offerId });
    await this.notifyOfferResolved(offer.driverId, [offerId], 'expired');
    this.realtimeGateway.emitAdminActivity(
      'Oferta expirou sem resposta, buscando o próximo motoboy.',
    );

    if (punish) {
      await this.registrarRecusa(offer.driverId, offer.deliveryId, 'EXPIRED');
    }
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
  async releasePendingOffersForDriver(driverId: string, companyId?: string): Promise<number> {
    const pending = await this.prisma.deliveryOffer.findMany({
      where: {
        driverId,
        response: 'PENDING',
        ...(companyId && { delivery: { companyId } }),
      },
      select: { id: true },
    });

    for (const offer of pending) {
      // Idempotente: se a oferta saiu de PENDING nesse meio-tempo, ela nao faz nada.
      // Expira antes de remover o timeout: se a operacao falhar, o job segue
      // ativo como compensacao e tenta novamente no prazo normal da oferta.
      try {
        // `punish: false` — quem tirou a oferta da mao dele foi o admin.
        await this.handleOfferExpired(offer.id, { punish: false });
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
        await this.handleOfferExpired(offer.id, { punish: false });
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

    /**
     * A guarda de status precisa estar na ESCRITA, e nao so na leitura acima.
     *
     * `cancelScheduledActivation` remove o job da fila, mas remover nao
     * interrompe um job que ja esta rodando: a loja pode cancelar entre a
     * leitura e esta transacao. Sem o `where`, o pedido cancelado voltava para
     * a fila e era ofertado — a loja via ressuscitar o que tinha acabado de
     * cancelar, e o historico registrava uma transicao que partiu de outro
     * estado.
     */
    const ativado = await this.prisma.$transaction(async (tx) => {
      const atualizada = await tx.delivery.updateMany({
        where: { id: deliveryId, status: 'SCHEDULED' },
        data: { status: 'AWAITING_DRIVER', statusChangedAt: new Date() },
      });
      if (atualizada.count === 0) {
        return false;
      }
      await tx.deliveryStatusHistory.create({
        data: { deliveryId, fromStatus: 'SCHEDULED', toStatus: 'AWAITING_DRIVER' },
      });
      return true;
    });
    if (!ativado) {
      this.logger.debug(
        `Pedido ${deliveryId} saiu de SCHEDULED antes da ativacao; nada foi enfileirado.`,
      );
      return;
    }

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

  /**
   * O aceite ja foi confirmado no banco. Falhar ao limpar o job auxiliar nao
   * pode devolver 500 e fazer o motoboy acreditar que perdeu o pedido.
   * O job remanescente e seguro: ao executar, encontra a oferta ACCEPTED e faz
   * no-op. Registramos a falha para a infraestrutura poder ser investigada.
   */
  private cancelAcceptedOfferTimeouts(offerIds: string[]): void {
    const removals = Promise.allSettled(
      offerIds.map((offerId) => this.cancelOfferTimeout(offerId)),
    );
    removals
      .then((results) => {
        results.forEach((result, index) => {
          if (result.status === 'rejected') {
            this.logger.warn(
              `Falha ao remover timeout da oferta aceita ${offerIds[index]}: ${String(result.reason)}`,
            );
          }
        });
      })
      .catch((error: unknown) => {
        this.logger.warn(`Falha inesperada na limpeza de ofertas aceitas: ${String(error)}`);
      });
  }

  private ensurePickupExpiryAfterAccepted(deliveryId: string, driverId: string): void {
    this.ensurePickupExpiry(deliveryId, driverId).catch((error: unknown) => {
      this.logger.warn(
        `Falha ao conferir prazo de coleta do pedido ja aceito ${deliveryId}: ${String(error)}`,
      );
    });
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

    // Condicional pelo mesmo motivo de `handleOfferExpired`: entre a leitura e
    // esta linha a oferta pode ter sido respondida, e sobrescrever a resposta
    // apagaria o aceite do motoboy do historico.
    const cancelada = await this.prisma.deliveryOffer.updateMany({
      where: { id: pendingOffer.id, response: 'PENDING' },
      data: { response: 'EXPIRED', respondedAt: new Date() },
    });
    if (cancelada.count === 0) {
      return;
    }
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
    if (!offeredDelivery) {
      throw new NotFoundException('Pedido da oferta nao encontrado.');
    }
    await this.assertCompanyAllowed(driverId, [offeredDelivery.companyId]);

    const acceptedAt = new Date();
    const pickupDeadlineAt = await this.pickupDeadlineFrom(acceptedAt);
    // O job nasce antes da transacao: se o Redis estiver indisponivel, o
    // pedido nao pode ser aceito sem a garantia de que o prazo sera cumprido.
    // Se a transacao perder uma corrida, o job orfao apenas faz no-op.
    await this.schedulePickupExpiry(offer.deliveryId, driverId, pickupDeadlineAt);

    let delivery: { id: string; displayNumber: number; companyId: string };
    try {
      delivery = await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw<Array<{ id: string }>>(
          Prisma.sql`SELECT "id" FROM "drivers" WHERE "id" = ${driverId} FOR UPDATE`,
        );
        await this.assertCompanyAllowed(driverId, [offeredDelivery.companyId], tx);
        const offerUpdate = await tx.deliveryOffer.updateMany({
          where: { id: offerId, response: 'PENDING' },
          data: { response: 'ACCEPTED', respondedAt: new Date() },
        });
        if (offerUpdate.count === 0) {
          throw new ConflictException('Esta oferta não está mais disponível.');
        }

        const deliveryUpdate = await tx.delivery.updateMany({
          where: { id: offer.deliveryId, status: 'AWAITING_DRIVER' },
          data: {
            status: 'ACCEPTED',
            driverId,
            statusChangedAt: acceptedAt,
            pickupDeadlineAt,
          },
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
        await this.integrationOutbox.record(tx, offer.deliveryId, 'ACCEPTED');

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

    this.cancelAcceptedOfferTimeouts([offerId]);
    await this.notifyOfferResolved(driverId, [offerId], 'accepted');
    await this.zerarSequenciaDeRecusas(driverId);
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
    await this.registrarRecusa(driverId, offer.deliveryId, 'DECLINED');
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
    const companyIds = [...new Set(deliveries.map((delivery) => delivery.companyId))];
    const offers = await this.prisma.deliveryOffer.findMany({
      where: { deliveryId: { in: deliveryIds }, driverId, response: 'PENDING' },
      select: { id: true },
    });
    if (offers.length !== deliveryIds.length) {
      throw new ConflictException('O lote não está mais disponível para aceite.');
    }
    const offerIds = offers.map((offer) => offer.id);
    await this.assertCompanyAllowed(driverId, companyIds);
    const acceptedAt = new Date();
    const pickupDeadlineAt = await this.pickupDeadlineFrom(acceptedAt);
    await this.schedulePickupExpiry(deliveryId, driverId, pickupDeadlineAt);

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw<Array<{ id: string }>>(
          Prisma.sql`SELECT "id" FROM "drivers" WHERE "id" = ${driverId} FOR UPDATE`,
        );
        await this.assertCompanyAllowed(driverId, companyIds, tx);
        const offerUpdate = await tx.deliveryOffer.updateMany({
          where: { id: { in: offerIds }, response: 'PENDING' },
          data: { response: 'ACCEPTED', respondedAt: new Date() },
        });
        if (offerUpdate.count !== offerIds.length) {
          throw new ConflictException('O lote não está mais disponível para aceite.');
        }
        const deliveryUpdate = await tx.delivery.updateMany({
          where: { id: { in: deliveryIds }, status: 'AWAITING_DRIVER' },
          data: {
            status: 'ACCEPTED',
            driverId,
            statusChangedAt: acceptedAt,
            pickupDeadlineAt,
          },
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
        for (const id of deliveryIds) {
          await this.integrationOutbox.record(tx, id, 'ACCEPTED');
        }
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

    this.cancelAcceptedOfferTimeouts(offerIds);
    await this.notifyOfferResolved(driverId, offerIds, 'accepted');
    await this.zerarSequenciaDeRecusas(driverId);
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
    this.ensurePickupExpiryAfterAccepted(result.deliveryId, driverId);
    const deliveryIds = result.deliveryIds ?? [result.deliveryId];
    const offers = await this.prisma.deliveryOffer.findMany({
      where: { driverId, deliveryId: { in: deliveryIds }, response: 'ACCEPTED' },
      select: { id: true },
    });
    const offerIds = offers.map((item) => item.id);
    this.cancelAcceptedOfferTimeouts(offerIds);
    await this.notifyOfferResolved(driverId, offerIds, 'accepted');
  }

  private async expireBatchOffer(
    offerId: string,
    driverId: string,
    deliveryId: string,
    batchId: string,
    punish = true,
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
    // Uma recusa, nao uma por pedido: o lote e ofertado e respondido como uma
    // unidade, e contar cada item transformaria um unico "nao" em cinco.
    if (punish) {
      await this.registrarRecusa(driverId, deliveryId, 'EXPIRED');
    }
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
    await this.registrarRecusa(driverId, deliveryId, 'DECLINED');
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
    companyId,
    regionId,
    serviceTypeIds,
  }: {
    deliveryIds: string[];
    driverId: string;
    companyId: string;
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
            where: {
              id: driverId,
              ...this.eligibleDriverWhere(regionId, serviceTypeIds, companyId),
            },
            select: { id: true },
          });
          if (!eligibleDriver) {
            return { retryNextDriver: true };
          }

          /**
           * A punicao tambem e reconferida aqui, pelo mesmo motivo do teto de
           * entregas: entre escolher o motoboy e criar a oferta, ele pode ter
           * recusado outra corrida e sido punido. Sem esta checagem, a oferta
           * nasceria para quem acabou de sair do despacho.
           */
          const punicaoAtiva = await tx.driverPunishment.findFirst({
            where: { driverId, expiresAt: { gt: new Date() }, revokedAt: null },
            select: { id: true },
          });
          if (punicaoAtiva) {
            return { retryNextDriver: true };
          }

          /**
           * O teto e conferido DENTRO da transacao, e nao so na escolha do
           * motoboy: entre escolher e ofertar, ele pode ter aceitado outra
           * corrida e estourado o limite.
           */
          if (
            !(await this.cabeMaisUmaEntrega(driverId, limiteSimultaneo, deliveryIds.length, tx))
          ) {
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
     *
     * Aqui a conta e por uma entrega so, de proposito: a pergunta desta tela e
     * "ele cabe alguma coisa?". Um item de lote que nao couber inteiro e
     * barrado no `claimDelivery`, que conhece o tamanho do lote.
     */
    const limiteSimultaneo = await this.limiteDeEntregasSimultaneas();
    if (!(await this.cabeMaisUmaEntrega(driverId, limiteSimultaneo))) return [];

    /**
     * A vitrine tambem some durante a punicao.
     *
     * Sem isto a regra nao teria efeito nenhum: bastaria recusar a oferta e
     * pegar o mesmo pedido na lista de disponiveis um segundo depois. Nao e
     * "minutos sem receber pedidos" — e minutos fora do despacho.
     */
    if (await this.punishmentService.activeFor(driverId)) return [];

    const deliveries = await this.prisma.delivery.findMany({
      where: {
        status: 'AWAITING_DRIVER',
        driverId: null,
        company: {
          regionId: driver.regionId,
          driverBlocks: { none: { driverId } },
        },
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
    const alvo = await this.prisma.delivery.findUnique({
      where: { id: deliveryId },
      include: { company: { select: { regionId: true } } },
    });
    if (!alvo) {
      throw new NotFoundException('Pedido não encontrado.');
    }
    const claimedBeforeRetry = await this.assignedDeliveryResult(alvo, driverId);
    if (claimedBeforeRetry) {
      this.ensurePickupExpiryAfterAccepted(claimedBeforeRetry.deliveryId, driverId);
      return claimedBeforeRetry;
    }
    if (alvo.status !== 'AWAITING_DRIVER' || alvo.driverId !== null) {
      throw new ConflictException('Este pedido já não está mais disponível.');
    }
    await this.assertCompanyAllowed(driverId, [alvo.companyId]);

    // A vitrine ja esconde os pedidos de quem esta punido; esta checagem fecha
    // a porta para uma tela desatualizada ou uma chamada direta a API.
    const punicao = await this.punishmentService.activeFor(driverId);
    if (punicao) {
      throw new ForbiddenException(
        'Você está fora do despacho por ter recusado ofertas. Aguarde o fim do período.',
      );
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

    /**
     * A vitrine ja filtra regiao, modalidade e teto — mas ela e uma LISTA, e a
     * lista pode estar velha na tela do motoboy. Estas duas checagens fecham a
     * porta que a punicao ja tinha fechado acima: uma tela desatualizada, ou
     * uma chamada direta a API, entrava sem passar por nenhuma delas.
     */
    const serviceTypeIds = [...new Set(irmaos.map((item) => item.serviceTypeId))];
    const elegivel = await this.prisma.driver.findFirst({
      where: {
        id: driverId,
        ...this.eligibleDriverWhere(alvo.company.regionId, serviceTypeIds, alvo.companyId),
      },
      select: { id: true },
    });
    if (!elegivel) {
      throw new ConflictException('Você não atende à região ou à modalidade deste pedido.');
    }
    const limiteSimultaneo = await this.limiteDeEntregasSimultaneas();
    if (!(await this.cabeMaisUmaEntrega(driverId, limiteSimultaneo, ids.length))) {
      throw new ConflictException(
        ids.length > 1
          ? 'Este lote não cabe no seu limite de entregas simultâneas.'
          : 'Você atingiu o limite de entregas simultâneas.',
      );
    }

    const acceptedAt = new Date();
    const pickupDeadlineAt = await this.pickupDeadlineFrom(acceptedAt);
    await this.schedulePickupExpiry(deliveryId, driverId, pickupDeadlineAt);

    let delivery: {
      id: string;
      displayNumber: number;
      companyId: string;
      status: DeliveryStatus;
      batchId: string | null;
    };
    try {
      delivery = await this.prisma.$transaction(async (tx) => {
        /**
         * Mesmo eixo de serializacao de `createPendingOffers`: o lock da
         * entrega impede dois motoboys no mesmo pedido, e este lock do motoboy
         * impede que dois claims simultaneos DELE passem juntos pelo mesmo
         * teto. Sem ele, a contagem la de cima e so uma leitura otimista.
         */
        await tx.$queryRaw<Array<{ id: string }>>(
          Prisma.sql`SELECT "id" FROM "drivers" WHERE "id" = ${driverId} FOR UPDATE`,
        );
        await this.assertCompanyAllowed(driverId, [alvo.companyId], tx);
        if (!(await this.cabeMaisUmaEntrega(driverId, limiteSimultaneo, ids.length, tx))) {
          throw new ConflictException(
            ids.length > 1
              ? 'Este lote não cabe no seu limite de entregas simultâneas.'
              : 'Você atingiu o limite de entregas simultâneas.',
          );
        }

        const atualizadas = await tx.delivery.updateMany({
          where: { id: { in: ids }, status: 'AWAITING_DRIVER', driverId: null },
          data: {
            status: 'ACCEPTED',
            driverId,
            statusChangedAt: acceptedAt,
            pickupDeadlineAt,
          },
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
          await this.integrationOutbox.record(tx, id, 'ACCEPTED');
        }

        return tx.delivery.findUniqueOrThrow({ where: { id: deliveryId } });
      });
    } catch (error) {
      if (error instanceof ConflictException) {
        const claimedDuringRace = await this.assignedDeliveryResultById(deliveryId, driverId);
        if (claimedDuringRace) {
          this.ensurePickupExpiryAfterAccepted(claimedDuringRace.deliveryId, driverId);
          return claimedDuringRace;
        }
      }
      throw error;
    }

    await this.zerarSequenciaDeRecusas(driverId);
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
        data: {
          status: 'AWAITING_DRIVER',
          driverId: null,
          pickupDeadlineAt: null,
          statusChangedAt: new Date(),
        },
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
    if (await this.isCompanyBlocked(offer.driverId, delivery.companyId)) {
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
      expiresAtEpochMs: offer.offeredAt.getTime() + settings.dispatchOfferTimeoutSeconds * 1000,
    });
  }

  private async findNextEligibleDriverId({
    excludeDriverIds,
    companyId,
    regionId,
    serviceTypeIds,
    quantidade = 1,
  }: {
    excludeDriverIds: string[];
    companyId: string;
    regionId: string;
    serviceTypeIds: string[];
    /** Quantas entregas serao ofertadas juntas — o lote inteiro precisa caber. */
    quantidade?: number;
  }): Promise<string | null> {
    const busyOffers = await this.prisma.deliveryOffer.findMany({
      where: { response: 'PENDING' },
      select: { driverId: true },
    });
    const busyDriverIds = busyOffers.map((o) => o.driverId);
    // Punido nao recebe oferta nova. Entra pela mesma porta de quem ja tem
    // oferta pendente porque o efeito e o mesmo — ele nao e candidato agora —
    // e porque a punicao nao pode tocar `eligibleDriverWhere`, cujas condicoes
    // descrevem quem PODE atender, e ele continua podendo.
    const punishedDriverIds = await this.punishmentService.punishedDriverIds();
    const excluded = [...new Set([...excludeDriverIds, ...busyDriverIds, ...punishedDriverIds])];

    const presences = await this.prisma.driverPresenceLog.findMany({
      where: {
        wentOfflineAt: null,
        driverId: excluded.length > 0 ? { notIn: excluded } : undefined,
        driver: this.eligibleDriverWhere(regionId, serviceTypeIds, companyId),
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
      if (!(await this.cabeMaisUmaEntrega(driverId, limiteSimultaneo, quantidade))) continue;
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
   * O motoboy ainda cabe mais `quantidade` entregas?
   *
   * Fica FORA do `where` porque o Prisma nao filtra por contagem de relacao:
   * `none` responde "tem alguma?", e o que precisamos e "tem menos que N?".
   * Entao a contagem e feita aqui, no cliente que vier fazer a pergunta.
   *
   * `quantidade` existe por causa do lote. A pergunta certa nunca foi "cabe
   * mais uma?" e sim "cabe o que estou prestes a entregar?": um lote de dez
   * ofertado a quem tem duas de teto tres passava na conta (2 < 3) e o aceite
   * atribuia doze. O teto e do operador, e ele o configurou achando que valia.
   *
   * Recebe o `tx` para poder rodar dentro da transacao que emite a oferta —
   * contar fora dela abriria janela para duas ofertas passarem juntas pelo
   * mesmo teto.
   */
  private async cabeMaisUmaEntrega(
    driverId: string,
    limiteSimultaneo: number | null,
    quantidade = 1,
    tx: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<boolean> {
    if (limiteSimultaneo === null) return true;

    const emAndamento = await tx.delivery.count({
      where: { driverId, status: { in: ASSIGNMENT_BLOCKING_STATUSES } },
    });
    return emAndamento + quantidade <= limiteSimultaneo;
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

  private async isCompanyBlocked(
    driverId: string,
    companyId: string,
    tx: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<boolean> {
    const block = await tx.driverCompanyBlock.findUnique({
      where: { driverId_companyId: { driverId, companyId } },
      select: { id: true },
    });
    return block !== null;
  }

  private async assertCompanyAllowed(
    driverId: string,
    companyIds: string[],
    tx: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<void> {
    const block = await tx.driverCompanyBlock.findFirst({
      where: { driverId, companyId: { in: companyIds } },
      select: { id: true },
    });
    if (block) {
      throw new ForbiddenException('Voce nao pode atender pedidos desta empresa.');
    }
  }

  private eligibleDriverWhere(
    regionId: string,
    serviceTypeIds: string[],
    companyId: string,
  ): Prisma.DriverWhereInput {
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
      companyBlocks: { none: { companyId } },
      AND: serviceTypeIds.map((serviceTypeId) => ({
        serviceTypes: {
          some: { serviceTypeId, serviceType: { active: true } },
        },
      })),
    };
  }
}
