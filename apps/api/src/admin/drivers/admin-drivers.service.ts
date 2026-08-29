import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type {
  AdminDriverDocumentPayload,
  AdminReviewDriverDocumentPayload,
  AdminUpdateDriverPayload,
  CreateDriverCompanyBlockPayload,
  ReplaceDriverServiceTypesPayload,
} from '@motoboycity/validation';
import {
  Prisma,
  type Driver,
  type DriverAccountStatus,
  type DriverApprovalStatus,
  type DriverAvailability,
} from '@prisma/client';
import type {
  AdminDriverListItem,
  AdminDriverDetail,
  AdminDriverCompanyBlockItem,
  AdminDriverPunishmentItem,
  AdminDriverRegistrationOptions,
  AdminPasswordChangeResult,
  DriverServiceTypeItem,
} from '@motoboycity/types';
import { AuthService } from '../../auth/auth.service';
import { DispatchService } from '../../dispatch/dispatch.service';
import { LiveDriverPresenceService } from '../../live-presence/live-driver-presence.service';
import { PrismaService } from '../../prisma/prisma.service';
import { RealtimeGateway } from '../../realtime/realtime.gateway';
import { ImageKitService } from '../../media/imagekit.service';
import { AdminAuditService } from '../audit/admin-audit.service';
import { DriverPunishmentService } from '../../driver-punishment/driver-punishment.service';

export interface UploadedDriverDocumentFile {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
}

