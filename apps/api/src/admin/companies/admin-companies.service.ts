import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  AdminCompanyRegistrationOptions,
  AdminPasswordChangeResult,
} from '@motoboycity/types';
import type { CompanyStatus } from '@prisma/client';
import { AuthService } from '../../auth/auth.service';
import { PrismaService } from '../../prisma/prisma.service';
import { RealtimeGateway } from '../../realtime/realtime.gateway';

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
    const updated = await this.prisma.company.update({
      where: { id: companyId },
      data: { status: 'ACTIVE', approvedByUserId, approvedAt },
    });

    return {
      companyId: updated.id,
      status: updated.status,
      approvedByUserId,
      approvedAt: approvedAt.toISOString(),
    };
  }

  async changeMemberPassword(
    companyId: string,
    memberId: string,
    password: string,
  ): Promise<AdminPasswordChangeResult> {
    const membership = await this.prisma.companyTeamMember.findFirst({
      where: {
        id: memberId,
        companyId,
        active: true,
        role: 'OWNER',
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

    const result = await this.authService.replacePassword(membership.userId, password);
    this.realtimeGateway.disconnectUser(membership.userId);
    return result;
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
