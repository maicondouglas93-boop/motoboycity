import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma, type DeliveryStatus, type DriverPunishment } from '@prisma/client';
import type { AdminDriverPunishmentItem, DriverPunishmentStatus } from '@motoboycity/types';
import { AdminPlatformSettingsService } from '../admin/platform-settings/admin-platform-settings.service';
import { AdminAuditService } from '../admin/audit/admin-audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';

/**
 * Status em que o motoboy ainda tem trabalho em maos. Repetido de
 * `dispatch.service.ts` de proposito: importar de la criaria um ciclo entre os
 * dois modulos, e esta lista responde outra pergunta — "ele esta na rua agora?"
 * — que pode divergir da regra de capacidade sem quebrar nenhuma das duas.
 */
const ENTREGA_EM_ANDAMENTO: DeliveryStatus[] = ['ACCEPTED', 'COLLECTED', 'DELIVERED', 'FAILED'];

export type RefusalKind = 'DECLINED' | 'EXPIRED';

type PunishmentWithRelations = Prisma.DriverPunishmentGetPayload<{
  include: {
    delivery: { select: { id: true; displayNumber: true } };
    revokedBy: { select: { id: true; name: true } };
  };
}>;

/**
 * Punicao automatica do motoboy que recusa ou deixa expirar ofertas seguidas.
 *
 * Fica FORA de `DispatchService` por uma razao concreta: o despacho e o unico
 * lugar do sistema onde uma regra errada para a operacao inteira, e ele ja tem
 * 1600 linhas. Aqui a regra pode ser lida, testada e desligada sozinha.
 *
 * O servico nao conhece BullMQ. Quem agenda o job que acorda o despacho no fim
 * do castigo e o proprio `DispatchService`, que ja e dono dessa fila.
 */
@Injectable()
export class DriverPunishmentService {
  private readonly logger = new Logger(DriverPunishmentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly platformSettingsService: AdminPlatformSettingsService,
    private readonly realtimeGateway: RealtimeGateway,
    private readonly audit: AdminAuditService,
  ) {}

  /**
   * Motoboys que estao cumprindo punicao agora.
   *
   * Devolve IDs em vez de um `where` do Prisma porque o despacho seleciona
   * candidatos por `DriverPresenceLog`, e um `none` aninhado ali com data
   * relativa produz um plano pior do que um `notIn` de uma lista curta — a
   * lista de punidos e naturalmente pequena.
   */
  async punishedDriverIds(agora: Date = new Date()): Promise<string[]> {
    const ativas = await this.prisma.driverPunishment.findMany({
      where: { expiresAt: { gt: agora }, revokedAt: null },
      select: { driverId: true },
    });
    return [...new Set(ativas.map((punicao) => punicao.driverId))];
  }

  /** A punicao em vigor de um motoboy, ou `null`. */
  async activeFor(
    driverId: string,
    agora: Date = new Date(),
  ): Promise<DriverPunishmentStatus | null> {
    const punicao = await this.prisma.driverPunishment.findFirst({
      where: { driverId, expiresAt: { gt: agora }, revokedAt: null },
      orderBy: { expiresAt: 'desc' },
    });
    return punicao ? this.toStatus(punicao) : null;
  }

  /**
   * O motoboy aceitou trabalho: a sequencia de recusas recomeca do zero.
   *
   * A escrita e condicional para nao sujar o caminho quente do aceite — no caso
   * normal, com o contador ja em zero, nenhuma linha e tocada.
   */
  async registerAcceptance(driverId: string): Promise<void> {
    await this.prisma.driver.updateMany({
      where: { id: driverId, consecutiveOfferRefusals: { gt: 0 } },
      data: { consecutiveOfferRefusals: 0 },
    });
  }

