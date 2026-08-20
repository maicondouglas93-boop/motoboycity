import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { CompanyStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

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
  constructor(private readonly prisma: PrismaService) {}

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
