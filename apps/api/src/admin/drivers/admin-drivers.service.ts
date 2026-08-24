import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { ReplaceDriverServiceTypesPayload } from '@motoboycity/validation';
import type {
  Driver,
  DriverAccountStatus,
  DriverApprovalStatus,
  DriverAvailability,
} from '@prisma/client';
import type {
  AdminDriverListItem,
  AdminDriverRegistrationOptions,
  AdminPasswordChangeResult,
  DriverServiceTypeItem,
} from '@motoboycity/types';
import { AuthService } from '../../auth/auth.service';
import { DispatchService } from '../../dispatch/dispatch.service';
import { LiveDriverPresenceService } from '../../live-presence/live-driver-presence.service';
import { PrismaService } from '../../prisma/prisma.service';
import { RealtimeGateway } from '../../realtime/realtime.gateway';

/**
 * As formas vem de `@motoboycity/types` e nao sao redeclaradas aqui.
 *
 * Ate agora havia uma copia local identica a compartilhada, e as duas ficaram
 * iguais so por sorte: bastou acrescentar um campo em uma para a outra ficar
 * para tras. O painel le a compartilhada, entao a copia da API era justamente a
 * que envelheceria sem ninguem notar.
 */
export type { AdminDriverListItem, AdminDriverRegistrationOptions, DriverServiceTypeItem };

export interface DriverReviewResult {
  driverId: string;
  approvalStatus: string;
  reviewedByUserId: string;
  reviewedAt: string;
}

export interface DriverAccountStatusResult {
  driverId: string;
  accountStatus: string;
}

export interface DriverServiceTypesResult {
  driverId: string;
  serviceTypes: DriverServiceTypeItem[];
}

export interface ListDriversFilters {
  approvalStatus?: DriverApprovalStatus;
  accountStatus?: DriverAccountStatus;
}

@Injectable()
export class AdminDriversService {
  private readonly logger = new Logger(AdminDriversService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
    private readonly dispatchService: DispatchService,
    private readonly realtimeGateway: RealtimeGateway,
    private readonly livePresence: LiveDriverPresenceService,
  ) {}