  /**
   * Registra uma recusa ou expiracao e aplica a punicao se ela fechar a conta.
   *
   * Devolve a punicao criada, ou `null` quando nada foi aplicado — inclusive
   * quando a regra esta desligada, quando o gatilho nao cobre este tipo de
   * resposta ou quando uma das excecoes configuradas se aplica.
   *
   * NAO deve ser chamado quando a oferta deixou de valer por decisao de outra
   * pessoa: pedido cancelado pela loja e oferta devolvida por bloqueio
   * administrativo gravam o mesmo `EXPIRED`, e punir por isso seria cobrar do
   * motoboy uma desistencia que nao foi dele.
   */
  async registerRefusal(input: {
    driverId: string;
    deliveryId: string;
    kind: RefusalKind;
  }): Promise<DriverPunishment | null> {
    const settings = await this.platformSettingsService.get();
    if (!settings.driverPunishmentEnabled) return null;
    if (!this.gatilhoCobre(settings.driverPunishmentTrigger, input.kind)) return null;

    const quantidade = settings.driverPunishmentOfferCount;
    const minutos = settings.driverPunishmentMinutes;
    if (quantidade === null || minutos === null) {
      // Ligada sem numeros nao pune ninguem, mas tambem nao pode ficar muda: a
      // tela mostra a regra como ativa e alguem espera que ela esteja valendo.
      this.logger.warn(
        'Punicao de entregadores ligada sem quantidade ou tempo configurado — nada foi aplicado.',
      );
      return null;
    }

    if (settings.driverPunishmentIgnoreWithActiveDelivery) {
      const emAndamento = await this.prisma.delivery.count({
        where: { driverId: input.driverId, status: { in: ENTREGA_EM_ANDAMENTO } },
      });
      if (emAndamento > 0) return null;
    }

    if (settings.driverPunishmentOncePerDelivery) {
      const jaPunidoPeloPedido = await this.prisma.driverPunishment.findFirst({
        where: { driverId: input.driverId, deliveryId: input.deliveryId },
        select: { id: true },
      });
      // Nao conta nem pune: o mesmo pedido nao pode empurrar a contagem duas
      // vezes so por ter voltado a fila e chegado de novo no mesmo motoboy.
      if (jaPunidoPeloPedido) return null;
    }

    const agora = new Date();
    const jaPunido = await this.prisma.driverPunishment.findFirst({
      where: { driverId: input.driverId, expiresAt: { gt: agora }, revokedAt: null },
      select: { id: true },
    });
    // Ele nao deveria estar recebendo oferta durante a punicao; se uma resposta
    // atrasada chegar assim mesmo, ela nao pode empilhar um segundo castigo.
    if (jaPunido) return null;

    const driver = await this.prisma.driver.update({
      where: { id: input.driverId },
      data: { consecutiveOfferRefusals: { increment: 1 } },
      select: { consecutiveOfferRefusals: true },
    });
    if (driver.consecutiveOfferRefusals < quantidade) return null;

    const expiresAt = new Date(agora.getTime() + minutos * 60_000);
    const punicao = await this.prisma.$transaction(async (tx) => {
      const criada = await tx.driverPunishment.create({
        data: {
          driverId: input.driverId,
          deliveryId: input.deliveryId,
          reason: input.kind === 'DECLINED' ? 'DECLINED_OFFER' : 'EXPIRED_OFFER',
          offerCount: driver.consecutiveOfferRefusals,
          minutes: minutos,
          appliedAt: agora,
          expiresAt,
        },
      });
      // Cumprido o castigo, ele volta com a ficha limpa. Sem este zero, a
      // proxima recusa puniria de novo na hora, sem nova sequencia nenhuma.
      await tx.driver.update({
        where: { id: input.driverId },
        data: { consecutiveOfferRefusals: 0 },
      });
      return criada;
    });

    this.realtimeGateway.emitToDriver(input.driverId, 'driver:punishment-applied', {
      ...this.toStatus(punicao),
    });
    this.realtimeGateway.emitAdminActivity(
      `Motoboy fora do despacho por ${minutos} min apos ${punicao.offerCount} ` +
        `${punicao.offerCount === 1 ? 'oferta recusada' : 'ofertas recusadas'}.`,
    );
    return punicao;
  }

