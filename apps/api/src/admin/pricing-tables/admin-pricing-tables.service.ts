import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import type { PricingTableItem } from '@motoboycity/types';
import type { CreatePricingTablePayload } from '@motoboycity/validation';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export interface ListPricingTablesFilters {
  serviceTypeId?: string;
  companyId?: string;
  active?: boolean;
}

@Injectable()
export class AdminPricingTablesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(filters: ListPricingTablesFilters): Promise<PricingTableItem[]> {
    const pricingTables = await this.prisma.pricingTable.findMany({
      where: {
        ...(filters.serviceTypeId && { serviceTypeId: filters.serviceTypeId }),
        ...(filters.companyId && { companyId: filters.companyId }),
        ...(filters.active !== undefined && { active: filters.active }),
      },
      orderBy: { createdAt: 'desc' },
      include: { serviceType: true, company: { select: { tradeName: true } } },
    });

    return pricingTables.map((pricingTable) => this.toItem(pricingTable));
  }

  async create(payload: CreatePricingTablePayload): Promise<PricingTableItem> {
    const serviceType = await this.prisma.serviceType.findUnique({
      where: { id: payload.serviceTypeId },
    });
    if (!serviceType) {
      throw new NotFoundException('Tipo de serviço não encontrado.');
    }

    let regionId: string;
    if (payload.companyId) {
      const company = await this.prisma.company.findUnique({
        where: { id: payload.companyId },
        select: { id: true, region: { select: { id: true, active: true } } },
      });
      if (!company) {
        throw new NotFoundException('Empresa não encontrada.');
      }
      if (!company.region.active) {
        throw new ConflictException(
          'A região desta empresa está inativa. Ative a região antes de configurar preços.',
        );
      }
      regionId = company.region.id;
    } else {
      const region = await this.prisma.region.findFirst({ where: { active: true } });
      if (!region) {
        throw new InternalServerErrorException(
          'Nenhuma região configurada na plataforma. Contate o suporte.',
        );
      }
      regionId = region.id;
    }

    const created = await this.createActiveVersion(regionId, payload);

    return this.toItem(created);
  }

  async deactivate(id: string): Promise<PricingTableItem> {
    const existing = await this.prisma.pricingTable.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Tabela de preços não encontrada.');
    }
    if (!existing.active) {
      throw new ConflictException('Esta tabela de preços já está inativa.');
    }

    const updated = await this.prisma.pricingTable.update({
      where: { id },
      data: { active: false },
      include: { serviceType: true, company: { select: { tradeName: true } } },
    });

    return this.toItem(updated);
  }

  private async createActiveVersion(regionId: string, payload: CreatePricingTablePayload) {
    const maxAttempts = 3;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        return await this.prisma.$transaction(
          async (tx) => {
            await tx.pricingTable.updateMany({
              where: {
                regionId,
                serviceTypeId: payload.serviceTypeId,
                companyId: payload.companyId ?? null,
                active: true,
              },
              data: { active: false },
            });

            return tx.pricingTable.create({
              data: {
                regionId,
                serviceTypeId: payload.serviceTypeId,
                companyId: payload.companyId ?? null,
                baseFee: payload.baseFee,
                // Ausente e zero: sem bandeirada, o por-quilometro comeca no metro
                // zero, que e o comportamento de antes deste campo existir.
                includedDistanceKm: payload.includedDistanceKm ?? 0,
                perKmFee: payload.perKmFee,
                minimumFee: payload.minimumFee,
                returnFee: payload.returnFee,
              },
              include: { serviceType: true, company: { select: { tradeName: true } } },
            });
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
      } catch (error) {
        if (!this.isRetryableWriteConflict(error)) throw error;
        if (attempt === maxAttempts) {
          throw new ConflictException(
            'Outra atualização de preços ocorreu ao mesmo tempo. Tente salvar novamente.',
          );
        }
      }
    }

    throw new ConflictException('Não foi possível ativar a nova tabela de preços.');
  }

  private isRetryableWriteConflict(error: unknown): boolean {
    if (typeof error !== 'object' || error === null || !('code' in error)) return false;
    const code = (error as { code?: unknown }).code;
    return code === 'P2002' || code === 'P2034';
  }

  private toItem(pricingTable: {
    id: string;
    regionId: string;
    serviceTypeId: string;
    serviceType: { name: string };
    companyId: string | null;
    company: { tradeName: string } | null;
    baseFee: { toString(): string };
    includedDistanceKm: { toString(): string };
    perKmFee: { toString(): string };
    minimumFee: { toString(): string } | null;
    returnFee: { toString(): string } | null;
    active: boolean;
    createdAt: Date;
  }): PricingTableItem {
    return {
      id: pricingTable.id,
      regionId: pricingTable.regionId,
      serviceTypeId: pricingTable.serviceTypeId,
      serviceTypeName: pricingTable.serviceType.name,
      companyId: pricingTable.companyId,
      companyName: pricingTable.company?.tradeName ?? null,
      baseFee: Number(pricingTable.baseFee),
      includedDistanceKm: Number(pricingTable.includedDistanceKm),
      perKmFee: Number(pricingTable.perKmFee),
      minimumFee: pricingTable.minimumFee === null ? null : Number(pricingTable.minimumFee),
      returnFee: pricingTable.returnFee === null ? null : Number(pricingTable.returnFee),
      active: pricingTable.active,
      createdAt: pricingTable.createdAt.toISOString(),
    };
  }
}