  async registrationOptions(): Promise<AdminDriverRegistrationOptions> {
    const regions = await this.prisma.region.findMany({
      where: { active: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    });
    return { regions };
  }

  /** Consulta interna e reduzida: permite localizar por e-mail, mas nunca o devolve ao modelo. */
  async searchSummary(query: string, limit = 5) {
    return this.prisma.driver.findMany({
      where: query
        ? {
            user: {
              OR: [
                { name: { contains: query, mode: 'insensitive' } },
                { email: { contains: query, mode: 'insensitive' } },
              ],
            },
          }
        : undefined,
      orderBy: [{ accountStatus: 'asc' }, { createdAt: 'desc' }],
      take: limit,
      select: {
        id: true,
        approvalStatus: true,
        accountStatus: true,
        availability: true,
        lastSeenAt: true,
        user: { select: { name: true } },
        serviceTypes: {
          select: { serviceType: { select: { name: true } }, isPrimary: true },
          orderBy: { serviceType: { name: 'asc' } },
        },
      },
    });
  }

  async list(filters: ListDriversFilters): Promise<AdminDriverListItem[]> {
    const drivers = await this.prisma.driver.findMany({
      where: {
        ...(filters.approvalStatus && { approvalStatus: filters.approvalStatus }),
        ...(filters.accountStatus && { accountStatus: filters.accountStatus }),
      },
      orderBy: { createdAt: 'desc' },
      include: {
        user: true,
        region: { select: { id: true, name: true } },
        reviewedBy: true,
        serviceTypes: { include: { serviceType: true }, orderBy: { serviceType: { name: 'asc' } } },
      },
    });

    const devolucoes = await this.countRecentReturns(drivers.map((driver) => driver.userId));
    return drivers.map((driver) =>
      this.toDriverListItem(driver, devolucoes.get(driver.userId) ?? 0),
    );
  }

  /**
   * Quantas devolucoes a fila cada motoboy fez nos ultimos 7 dias.
   *
   * Uma consulta agrupada para a lista inteira, e nao uma por motoboy: sao
   * poucos motoboys hoje, mas a versao ingenua vira N+1 no dia em que nao for.
   *
   * A janela e de 7x24h corridas, nao de sete dias de calendario. Devolucao nao
   * e um numero contabil que precise fechar com o dia da operacao, e a janela
   * corrida dispensa a aritmetica de calendario que ja produziu mes errado aqui.
   */
  private async countRecentReturns(userIds: string[]): Promise<Map<string, number>> {
    if (userIds.length === 0) {
      return new Map();
    }

    const desde = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const grupos = await this.prisma.deliveryStatusHistory.groupBy({
      by: ['changedByUserId'],
      where: {
        changedByUserId: { in: userIds },
        // A assinatura da devolucao: o pedido andou para TRAS, de aceito de
        // volta para a fila. Nenhuma outra transicao faz esse caminho.
        fromStatus: 'ACCEPTED',
        toStatus: 'AWAITING_DRIVER',
        changedAt: { gte: desde },
      },
      _count: { _all: true },
    });

    return new Map(
      grupos
        .filter((grupo) => grupo.changedByUserId !== null)
        .map((grupo) => [grupo.changedByUserId as string, grupo._count._all]),
    );
  }

  async detail(driverId: string): Promise<AdminDriverListItem> {
    const driver = await this.prisma.driver.findUnique({
      where: { id: driverId },
      include: {
        user: true,
        region: { select: { id: true, name: true } },
        reviewedBy: true,
        serviceTypes: { include: { serviceType: true }, orderBy: { serviceType: { name: 'asc' } } },
      },
    });
    if (!driver) {
      throw new NotFoundException('Motoboy n\u00e3o encontrado.');
    }

    const devolucoes = await this.countRecentReturns([driver.userId]);
    return this.toDriverListItem(driver, devolucoes.get(driver.userId) ?? 0);
  }

  private toDriverListItem(
    driver: {
      id: string;
      cpf: string;
      approvalStatus: DriverApprovalStatus;
      accountStatus: DriverAccountStatus;
      availability: DriverAvailability;
      appVersion: string | null;
      lastSeenAt: Date | null;
      createdAt: Date;
      reviewedAt: Date | null;
      user: { name: string; email: string; phone: string };
      region: { id: string; name: string };
      reviewedBy: { id: string; name: string } | null;
      serviceTypes: {
        isPrimary: boolean;
        serviceType: { id: string; code: string; name: string };
      }[];
    },
    returnsLast7Days: number,
  ): AdminDriverListItem {
    return {
      returnsLast7Days,
      id: driver.id,
      name: driver.user.name,
      email: driver.user.email,
      phone: driver.user.phone,
      cpf: driver.cpf,
      region: driver.region,
      approvalStatus: driver.approvalStatus,
      accountStatus: driver.accountStatus,
      availability: driver.availability,
      appVersion: driver.appVersion,
      lastSeenAt: driver.lastSeenAt?.toISOString() ?? null,
      createdAt: driver.createdAt.toISOString(),
      reviewedBy: driver.reviewedBy
        ? { id: driver.reviewedBy.id, name: driver.reviewedBy.name }
        : null,
      reviewedAt: driver.reviewedAt?.toISOString() ?? null,
      serviceTypes: driver.serviceTypes.map((assignment) =>
        this.toServiceTypeItem(assignment.serviceType, assignment.isPrimary),
      ),
    };
  }

  async approve(driverId: string, reviewedByUserId: string): Promise<DriverReviewResult> {
    const driver = await this.findOrThrow(driverId);
    if (driver.approvalStatus !== 'PENDING') {
      throw new ConflictException(
        `Este motoboy não está aguardando aprovação (status atual: ${driver.approvalStatus}).`,
      );
    }
    return this.review(driverId, 'APPROVED', reviewedByUserId);
  }

  async reject(driverId: string, reviewedByUserId: string): Promise<DriverReviewResult> {
    const driver = await this.findOrThrow(driverId);
    if (driver.approvalStatus !== 'PENDING') {
      throw new ConflictException(
        `Este motoboy não está aguardando aprovação (status atual: ${driver.approvalStatus}).`,
      );
    }
    return this.review(driverId, 'REJECTED', reviewedByUserId);
  }

  async suspend(driverId: string): Promise<DriverAccountStatusResult> {
    return this.setAccountStatus(driverId, 'SUSPENDED');
  }

  async block(driverId: string): Promise<DriverAccountStatusResult> {
    return this.setAccountStatus(driverId, 'BLOCKED');
  }

  async reactivate(driverId: string): Promise<DriverAccountStatusResult> {
    return this.setAccountStatus(driverId, 'ACTIVE');
  }

  async changePassword(driverId: string, password: string): Promise<AdminPasswordChangeResult> {
    const driver = await this.prisma.driver.findFirst({
      where: { id: driverId, user: { type: 'DRIVER' } },
      select: { userId: true },
    });
    if (!driver) {
      throw new NotFoundException('Motoboy não encontrado.');
    }

    const wentOfflineAt = new Date();
    const result = await this.authService.replacePassword(driver.userId, password, {
      mutateInSameTransaction: async (tx) => {
        await tx.driver.update({
          where: { id: driverId },
          data: { availability: 'UNAVAILABLE' },
        });
        await tx.driverPresenceLog.updateMany({
          where: { driverId, wentOfflineAt: null },
          data: { wentOfflineAt },
        });
      },
    });
    this.realtimeGateway.disconnectUser(driver.userId);

    const redisCleanup = await this.tryOperationalCleanup('presença Redis', () =>
      this.livePresence.remove(driverId),
    );
    const offerCleanup = await this.tryOperationalCleanup('ofertas pendentes', () =>
      this.dispatchService.releasePendingOffersForDriver(driverId),
    );
    const releasedOffers = offerCleanup.ok ? offerCleanup.value : 0;
    this.realtimeGateway.emitDriverPresence({
      driverId,
      availability: 'UNAVAILABLE',
      at: wentOfflineAt.toISOString(),
      reason: 'PASSWORD_RESET',
    });
    this.realtimeGateway.emitAdminActivity(
      !redisCleanup.ok || !offerCleanup.ok
        ? 'Senha de motoboy redefinida; limpeza externa pendente, com bloqueio seguro no banco.'
        : releasedOffers > 0
          ? `Senha de motoboy redefinida: ${releasedOffers} oferta(s) devolvida(s) para a fila.`
          : 'Senha de motoboy redefinida; sessões e presença encerradas.',
    );
    return result;
  }

  async replaceServiceTypes(
    driverId: string,
    payload: ReplaceDriverServiceTypesPayload,
  ): Promise<DriverServiceTypesResult> {
    return this.prisma.$transaction(async (tx) => {
      const driver = await tx.driver.findUnique({ where: { id: driverId } });
      if (!driver) {
        throw new NotFoundException('Motoboy não encontrado.');
      }

      const serviceTypes = await tx.serviceType.findMany({
        where: { id: { in: payload.serviceTypeIds }, active: true },
      });
      if (serviceTypes.length !== payload.serviceTypeIds.length) {
        throw new ConflictException(
          'Todas as modalidades devem existir e estar ativas para serem atribuídas.',
        );
      }

      const byId = new Map(serviceTypes.map((serviceType) => [serviceType.id, serviceType]));
      const orderedServiceTypes = payload.serviceTypeIds.map((id) => byId.get(id)!);

      await tx.driverServiceType.deleteMany({ where: { driverId } });
      await tx.driverServiceType.createMany({
        data: orderedServiceTypes.map((serviceType, index) => ({
          driverId,
          serviceTypeId: serviceType.id,
          isPrimary: index === 0,
        })),
      });

      return {
        driverId,
        serviceTypes: orderedServiceTypes.map((serviceType, index) =>
          this.toServiceTypeItem(serviceType, index === 0),
        ),
      };
    });
  }

  private async review(
    driverId: string,
    approvalStatus: 'APPROVED' | 'REJECTED',
    reviewedByUserId: string,
  ): Promise<DriverReviewResult> {
    const reviewedAt = new Date();
    const updated = await this.prisma.driver.update({
      where: { id: driverId },
      data: { approvalStatus, reviewedByUserId, reviewedAt },
    });

    return {
      driverId: updated.id,
      approvalStatus: updated.approvalStatus,
      reviewedByUserId,
      reviewedAt: reviewedAt.toISOString(),
    };
  }

  private async setAccountStatus(
    driverId: string,
    accountStatus: DriverAccountStatus,
  ): Promise<DriverAccountStatusResult> {
    const driver = await this.findOrThrow(driverId);

    if (accountStatus !== 'ACTIVE' && driver.approvalStatus !== 'APPROVED') {
      throw new ConflictException('Só é possível suspender ou bloquear um motoboy aprovado.');
    }
    if (driver.accountStatus === accountStatus) {
      throw new ConflictException(`Este motoboy já está com status de conta "${accountStatus}".`);
    }

    // Suspender/bloquear nao pode ser so trocar o enum (P1-03). Antes disto, o motoboy
    // continuava marcado como AVAILABLE com o log de presenca aberto, e as ofertas que ja
    // estavam na mao dele ficavam paradas ate expirar sozinhas — o pedido nao ia pra
    // ninguem durante esse tempo, mesmo com outro motoboy livre. E ele ainda conseguia
    // aceitar, porque o aceite nao olhava accountStatus.
    const deveEncerrarOperacao = accountStatus !== 'ACTIVE';

    const updated = await this.prisma.$transaction(async (tx) => {
      const driverAtualizado = await tx.driver.update({
        where: { id: driverId },
        data: {
          accountStatus,
          // Voltar a ACTIVE nao devolve a disponibilidade: quem decide ficar online e o
          // motoboy, pelo app. Reativar sozinho colocaria alguem para receber corrida sem
          // ele ter escolhido.
          ...(deveEncerrarOperacao && { availability: 'UNAVAILABLE' as const }),
        },
      });

      if (deveEncerrarOperacao) {
        // Mesmo fechamento que ficar offline faz — sem isto a sessao seguiria aberta e o
        // tempo online contaria enquanto ele esta impedido de trabalhar.
        await tx.driverPresenceLog.updateMany({
          where: { driverId, wentOfflineAt: null },
          data: { wentOfflineAt: new Date() },
        });
      }

      return driverAtualizado;
    });

    if (deveEncerrarOperacao) {
      await this.livePresence.remove(driverId);
      const soltas = await this.dispatchService.releasePendingOffersForDriver(driverId);
      this.realtimeGateway.emitToDriver(driverId, 'driver:account-status-changed', {
        accountStatus,
      });
      this.realtimeGateway.emitAdminActivity(
        soltas > 0
          ? `Motoboy ${accountStatus === 'BLOCKED' ? 'bloqueado' : 'suspenso'}: ${soltas} oferta(s) devolvida(s) para a fila.`
          : `Motoboy ${accountStatus === 'BLOCKED' ? 'bloqueado' : 'suspenso'}.`,
      );
    }

    return { driverId: updated.id, accountStatus: updated.accountStatus };
  }

  private async findOrThrow(driverId: string): Promise<Driver> {
    const driver = await this.prisma.driver.findUnique({ where: { id: driverId } });
    if (!driver) {
      throw new NotFoundException('Motoboy não encontrado.');
    }
    return driver;
  }

  private async tryOperationalCleanup<T>(
    label: string,
    operation: () => Promise<T>,
  ): Promise<{ ok: true; value: T } | { ok: false }> {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        return { ok: true, value: await operation() };
      } catch (error) {
        this.logger.warn(
          `Falha ao limpar ${label} após reset de senha (tentativa ${attempt}/3): ${String(error)}`,
        );
      }
    }
    return { ok: false };
  }

  private toServiceTypeItem(
    serviceType: { id: string; code: string; name: string },
    isPrimary: boolean,
  ): DriverServiceTypeItem {
    return { id: serviceType.id, code: serviceType.code, name: serviceType.name, isPrimary };
  }
}