  async listForDriver(driverId: string): Promise<AdminDriverPunishmentItem[]> {
    const driver = await this.prisma.driver.findUnique({
      where: { id: driverId },
      select: { id: true },
    });
    if (!driver) {
      throw new NotFoundException('Motoboy não encontrado.');
    }

    const punicoes = await this.prisma.driverPunishment.findMany({
      where: { driverId },
      orderBy: { appliedAt: 'desc' },
      take: 20,
      include: {
        delivery: { select: { id: true, displayNumber: true } },
        revokedBy: { select: { id: true, name: true } },
      },
    });
    const agora = new Date();
    return punicoes.map((punicao) => this.toAdminItem(punicao, agora));
  }

  /**
   * Liberacao manual antes do prazo.
   *
   * A atualizacao e condicional (`revokedAt: null`) para dois administradores
   * clicando junto nao gerarem dois registros de liberacao para a mesma
   * punicao — o segundo recebe o conflito em vez de sobrescrever o primeiro.
   */
  async revoke(
    driverId: string,
    punishmentId: string,
    reason: string,
    actorUserId: string,
  ): Promise<AdminDriverPunishmentItem> {
    const punicao = await this.prisma.driverPunishment.findUnique({
      where: { id: punishmentId },
    });
    if (!punicao || punicao.driverId !== driverId) {
      throw new NotFoundException('Punição não encontrada para este motoboy.');
    }
    if (punicao.revokedAt) {
      throw new ConflictException('Esta punição já foi liberada.');
    }

    const agora = new Date();
    const atualizada = await this.prisma.$transaction(async (tx) => {
      const alterada = await tx.driverPunishment.updateMany({
        where: { id: punishmentId, revokedAt: null },
        data: { revokedAt: agora, revokedByUserId: actorUserId, revokedReason: reason },
      });
      if (alterada.count === 0) {
        throw new ConflictException('Esta punição já foi liberada.');
      }
      await this.audit.record(
        {
          actorUserId,
          action: 'DRIVER_PUNISHMENT_REVOKED',
          entityType: 'DRIVER',
          entityId: driverId,
          summary: `Punição do entregador liberada antes do prazo: ${reason}`,
          metadata: { punishmentId, expiresAt: punicao.expiresAt.toISOString() },
        },
        tx,
      );
      return tx.driverPunishment.findUniqueOrThrow({
        where: { id: punishmentId },
        include: {
          delivery: { select: { id: true, displayNumber: true } },
          revokedBy: { select: { id: true, name: true } },
        },
      });
    });

    // Só avisa se o prazo ainda estava correndo: liberar uma punição que já
    // tinha vencido é arrumação de histórico, não uma mudança para o motoboy.
    if (punicao.expiresAt > agora) {
      this.realtimeGateway.emitToDriver(driverId, 'driver:punishment-lifted', {
        punishmentId,
      });
    }
    return this.toAdminItem(atualizada, agora);
  }

  private gatilhoCobre(
    trigger: 'DECLINED' | 'EXPIRED' | 'DECLINED_OR_EXPIRED',
    kind: RefusalKind,
  ): boolean {
    return trigger === 'DECLINED_OR_EXPIRED' || trigger === kind;
  }

  private toStatus(punicao: DriverPunishment): DriverPunishmentStatus {
    return {
      reason: punicao.reason,
      offerCount: punicao.offerCount,
      minutes: punicao.minutes,
      appliedAt: punicao.appliedAt.toISOString(),
      expiresAt: punicao.expiresAt.toISOString(),
    };
  }

  private toAdminItem(punicao: PunishmentWithRelations, agora: Date): AdminDriverPunishmentItem {
    return {
      id: punicao.id,
      reason: punicao.reason,
      offerCount: punicao.offerCount,
      minutes: punicao.minutes,
      appliedAt: punicao.appliedAt.toISOString(),
      expiresAt: punicao.expiresAt.toISOString(),
      active: punicao.revokedAt === null && punicao.expiresAt > agora,
      delivery: punicao.delivery
        ? { id: punicao.delivery.id, displayNumber: punicao.delivery.displayNumber }
        : null,
      revokedAt: punicao.revokedAt ? punicao.revokedAt.toISOString() : null,
      revokedBy: punicao.revokedBy
        ? { id: punicao.revokedBy.id, name: punicao.revokedBy.name }
        : null,
      revokedReason: punicao.revokedReason,
    };
  }
}
