import { ConflictException, Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { AdminPlatformSettingsService } from '../admin/platform-settings/admin-platform-settings.service';
import { PrismaService } from '../prisma/prisma.service';
import { calculatePricing, type PricingCalculatorResult } from './pricing-calculator';

export interface PricingQuoteInput {
  serviceTypeId: string;
  distanceKm: number;
  requiresReturn: boolean;
}

@Injectable()
export class PricingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly platformSettingsService: AdminPlatformSettingsService,
  ) {}

  async quote(input: PricingQuoteInput): Promise<PricingCalculatorResult> {
    const region = await this.prisma.region.findFirst({ where: { active: true } });
    if (!region) {
      throw new InternalServerErrorException(
        'Nenhuma região configurada na plataforma. Contate o suporte.',
      );
    }

    const pricingTable = await this.prisma.pricingTable.findFirst({
      where: { regionId: region.id, serviceTypeId: input.serviceTypeId, active: true },
    });
    if (!pricingTable) {
      throw new NotFoundException(
        'Nenhuma tabela de preços ativa para este tipo de serviço nesta região.',
      );
    }

    const settings = await this.platformSettingsService.get();
    if (settings.driverCommissionPercentage === null) {
      throw new ConflictException(
        'A divisão entregador/plataforma ainda não foi configurada pelo admin.',
      );
    }

    return calculatePricing({
      distanceKm: input.distanceKm,
      baseFee: Number(pricingTable.baseFee),
      perKmFee: Number(pricingTable.perKmFee),
      minimumFee: pricingTable.minimumFee === null ? null : Number(pricingTable.minimumFee),
      returnFee: pricingTable.returnFee === null ? null : Number(pricingTable.returnFee),
      requiresReturn: input.requiresReturn,
      driverCommissionPercentage: settings.driverCommissionPercentage,
    });
  }
}
