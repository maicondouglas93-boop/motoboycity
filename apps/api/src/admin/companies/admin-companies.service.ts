import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { CompanyStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export interface ApproveCompanyResult {
  companyId: string;
  status: string;
}

export interface AdminCompanyListItem {
  id: string;
  legalName: string;
  tradeName: string;
  document: string;
  status: string;
  createdAt: string;
  owner: { name: string; email: string; phone: string } | null;
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
      },
    });

    return companies.map((company) => {
      const owner = company.teamMembers[0]?.user;
      return {
        id: company.id,
        legalName: company.legalName,
        tradeName: company.tradeName,
        document: company.document,
        status: company.status,
        createdAt: company.createdAt.toISOString(),
        owner: owner ? { name: owner.name, email: owner.email, phone: owner.phone } : null,
      };
    });
  }

  async approve(companyId: string): Promise<ApproveCompanyResult> {
    const company = await this.prisma.company.findUnique({ where: { id: companyId } });
    if (!company) {
      throw new NotFoundException('Empresa não encontrada.');
    }

    if (company.status !== 'PENDING_APPROVAL') {
      throw new ConflictException(
        `Esta empresa não está aguardando aprovação (status atual: ${company.status}).`,
      );
    }

    const updated = await this.prisma.company.update({
      where: { id: companyId },
      data: { status: 'ACTIVE' },
    });

    return { companyId: updated.id, status: updated.status };
  }
}