function hasExpectedDocumentSignature(buffer: Buffer, mimetype: string): boolean {
  const startsWith = (signature: number[]) =>
    buffer.length >= signature.length && signature.every((byte, index) => buffer[index] === byte);

  switch (mimetype) {
    case 'image/jpeg':
      return startsWith([0xff, 0xd8, 0xff]);
    case 'image/png':
      return startsWith([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case 'image/webp':
      return (
        buffer.length >= 12 &&
        buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
        buffer.subarray(8, 12).toString('ascii') === 'WEBP'
      );
    case 'application/pdf':
      return buffer.length >= 5 && buffer.subarray(0, 5).toString('ascii') === '%PDF-';
    default:
      return false;
  }
}

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
    private readonly imageKit: ImageKitService,
    private readonly audit: AdminAuditService,
    private readonly punishmentService: DriverPunishmentService,
  ) {}

  /**
   * Libera o motoboy da punicao antes do prazo e VARRE a fila em seguida.
   *
   * A varredura e a metade que faz a liberacao valer alguma coisa. Enquanto ele
   * estava punido, pedidos podem ter ficado em AWAITING_DRIVER sem oferta
   * nenhuma; sem este empurrao eles so voltariam a andar quando algum motoboy
   * ficasse online — que e justamente o que ja aconteceu, so que antes da
   * liberacao.
   */
  async revokePunishment(
    driverId: string,
    punishmentId: string,
    reason: string,
    actorUserId: string,
  ): Promise<AdminDriverPunishmentItem> {
    const liberada = await this.punishmentService.revoke(
      driverId,
      punishmentId,
      reason,
      actorUserId,
    );
    // A punicao ja foi desfeita e registrada. Uma falha na varredura nao pode
    // reverter isso nem devolver erro para quem clicou.
    await this.dispatchService.dispatchAvailableDeliveries().catch(() => undefined);
    return liberada;
  }

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

  async detail(driverId: string): Promise<AdminDriverDetail> {
    const driver = await this.prisma.driver.findUnique({
      where: { id: driverId },
      include: {
        user: true,
        region: { select: { id: true, name: true } },
        reviewedBy: true,
        serviceTypes: { include: { serviceType: true }, orderBy: { serviceType: { name: 'asc' } } },
        documents: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!driver) {
      throw new NotFoundException('Motoboy n\u00e3o encontrado.');
    }

    const devolucoes = await this.countRecentReturns([driver.userId]);
    return {
      ...this.toDriverListItem(driver, devolucoes.get(driver.userId) ?? 0),
      birthDate: driver.birthDate.toISOString().slice(0, 10),
      pixKey: driver.pixKey,
      pixKeyType: driver.pixKeyType,
      hasCnpj: driver.hasCnpj,
      documents: driver.documents.map((document) => ({
        id: document.id,
        type: document.type,
        url: document.url,
        reviewStatus: document.reviewStatus,
        rgIssuer: document.rgIssuer,
        cnhNumber: document.cnhNumber,
        cnhExpiresAt: document.cnhExpiresAt?.toISOString().slice(0, 10) ?? null,
        cnhIsPaidActivity: document.cnhIsPaidActivity,
        createdAt: document.createdAt.toISOString(),
      })),
    };
  }

  async listCompanyBlocks(driverId: string): Promise<AdminDriverCompanyBlockItem[]> {
    const driver = await this.prisma.driver.findUnique({
      where: { id: driverId },
      select: { id: true },
    });
    if (!driver) throw new NotFoundException('Motoboy nao encontrado.');

    const blocks = await this.prisma.driverCompanyBlock.findMany({
      where: { driverId },
      orderBy: { blockedAt: 'desc' },
      include: { company: { select: { id: true, tradeName: true } } },
    });
    return blocks.map((block) => this.toCompanyBlockItem(block));
  }

  async blockCompany(
    driverId: string,
    payload: CreateDriverCompanyBlockPayload,
    actorUserId: string,
  ): Promise<AdminDriverCompanyBlockItem> {
    const block = await this.prisma.$transaction(async (tx) => {
      const driver = await tx.driver.findUnique({ where: { id: driverId }, select: { id: true } });
      if (!driver) throw new NotFoundException('Motoboy nao encontrado.');

      // Serializa com a criacao de oferta e a reatribuicao manual. Assim a
      // operacao que obtiver o lock primeiro define se o pedido ainda e novo
      // (bloqueado) ou ja virou uma entrega em andamento (preservada).
      await tx.$queryRaw<Array<{ id: string }>>(
        Prisma.sql`SELECT "id" FROM "drivers" WHERE "id" = ${driverId} FOR UPDATE`,
      );

      const [company, existing] = await Promise.all([
        tx.company.findUnique({
          where: { id: payload.companyId },
          select: { id: true, tradeName: true },
        }),
        tx.driverCompanyBlock.findUnique({
          where: { driverId_companyId: { driverId, companyId: payload.companyId } },
          select: { id: true },
        }),
      ]);
      if (!company) throw new NotFoundException('Empresa nao encontrada.');
      if (existing) {
        throw new ConflictException('Este motoboy ja esta bloqueado para esta empresa.');
      }

      const created = await tx.driverCompanyBlock.create({
        data: { driverId, companyId: payload.companyId, reason: payload.reason },
        include: { company: { select: { id: true, tradeName: true } } },
      });
      await this.audit.record(
        {
          actorUserId,
          action: 'DRIVER_COMPANY_BLOCKED',
          entityType: 'DRIVER',
          entityId: driverId,
          summary: `Motoboy impedido de atender a empresa ${company.tradeName}. Motivo: ${payload.reason}`,
          metadata: { companyId: company.id },
        },
        tx,
      );
      return created;
    });

    // A restricao ja esta persistida. Mesmo que a limpeza externa falhe, os
    // guards de aceite abaixo impedem que uma oferta antiga seja assumida.
    await this.dispatchService
      .releasePendingOffersForDriver(driverId, payload.companyId)
      .catch((error: unknown) =>
        this.logger.warn(`Falha ao soltar oferta da empresa bloqueada: ${String(error)}`),
      );
    return this.toCompanyBlockItem(block);
  }

  async unblockCompany(
    driverId: string,
    companyId: string,
    actorUserId: string,
  ): Promise<{ driverId: string; companyId: string; blocked: false }> {
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw<Array<{ id: string }>>(
        Prisma.sql`SELECT "id" FROM "drivers" WHERE "id" = ${driverId} FOR UPDATE`,
      );
      const block = await tx.driverCompanyBlock.findUnique({
        where: { driverId_companyId: { driverId, companyId } },
        include: { company: { select: { tradeName: true } } },
      });
      if (!block) throw new NotFoundException('Bloqueio entre motoboy e empresa nao encontrado.');

      await tx.driverCompanyBlock.delete({ where: { id: block.id } });
      await this.audit.record(
        {
          actorUserId,
          action: 'DRIVER_COMPANY_UNBLOCKED',
          entityType: 'DRIVER',
          entityId: driverId,
          summary: `Motoboy liberado para atender a empresa ${block.company.tradeName}.`,
          metadata: { companyId },
        },
        tx,
      );
    });

    // Pode haver pedido parado justamente porque este era o unico motoboy
    // elegivel. A varredura faz a liberacao surtir efeito imediatamente.
    await this.dispatchService.dispatchAvailableDeliveries().catch(() => undefined);
    return { driverId, companyId, blocked: false };
  }

  async update(
    driverId: string,
    payload: AdminUpdateDriverPayload,
    actorUserId: string,
  ): Promise<AdminDriverDetail> {
    await this.prisma.$transaction(async (tx) => {
      const driver = await tx.driver.findUnique({
        where: { id: driverId },
        select: { userId: true },
      });
      if (!driver) throw new NotFoundException('Motoboy nao encontrado.');
      const [region, emailOwner, cpfOwner] = await Promise.all([
        tx.region.findFirst({
          where: { id: payload.regionId, active: true },
          select: { id: true },
        }),
        tx.user.findFirst({
          where: { email: payload.email, id: { not: driver.userId } },
          select: { id: true },
        }),
        tx.driver.findFirst({
          where: { cpf: payload.cpf, id: { not: driverId } },
          select: { id: true },
        }),
      ]);
      if (!region) throw new ConflictException('A regiao selecionada nao existe ou esta inativa.');
      if (emailOwner) throw new ConflictException('Este e-mail ja esta em uso.');
      if (cpfOwner) throw new ConflictException('Este CPF ja pertence a outro motoboy.');
      await tx.user.update({
        where: { id: driver.userId },
        data: { name: payload.name, email: payload.email, phone: payload.phone },
      });
      await tx.driver.update({
        where: { id: driverId },
        data: {
          cpf: payload.cpf,
          birthDate: new Date(`${payload.birthDate}T00:00:00.000Z`),
          pixKey: payload.pixKey,
          pixKeyType: payload.pixKeyType,
          hasCnpj: payload.hasCnpj,
          regionId: payload.regionId,
        },
      });
      await this.audit.record(
        {
          actorUserId,
          action: 'DRIVER_UPDATED',
          entityType: 'DRIVER',
          entityId: driverId,
          summary: `Cadastro do motoboy ${payload.name} atualizado.`,
        },
        tx,
      );
    });
    return this.detail(driverId);
  }

  async uploadDocument(
    driverId: string,
    payload: AdminDriverDocumentPayload,
    file: UploadedDriverDocumentFile,
    actorUserId: string,
  ): Promise<AdminDriverDetail> {
    const extensionByMime: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
      'application/pdf': 'pdf',
    };
    const extension = extensionByMime[file.mimetype];
    if (!extension) throw new ConflictException('Envie JPG, PNG, WEBP ou PDF.');
    if (!hasExpectedDocumentSignature(file.buffer, file.mimetype)) {
      throw new ConflictException('O conteudo do arquivo nao corresponde ao formato informado.');
    }
    const driver = await this.prisma.driver.findUnique({
      where: { id: driverId },
      select: { id: true },
    });
    if (!driver) throw new NotFoundException('Motoboy nao encontrado.');
    const uploaded = await this.imageKit.uploadDriverDocument({
      driverId,
      buffer: file.buffer,
      extension,
      type: payload.type,
    });
    try {
      await this.prisma.$transaction(async (tx) => {
        const document = await tx.driverDocument.create({
          data: {
            driverId,
            type: payload.type,
            externalFileId: uploaded.externalFileId,
            url: uploaded.url,
            rgIssuer: payload.rgIssuer || null,
            cnhNumber: payload.cnhNumber || null,
            cnhExpiresAt: payload.cnhExpiresAt
              ? new Date(`${payload.cnhExpiresAt}T00:00:00.000Z`)
              : null,
            cnhIsPaidActivity: payload.cnhIsPaidActivity ?? null,
          },
        });
        await this.audit.record(
          {
            actorUserId,
            action: 'DRIVER_DOCUMENT_UPLOADED',
            entityType: 'DRIVER_DOCUMENT',
            entityId: document.id,
            summary: `Documento ${payload.type} adicionado ao cadastro do motoboy.`,
          },
          tx,
        );
      });
    } catch (error) {
      await this.imageKit.delete(uploaded.externalFileId).catch(() => undefined);
      throw error;
    }
    return this.detail(driverId);
  }

  async reviewDocument(
    driverId: string,
    documentId: string,
    payload: AdminReviewDriverDocumentPayload,
    actorUserId: string,
  ): Promise<AdminDriverDetail> {
    await this.prisma.$transaction(async (tx) => {
      const [document, admin] = await Promise.all([
        tx.driverDocument.findFirst({ where: { id: documentId, driverId }, select: { id: true } }),
        tx.adminUser.findUnique({ where: { userId: actorUserId }, select: { id: true } }),
      ]);
      if (!document) throw new NotFoundException('Documento nao encontrado para este motoboy.');
      if (!admin) throw new ConflictException('Perfil administrativo nao encontrado.');
      await tx.driverDocument.update({
        where: { id: documentId },
        data: { reviewStatus: payload.reviewStatus, reviewedByAdminUserId: admin.id },
      });
      await this.audit.record(
        {
          actorUserId,
          action:
            payload.reviewStatus === 'APPROVED'
              ? 'DRIVER_DOCUMENT_APPROVED'
              : 'DRIVER_DOCUMENT_REJECTED',
          entityType: 'DRIVER_DOCUMENT',
          entityId: documentId,
          summary: `Documento do motoboy ${payload.reviewStatus === 'APPROVED' ? 'aprovado' : 'rejeitado'}.`,
        },
        tx,
      );
    });
    return this.detail(driverId);
  }

  async deleteDocument(
    driverId: string,
    documentId: string,
    actorUserId: string,
  ): Promise<AdminDriverDetail> {
    let externalFileId = '';
    await this.prisma.$transaction(async (tx) => {
      const document = await tx.driverDocument.findFirst({
        where: { id: documentId, driverId },
        select: { id: true, externalFileId: true, type: true },
      });
      if (!document) throw new NotFoundException('Documento nao encontrado para este motoboy.');
      externalFileId = document.externalFileId;
      await tx.driverDocument.delete({ where: { id: documentId } });
      await this.audit.record(
        {
          actorUserId,
          action: 'DRIVER_DOCUMENT_REMOVED',
          entityType: 'DRIVER_DOCUMENT',
          entityId: documentId,
          summary: `Documento ${document.type} removido do cadastro do motoboy.`,
        },
        tx,
      );
    });
    await this.imageKit
      .delete(externalFileId)
      .catch((error) =>
        this.logger.warn(
          `Documento removido do banco, mas o arquivo nao saiu do ImageKit: ${String(error)}`,
        ),
      );
    return this.detail(driverId);
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

  async suspend(driverId: string, actorUserId: string): Promise<DriverAccountStatusResult> {
    return this.setAccountStatus(driverId, 'SUSPENDED', actorUserId);
  }

  async block(driverId: string, actorUserId: string): Promise<DriverAccountStatusResult> {
    return this.setAccountStatus(driverId, 'BLOCKED', actorUserId);
  }

  async reactivate(driverId: string, actorUserId: string): Promise<DriverAccountStatusResult> {
    return this.setAccountStatus(driverId, 'ACTIVE', actorUserId);
  }

  async changePassword(
    driverId: string,
    password: string,
    actorUserId: string,
  ): Promise<AdminPasswordChangeResult> {
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
        await this.audit.record(
          {
            actorUserId,
            action: 'DRIVER_PASSWORD_RESET',
            entityType: 'DRIVER',
            entityId: driverId,
            summary: 'Senha de acesso do entregador redefinida.',
          },
          tx,
        );
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
    actorUserId: string,
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
      await this.audit.record(
        {
          actorUserId,
          action: 'DRIVER_SERVICE_TYPES_UPDATED',
          entityType: 'DRIVER',
          entityId: driverId,
          summary: `Modalidades do entregador atualizadas (${orderedServiceTypes.length}).`,
        },
        tx,
      );

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
    const updated = await this.prisma.$transaction(async (tx) => {
      const driverUpdated = await tx.driver.update({
        where: { id: driverId },
        data: { approvalStatus, reviewedByUserId, reviewedAt },
      });
      await this.audit.record(
        {
          actorUserId: reviewedByUserId,
          action: approvalStatus === 'APPROVED' ? 'DRIVER_APPROVED' : 'DRIVER_REJECTED',
          entityType: 'DRIVER',
          entityId: driverId,
          summary: `Cadastro do entregador ${approvalStatus === 'APPROVED' ? 'aprovado' : 'rejeitado'}.`,
        },
        tx,
      );
      return driverUpdated;
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
    actorUserId: string,
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

      await this.audit.record(
        {
          actorUserId,
          action: `DRIVER_${accountStatus}`,
          entityType: 'DRIVER',
          entityId: driverId,
          summary: `Status da conta do entregador alterado para ${accountStatus}.`,
        },
        tx,
      );

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

  private toCompanyBlockItem(block: {
    id: string;
    driverId: string;
    reason: string;
    blockedAt: Date;
    company: { id: string; tradeName: string };
  }): AdminDriverCompanyBlockItem {
    return {
      id: block.id,
      driverId: block.driverId,
      company: block.company,
      reason: block.reason,
      blockedAt: block.blockedAt.toISOString(),
    };
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
