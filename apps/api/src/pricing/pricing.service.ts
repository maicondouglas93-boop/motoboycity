import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AdminPlatformSettingsService } from '../admin/platform-settings/admin-platform-settings.service';
import { PrismaService } from '../prisma/prisma.service';
import { calculatePricing, type PricingCalculatorResult } from './pricing-calculator';

export interface PricingQuoteInput {
  /**
   * Região da EMPRESA dona do pedido (`Company.regionId`), obrigatória.
   *
   * Antes o preço resolvia a região sozinho, com `findFirst({ active: true })` — a
   * primeira região ativa numa ordem que o banco não garante. Com uma praça só isso
   * acertava por acidente; na segunda, uma empresa passaria a ser cobrada pela tabela
   * de outra cidade, sem erro nenhum aparecendo.
   *
   * Por isso o parâmetro é exigido em vez de opcional com fallback: quem cota precisa
   * dizer de qual praça está falando, e não existe caminho silencioso de volta ao
   * palpite.
   */
  regionId: string;
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
    // A região vem de quem cota e é conferida aqui. Uma praça desativada precisa
    // interromper a cotação com mensagem própria: cair para outra região seria cobrar
    // o cliente por uma tabela que não é a dele.
    const region = await this.prisma.region.findFirst({
      where: { id: input.regionId, active: true },
    });
    if (!region) {
      throw new ConflictException(
        'A região desta empresa não está ativa. Contate o suporte antes de criar pedidos.',
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
