import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AdminPlatformSettingsService } from '../admin/platform-settings/admin-platform-settings.service';
import { PrismaService } from '../prisma/prisma.service';
import { calculatePricing, type PricingCalculatorResult } from './pricing-calculator';
import { isSurchargeActiveAt } from './surcharge-window';

export interface PricingQuoteInput {
  /** Empresa dona do pedido, usada para resolver uma tabela personalizada. */
  companyId: string;
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
  /**
   * Instante usado para decidir quais taxas adicionais estao valendo. Existe
   * como parametro, e nao `new Date()` la dentro, para o calculo ser
   * reproduzivel — recalcular uma entrega antiga precisa reaplicar a taxa que
   * valia naquela hora, nao a de agora.
   */
  at?: Date;
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

    const companyPricingTable = await this.prisma.pricingTable.findFirst({
      where: {
        regionId: region.id,
        serviceTypeId: input.serviceTypeId,
        companyId: input.companyId,
        active: true,
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    const pricingTable =
      companyPricingTable ??
      (await this.prisma.pricingTable.findFirst({
        where: {
          regionId: region.id,
          serviceTypeId: input.serviceTypeId,
          companyId: null,
          active: true,
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      }));
    if (!pricingTable) {
      throw new NotFoundException(
        'Nenhuma tabela de preços ativa para esta empresa ou para sua região.',
      );
    }

    const settings = await this.platformSettingsService.get();
    if (settings.driverCommissionPercentage === null) {
      throw new ConflictException(
        'A divisão entregador/plataforma ainda não foi configurada pelo admin.',
      );
    }

    const surcharge = await this.resolveSurcharge(region.id, input.at ?? new Date());

    return calculatePricing({
      distanceKm: input.distanceKm,
      baseFee: Number(pricingTable.baseFee),
      includedDistanceKm: Number(pricingTable.includedDistanceKm),
      perKmFee: Number(pricingTable.perKmFee),
      minimumFee: pricingTable.minimumFee === null ? null : Number(pricingTable.minimumFee),
      returnFee: pricingTable.returnFee === null ? null : Number(pricingTable.returnFee),
      requiresReturn: input.requiresReturn,
      driverCommissionPercentage: settings.driverCommissionPercentage,
      surcharge,
    });
  }

  /**
   * Qual taxa adicional esta valendo agora — no maximo UMA.
   *
   * Somar taxas seria a decisao perigosa: numa sexta feriado chovendo, tres
   * regras se empilhariam e o cliente pagaria um acrescimo que ninguem
   * configurou de proposito. Com uma so, o pior caso e a taxa mais recente,
   * que e um numero que o admin escolheu.
   *
   * O criterio de desempate e a criacao mais recente: e o que o admin acabou
   * de mexer, e a tela mostra qual esta valendo para nao virar surpresa.
   */
  private async resolveSurcharge(
    regionId: string,
    at: Date,
  ): Promise<{
    label: string;
    type: 'PERCENTAGE' | 'FIXED';
    value: number;
    driverSharePercentage: number;
  } | null> {
    const candidates = await this.prisma.surcharge.findMany({
      where: { regionId, active: true },
      include: { schedules: true },
      orderBy: { createdAt: 'desc' },
    });

    const vigente = candidates.find((surcharge) =>
      isSurchargeActiveAt(
        {
          active: surcharge.active,
          manuallyActive: surcharge.manuallyActive,
          schedules: surcharge.schedules,
        },
        at,
      ),
    );
    if (!vigente) return null;

    return {
      label: vigente.name,
      type: vigente.type,
      value: Number(vigente.value),
      driverSharePercentage: Number(vigente.driverSharePercentage),
    };
  }
}
