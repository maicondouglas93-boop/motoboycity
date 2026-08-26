import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  AdminCompanyRegistrationOptions,
  AdminPasswordChangeResult,
} from '@motoboycity/types';
import type {
  AdminCompanyAddressPayload,
  AdminCreateCompanyMemberPayload,
  AdminUpdateCompanyMemberPayload,
  AdminUpdateCompanyPayload,
  AdminUpdateCompanyBillingSettingsPayload,
  UpdateCompanyProfilePayload,
  UpsertCompanyAddressPayload,
} from '@motoboycity/validation';
import { Prisma, type CompanyStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { AuthService } from '../../auth/auth.service';
import { PrismaService } from '../../prisma/prisma.service';
import { RealtimeGateway } from '../../realtime/realtime.gateway';
import { AdminAuditService } from '../audit/admin-audit.service';

const PASSWORD_HASH_ROUNDS = 10;

export interface ApproveCompanyResult {
  companyId: string;
  status: string;
  approvedByUserId: string;
  approvedAt: string;
}

export interface AdminCompanyListItem {
  id: string;
  legalName: string;
  tradeName: string;
  document: string;
  status: string;
  createdAt: string;
  owner: { name: string; email: string; phone: string } | null;
  approvedBy: { id: string; name: string } | null;
  approvedAt: string | null;
}

export interface AdminCompanyDetail extends AdminCompanyListItem {
  region: { id: string; name: string };
  billingSettings: {
    invoiceClosingMode: 'AUTOMATIC' | 'MANUAL';
    invoiceClosingFrequency: 'WEEKLY' | 'MONTHLY' | null;
    invoiceClosingWeekday: number | null;
    invoiceClosingMonthDay: number | null;
    invoiceOverdueBlockAfterDays: number | null;
    lastAutomaticInvoiceClosingDate: string | null;
    invoiceOverdueBlockedAt: string | null;
  };
  addresses: Array<{
    id: string;
    label: string | null;
    street: string;
    number: string;
    complement: string | null;
    city: string;
    state: string;
    zip: string;
    lat: number | null;
    lng: number | null;
    isPrimary: boolean;
    createdAt: string;
  }>;
  teamMembers: Array<{
    id: string;
    role: 'OWNER' | 'OPERATOR';
    active: boolean;
    joinedAt: string;
    user: { id: string; name: string; email: string; phone: string };
  }>;
}

@Injectable()
export class AdminCompaniesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
    private readonly realtimeGateway: RealtimeGateway,
    private readonly audit: AdminAuditService,
  ) {}

  async registrationOptions(): Promise<AdminCompanyRegistrationOptions> {
    const regions = await this.prisma.region.findMany({
      where: { active: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    });
    return { regions };
  }

  /** Consulta interna e reduzida para consumidores administrativos, sem dados do responsavel. */
  async searchSummary(query: string, limit = 5) {
    return this.prisma.company.findMany({
      where: query
        ? {
            OR: [
              { tradeName: { contains: query, mode: 'insensitive' } },
              { legalName: { contains: query, mode: 'insensitive' } },
            ],
          }
        : undefined,
      orderBy: [{ status: 'asc' }, { tradeName: 'asc' }],
      take: limit,
      select: {
        id: true,
        tradeName: true,
        legalName: true,
        status: true,
        createdAt: true,
        _count: { select: { deliveries: true } },
      },
    });
  }

  async list(status?: CompanyStatus): Promise<AdminCompanyListItem[]> {
    const companies = await this.prisma.company.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: 'desc' },
      include: {
        teamMembers: {
          where: { role: 'OWNER' },
          include: { user: true },
          take: 1,
        },
        approvedBy: true,
      },
    });

    return companies.map((company) => this.toListItem(company));
  }

  async detail(companyId: string): Promise<AdminCompanyDetail> {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      include: {
        region: { select: { id: true, name: true } },
        teamMembers: {
          include: { user: { select: { id: true, name: true, email: true, phone: true } } },
          orderBy: [{ active: 'desc' }, { joinedAt: 'asc' }],
        },
        addresses: { orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }] },
        approvedBy: { select: { id: true, name: true } },
      },
    });
    if (!company) {
      throw new NotFoundException('Empresa nao encontrada.');
    }

    return {
      ...this.toListItem(company),
      region: company.region,
      billingSettings: {
        invoiceClosingMode: company.invoiceClosingMode,
        invoiceClosingFrequency: company.invoiceClosingFrequency,
        invoiceClosingWeekday: company.invoiceClosingWeekday,
        invoiceClosingMonthDay: company.invoiceClosingMonthDay,
        invoiceOverdueBlockAfterDays: company.invoiceOverdueBlockAfterDays,
        lastAutomaticInvoiceClosingDate:
          company.lastAutomaticInvoiceClosingDate?.toISOString().slice(0, 10) ?? null,
        invoiceOverdueBlockedAt: company.invoiceOverdueBlockedAt?.toISOString() ?? null,
      },
      addresses: company.addresses.map((address) => ({
        id: address.id,
        label: address.label,
        street: address.street,
        number: address.number,
        complement: address.complement,
        city: address.city,
        state: address.state,
        zip: address.zip,
        lat: address.lat === null ? null : Number(address.lat),
        lng: address.lng === null ? null : Number(address.lng),
        isPrimary: address.isPrimary,
        createdAt: address.createdAt.toISOString(),
      })),
      teamMembers: company.teamMembers.map((member) => ({
        id: member.id,
        role: member.role,
        active: member.active,
        joinedAt: member.joinedAt.toISOString(),
        user: member.user,
      })),
    };
  }

  async approve(companyId: string, approvedByUserId: string): Promise<ApproveCompanyResult> {
    const company = await this.prisma.company.findUnique({ where: { id: companyId } });
    if (!company) {
      throw new NotFoundException('Empresa não encontrada.');
    }

    if (company.status !== 'PENDING_APPROVAL') {
      throw new ConflictException(
        `Esta empresa não está aguardando aprovação (status atual: ${company.status}).`,
      );
    }

    const approvedAt = new Date();
    const updated = await this.prisma.$transaction(async (tx) => {
      const companyUpdated = await tx.company.update({
        where: { id: companyId },
        data: { status: 'ACTIVE', approvedByUserId, approvedAt },
      });
      await this.audit.record(
        {
          actorUserId: approvedByUserId,
          action: 'COMPANY_APPROVED',
          entityType: 'COMPANY',
          entityId: companyId,
          summary: 'Empresa aprovada e liberada para operar.',
        },
        tx,
      );
      await tx.companyStatusHistory.create({
        data: {
          companyId,
          fromStatus: 'PENDING_APPROVAL',
          toStatus: 'ACTIVE',
          changedByUserId: approvedByUserId,
          note: 'Empresa aprovada e liberada para operar.',
        },
      });
      return companyUpdated;
    });

    return {
      companyId: updated.id,
      status: updated.status,
      approvedByUserId,
      approvedAt: approvedAt.toISOString(),
    };
  }

  async updateProfile(
    companyId: string,
    payload: UpdateCompanyProfilePayload,
    actorUserId: string,
  ): Promise<AdminCompanyDetail> {
    await this.prisma.$transaction(async (tx) => {
      const company = await tx.company.findUnique({
        where: { id: companyId },
        select: { id: true },
      });
      if (!company) {
        throw new NotFoundException('Empresa nao encontrada.');
      }

      const owner = await tx.companyTeamMember.findFirst({
        where: {
          companyId,
          active: true,
          role: 'OWNER',
          user: { type: 'COMPANY_MEMBER' },
        },
        orderBy: { joinedAt: 'asc' },
        select: { userId: true },
      });
      if (!owner) {
        throw new ConflictException(
          'A empresa nao possui um responsavel ativo para receber a atualizacao.',
        );
      }

      await tx.company.update({
        where: { id: companyId },
        data: { tradeName: payload.tradeName, legalName: payload.legalName },
      });
      await tx.user.update({
        where: { id: owner.userId },
        data: { name: payload.fullName, phone: payload.whatsapp },
      });
      await this.audit.record(
        {
          actorUserId,
          action: 'COMPANY_PROFILE_UPDATED',
          entityType: 'COMPANY',
          entityId: companyId,
          summary: `Cadastro comercial e responsavel principal da empresa ${payload.tradeName} atualizados.`,
        },
        tx,
      );
    });

    return this.detail(companyId);
  }

  async upsertPrimaryAddress(
    companyId: string,
    payload: UpsertCompanyAddressPayload,
    actorUserId: string,
  ): Promise<AdminCompanyDetail> {
    await this.prisma.$transaction(async (tx) => {
      const company = await tx.company.findUnique({
        where: { id: companyId },
        select: { id: true },
      });
      if (!company) {
        throw new NotFoundException('Empresa nao encontrada.');
      }

      const existing = await tx.companyAddress.findFirst({
        where: { companyId, isPrimary: true },
        orderBy: { createdAt: 'asc' },
        select: { id: true },
      });
      const addressData = {
        ...payload,
        label: payload.label || null,
        complement: payload.complement || null,
        lat: payload.lat ?? null,
        lng: payload.lng ?? null,
        isPrimary: true,
      };

      if (existing) {
        await tx.companyAddress.update({ where: { id: existing.id }, data: addressData });
        await tx.companyAddress.updateMany({
          where: { companyId, isPrimary: true, id: { not: existing.id } },
          data: { isPrimary: false },
        });
      } else {
        await tx.companyAddress.create({ data: { ...addressData, companyId } });
      }
      await this.audit.record(
        {
          actorUserId,
          action: 'COMPANY_PRIMARY_ADDRESS_UPDATED',
          entityType: 'COMPANY_ADDRESS',
          entityId: companyId,
          summary: `Endereco principal da empresa atualizado para ${payload.street}, ${payload.number}.`,
        },
        tx,
      );
    });

    return this.detail(companyId);
  }

  suspend(companyId: string, actorUserId: string): Promise<AdminCompanyDetail> {
    return this.setStatus(companyId, 'ACTIVE', 'SUSPENDED', actorUserId);
  }

  reactivate(companyId: string, actorUserId: string): Promise<AdminCompanyDetail> {
    return this.setStatus(companyId, 'SUSPENDED', 'ACTIVE', actorUserId);
  }

  private async setStatus(
    companyId: string,
    expectedStatus: CompanyStatus,
    nextStatus: CompanyStatus,
    actorUserId: string,
  ): Promise<AdminCompanyDetail> {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: {
        status: true,
        teamMembers: { where: { active: true }, select: { userId: true } },
      },
    });
    if (!company) {
      throw new NotFoundException('Empresa nao encontrada.');
    }
    if (company.status !== expectedStatus) {
      throw new ConflictException(
        `A empresa precisa estar ${expectedStatus} para mudar para ${nextStatus}.`,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.company.updateMany({
        where: { id: companyId, status: expectedStatus },
        data: { status: nextStatus, invoiceOverdueBlockedAt: null },
      });
      if (updated.count !== 1) {
        throw new ConflictException(
          'O status da empresa mudou durante a operacao. Atualize a tela.',
        );
      }
      await this.audit.record(
        {
          actorUserId,
          action: nextStatus === 'ACTIVE' ? 'COMPANY_REACTIVATED' : 'COMPANY_SUSPENDED',
          entityType: 'COMPANY',
          entityId: companyId,
          summary: `Empresa alterada de ${expectedStatus} para ${nextStatus}.`,
        },
        tx,
      );
      await tx.companyStatusHistory.create({
        data: {
          companyId,
          fromStatus: expectedStatus,
          toStatus: nextStatus,
          changedByUserId: actorUserId,
          note:
            nextStatus === 'ACTIVE'
              ? 'Empresa reativada manualmente pelo administrador.'
              : 'Empresa suspensa manualmente pelo administrador.',
        },
      });
    });

    if (nextStatus === 'SUSPENDED') {
      for (const member of company.teamMembers) {
        this.realtimeGateway.disconnectUser(member.userId);
      }
    }

    return this.detail(companyId);
  }

  async changeMemberPassword(
    companyId: string,
    memberId: string,
    password: string,
    actorUserId: string,
  ): Promise<AdminPasswordChangeResult> {
    const membership = await this.prisma.companyTeamMember.findFirst({
      where: {
        id: memberId,
        companyId,
        active: true,
        user: { type: 'COMPANY_MEMBER' },
      },
      select: { userId: true },
    });

    if (!membership) {
      const company = await this.prisma.company.findUnique({
        where: { id: companyId },
        select: { id: true },
      });
      if (!company) {
        throw new NotFoundException('Empresa não encontrada.');
      }
      throw new NotFoundException('Responsável ativo não encontrado nesta empresa.');
    }

    const result = await this.authService.replacePassword(membership.userId, password, {
      mutateInSameTransaction: async (tx) => {
        await this.audit.record(
          {
            actorUserId,
            action: 'COMPANY_MEMBER_PASSWORD_RESET',
            entityType: 'COMPANY_MEMBER',
            entityId: memberId,
            summary: 'Senha de acesso de um responsavel da empresa redefinida.',
          },
          tx,
        );
      },
    });
    this.realtimeGateway.disconnectUser(membership.userId);
    return result;
  }

  async updateCompany(
    companyId: string,
    payload: AdminUpdateCompanyPayload,
    actorUserId: string,
  ): Promise<AdminCompanyDetail> {
    await this.prisma.$transaction(async (tx) => {
      const [company, region, duplicate] = await Promise.all([
        tx.company.findUnique({ where: { id: companyId }, select: { id: true } }),
        tx.region.findFirst({
          where: { id: payload.regionId, active: true },
          select: { id: true },
        }),
        tx.company.findFirst({
          where: { document: payload.document, id: { not: companyId } },
          select: { id: true },
        }),
      ]);
      if (!company) throw new NotFoundException('Empresa nao encontrada.');
      if (!region) throw new ConflictException('A regiao selecionada nao existe ou esta inativa.');
      if (duplicate) throw new ConflictException('Este CNPJ ja pertence a outra empresa.');

      await tx.company.update({
        where: { id: companyId },
        data: {
          tradeName: payload.tradeName,
          legalName: payload.legalName,
          document: payload.document,
          regionId: payload.regionId,
        },
      });
      await this.audit.record(
        {
          actorUserId,
          action: 'COMPANY_UPDATED',
          entityType: 'COMPANY',
          entityId: companyId,
          summary: `Empresa ${payload.tradeName} atualizada, incluindo CNPJ e regiao.`,
        },
        tx,
      );
    });
    return this.detail(companyId);
  }

  async updateBillingSettings(
    companyId: string,
    payload: AdminUpdateCompanyBillingSettingsPayload,
    actorUserId: string,
  ): Promise<AdminCompanyDetail> {
    await this.prisma.$transaction(async (tx) => {
      const company = await tx.company.findUnique({
        where: { id: companyId },
        select: {
          invoiceClosingMode: true,
          invoiceClosingFrequency: true,
          invoiceClosingWeekday: true,
          invoiceClosingMonthDay: true,
        },
      });
      if (!company) throw new NotFoundException('Empresa nao encontrada.');

      const scheduleChanged =
        company.invoiceClosingMode !== payload.invoiceClosingMode ||
        company.invoiceClosingFrequency !== payload.invoiceClosingFrequency ||
        company.invoiceClosingWeekday !== payload.invoiceClosingWeekday ||
        company.invoiceClosingMonthDay !== payload.invoiceClosingMonthDay;

      await tx.company.update({
        where: { id: companyId },
        data: {
          invoiceClosingMode: payload.invoiceClosingMode,
          invoiceClosingFrequency: payload.invoiceClosingFrequency,
          invoiceClosingWeekday: payload.invoiceClosingWeekday,
          invoiceClosingMonthDay: payload.invoiceClosingMonthDay,
          invoiceOverdueBlockAfterDays: payload.invoiceOverdueBlockAfterDays,
          ...(scheduleChanged && { lastAutomaticInvoiceClosingDate: null }),
        },
      });
      await this.audit.record(
        {
          actorUserId,
          action: 'COMPANY_BILLING_SETTINGS_UPDATED',
          entityType: 'COMPANY',
          entityId: companyId,
          summary: 'Politica de fechamento e bloqueio financeiro da empresa atualizada.',
          metadata: {
            invoiceClosingMode: payload.invoiceClosingMode,
            invoiceClosingFrequency: payload.invoiceClosingFrequency,
            invoiceClosingWeekday: payload.invoiceClosingWeekday,
            invoiceClosingMonthDay: payload.invoiceClosingMonthDay,
            invoiceOverdueBlockAfterDays: payload.invoiceOverdueBlockAfterDays,
          },
        },
        tx,
      );
    });

    return this.detail(companyId);
  }

  async addAddress(
    companyId: string,
    payload: AdminCompanyAddressPayload,
    actorUserId: string,
  ): Promise<AdminCompanyDetail> {
    await this.prisma.$transaction(async (tx) => {
      const company = await tx.company.findUnique({
        where: { id: companyId },
        select: { id: true },
      });
      if (!company) throw new NotFoundException('Empresa nao encontrada.');
      const count = await tx.companyAddress.count({ where: { companyId } });
      const isPrimary = payload.isPrimary || count === 0;
      if (isPrimary) {
        await tx.companyAddress.updateMany({ where: { companyId }, data: { isPrimary: false } });
      }
      const address = await tx.companyAddress.create({
        data: { companyId, ...this.addressData(payload), isPrimary },
      });
      await this.audit.record(
        {
          actorUserId,
          action: 'COMPANY_ADDRESS_CREATED',
          entityType: 'COMPANY_ADDRESS',
          entityId: address.id,
          summary: `Endereco ${payload.street}, ${payload.number} adicionado a empresa.`,
        },
        tx,
      );
    });
    return this.detail(companyId);
  }

  async updateAddress(
    companyId: string,
    addressId: string,
    payload: AdminCompanyAddressPayload,
    actorUserId: string,
  ): Promise<AdminCompanyDetail> {
    await this.prisma.$transaction(async (tx) => {
      const address = await tx.companyAddress.findFirst({
        where: { id: addressId, companyId },
        select: { id: true, isPrimary: true },
      });
      if (!address) throw new NotFoundException('Endereco nao encontrado nesta empresa.');
      const isPrimary = payload.isPrimary || address.isPrimary;
      if (isPrimary) {
        await tx.companyAddress.updateMany({
          where: { companyId, id: { not: addressId } },
          data: { isPrimary: false },
        });
      }
      await tx.companyAddress.update({
        where: { id: addressId },
        data: { ...this.addressData(payload), isPrimary },
      });
      await this.audit.record(
        {
          actorUserId,
          action: 'COMPANY_ADDRESS_UPDATED',
          entityType: 'COMPANY_ADDRESS',
          entityId: addressId,
          summary: `Endereco ${payload.street}, ${payload.number} atualizado.`,
        },
        tx,
      );
    });
    return this.detail(companyId);
  }

  async deleteAddress(
    companyId: string,
    addressId: string,
    actorUserId: string,
  ): Promise<AdminCompanyDetail> {
    await this.prisma.$transaction(async (tx) => {
      const addresses = await tx.companyAddress.findMany({
        where: { companyId },
        orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
      });
      const address = addresses.find((item) => item.id === addressId);
      if (!address) throw new NotFoundException('Endereco nao encontrado nesta empresa.');
      if (addresses.length === 1) {
        throw new ConflictException(
          'Cadastre outro endereco antes de remover o unico endereco da empresa.',
        );
      }
      await tx.companyAddress.delete({ where: { id: addressId } });
      if (address.isPrimary) {
        const replacement = addresses.find((item) => item.id !== addressId)!;
        await tx.companyAddress.update({
          where: { id: replacement.id },
          data: { isPrimary: true },
        });
      }
      await this.audit.record(
        {
          actorUserId,
          action: 'COMPANY_ADDRESS_REMOVED',
          entityType: 'COMPANY_ADDRESS',
          entityId: addressId,
          summary: `Endereco ${address.street}, ${address.number} removido da empresa.`,
        },
        tx,
      );
    });
    return this.detail(companyId);
  }

  async addMember(
    companyId: string,
    payload: AdminCreateCompanyMemberPayload,
    actorUserId: string,
  ): Promise<AdminCompanyDetail> {
    await this.prisma.$transaction(async (tx) => {
      const [company, duplicate] = await Promise.all([
        tx.company.findUnique({ where: { id: companyId }, select: { id: true } }),
        tx.user.findUnique({ where: { email: payload.email }, select: { id: true } }),
      ]);
      if (!company) throw new NotFoundException('Empresa nao encontrada.');
      if (duplicate) throw new ConflictException('Este e-mail ja esta em uso.');
      const user = await tx.user.create({
        data: {
          type: 'COMPANY_MEMBER',
          name: payload.name,
          email: payload.email,
          phone: payload.phone,
          passwordHash: await bcrypt.hash(payload.password, PASSWORD_HASH_ROUNDS),
        },
      });
      const member = await tx.companyTeamMember.create({
        data: { companyId, userId: user.id, role: payload.role },
      });
      await this.audit.record(
        {
          actorUserId,
          action: 'COMPANY_MEMBER_CREATED',
          entityType: 'COMPANY_MEMBER',
          entityId: member.id,
          summary: `${payload.name} adicionado como ${payload.role} da empresa.`,
        },
        tx,
      );
    });
    return this.detail(companyId);
  }

  async updateMember(
    companyId: string,
    memberId: string,
    payload: AdminUpdateCompanyMemberPayload,
    actorUserId: string,
  ): Promise<AdminCompanyDetail> {
    await this.prisma.$transaction(async (tx) => {
      const member = await tx.companyTeamMember.findFirst({
        where: { id: memberId, companyId },
        select: { id: true, userId: true, role: true, active: true },
      });
      if (!member) throw new NotFoundException('Responsavel nao encontrado nesta empresa.');
      const duplicate = await tx.user.findFirst({
        where: { email: payload.email, id: { not: member.userId } },
        select: { id: true },
      });
      if (duplicate) throw new ConflictException('Este e-mail ja esta em uso.');
      if (member.active && member.role === 'OWNER' && payload.role !== 'OWNER') {
        await this.assertAnotherActiveOwner(tx, companyId, memberId);
      }
      await tx.user.update({
        where: { id: member.userId },
        data: { name: payload.name, email: payload.email, phone: payload.phone },
      });
      await tx.companyTeamMember.update({ where: { id: memberId }, data: { role: payload.role } });
      await this.audit.record(
        {
          actorUserId,
          action: 'COMPANY_MEMBER_UPDATED',
          entityType: 'COMPANY_MEMBER',
          entityId: memberId,
          summary: `Dados e papel de ${payload.name} atualizados para ${payload.role}.`,
        },
        tx,
      );
    });
    return this.detail(companyId);
  }

  async setMemberActive(
    companyId: string,
    memberId: string,
    active: boolean,
    actorUserId: string,
  ): Promise<AdminCompanyDetail> {
    let userId: string | null = null;
    await this.prisma.$transaction(async (tx) => {
      const member = await tx.companyTeamMember.findFirst({
        where: { id: memberId, companyId },
        select: {
          id: true,
          userId: true,
          role: true,
          active: true,
          user: { select: { name: true } },
        },
      });
      if (!member) throw new NotFoundException('Responsavel nao encontrado nesta empresa.');
      if (member.active === active)
        throw new ConflictException(`Este acesso ja esta ${active ? 'ativo' : 'inativo'}.`);
      if (!active && member.role === 'OWNER')
        await this.assertAnotherActiveOwner(tx, companyId, memberId);
      await tx.companyTeamMember.update({ where: { id: memberId }, data: { active } });
      await this.audit.record(
        {
          actorUserId,
          action: active ? 'COMPANY_MEMBER_REACTIVATED' : 'COMPANY_MEMBER_DEACTIVATED',
          entityType: 'COMPANY_MEMBER',
          entityId: memberId,
          summary: `Acesso de ${member.user.name} ${active ? 'reativado' : 'desativado'}.`,
        },
        tx,
      );
      userId = member.userId;
    });
    if (!active && userId) this.realtimeGateway.disconnectUser(userId);
    return this.detail(companyId);
  }

  private async assertAnotherActiveOwner(
    tx: Prisma.TransactionClient,
    companyId: string,
    excludedMemberId: string,
  ): Promise<void> {
    const other = await tx.companyTeamMember.findFirst({
      where: { companyId, id: { not: excludedMemberId }, active: true, role: 'OWNER' },
      select: { id: true },
    });
    if (!other)
      throw new ConflictException('A empresa precisa manter ao menos um responsavel ativo.');
  }

  private addressData(payload: AdminCompanyAddressPayload) {
    return {
      label: payload.label || null,
      street: payload.street,
      number: payload.number,
      complement: payload.complement || null,
      city: payload.city,
      state: payload.state.toUpperCase(),
      zip: payload.zip,
      lat: payload.lat ?? null,
      lng: payload.lng ?? null,
    };
  }

  private toListItem(company: {
    id: string;
    legalName: string;
    tradeName: string;
    document: string;
    status: string;
    createdAt: Date;
    teamMembers: { role: string; user: { name: string; email: string; phone: string } }[];
    approvedBy: { id: string; name: string } | null;
    approvedAt: Date | null;
  }): AdminCompanyListItem {
    const owner = company.teamMembers.find((member) => member.role === 'OWNER')?.user;
    return {
      id: company.id,
      legalName: company.legalName,
      tradeName: company.tradeName,
      document: company.document,
      status: company.status,
      createdAt: company.createdAt.toISOString(),
      owner: owner ? { name: owner.name, email: owner.email, phone: owner.phone } : null,
      approvedBy: company.approvedBy
        ? { id: company.approvedBy.id, name: company.approvedBy.name }
        : null,
      approvedAt: company.approvedAt?.toISOString() ?? null,
    };
  }
}
