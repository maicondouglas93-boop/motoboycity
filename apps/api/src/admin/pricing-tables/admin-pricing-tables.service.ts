import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import type { CreatePricingTablePayload } from '@motoboycity/validation';
import { PrismaService } from '../../prisma/prisma.service';

export interface PricingTableItem {
  id: string;
  regionId: string;
  serviceTypeId: string;
  serviceTypeName: string;
  baseFee: number;
  perKmFee: number;
  minimumFee: number | null;
  returnFee: number | null;
  active: boolean;
  createdAt: string;
}

export interface ListPricingTablesFilters {
  serviceTypeId?: string;
  active?: boolean;
}

@Injectable()
export class AdminPricingTablesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(filters: ListPricingTablesFilters): Promise<PricingTableItem[]> {
    const pricingTables = await this.prisma.pricingTable.findMany({
      where: {
        ...(filters.serviceTypeId && { serviceTypeId: filters.serviceTypeId }),
        ...(filters.active !== undefined && { active: filters.active }),
      },
      orderBy: { createdAt: 'desc' },
      include: { serviceType: true },
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

    const region = await this.prisma.region.findFirst({ where: { active: true } });
    if (!region) {
      throw new InternalServerErrorException(
        'Nenhuma região configurada na plataforma. Contate o suporte.',
      );
    }

    const created = await this.prisma.$transaction(async (tx) => {
      await tx.pricingTable.updateMany({
        where: { regionId: region.id, serviceTypeId: payload.serviceTypeId, active: true },
        data: { active: false },
      });

      return tx.pricingTable.create({
        data: {
          regionId: region.id,
          serviceTypeId: payload.serviceTypeId,
          baseFee: payload.baseFee,
          perKmFee: payload.perKmFee,
          minimumFee: payload.minimumFee,
          returnFee: payload.returnFee,
        },
        include: { serviceType: true },
      });
    });

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
      include: { serviceType: true },
    });

    return this.toItem(updated);
  }

  private toItem(pricingTable: {
    id: string;
    regionId: string;
    serviceTypeId: string;
    serviceType: { name: string };
    baseFee: { toString(): string };
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
      baseFee: Number(pricingTable.baseFee),
      perKmFee: Number(pricingTable.perKmFee),
      minimumFee: pricingTable.minimumFee === null ? null : Number(pricingTable.minimumFee),
      returnFee: pricingTable.returnFee === null ? null : Number(pricingTable.returnFee),
      active: pricingTable.active,
      createdAt: pricingTable.createdAt.toISOString(),
    };
  }
}
