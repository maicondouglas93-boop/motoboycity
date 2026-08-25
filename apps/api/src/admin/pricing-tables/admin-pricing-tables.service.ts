import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import type { PricingTableItem } from '@motoboycity/types';
import type { CreatePricingTablePayload } from '@motoboycity/validation';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminAuditService } from '../audit/admin-audit.service';

export interface ListPricingTablesFilters {
  serviceTypeId?: string;
  companyId?: string;
  active?: boolean;
}

@Injectable()
export class AdminPricingTablesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AdminAuditService,
  ) {}

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

  async create(payload: CreatePricingTablePayload, actorUserId: string): Promise<PricingTableItem> {
    // O controller aplica o schema Zod, mas este service tambem pode ser
    // reutilizado internamente. Repetir esta invariante aqui impede que um
    // chamador futuro grave uma tabela personalizada nova herdando o global.
    if (payload.companyId && payload.driverCommissionPercentage === undefined) {
      throw new BadRequestException(
        'Informe a divisão entre entregador e plataforma para o preço personalizado.',
      );
    }
    if (!payload.companyId && payload.driverCommissionPercentage !== undefined) {
      throw new BadRequestException(
        'A divisão personalizada só pode ser usada em uma tabela de empresa.',
      );
    }

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

    const created = await this.createActiveVersion(regionId, payload, actorUserId);

    return this.toItem(created);
  }

  async deactivate(id: string, actorUserId: string): Promise<PricingTableItem> {
    const updated = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.pricingTable.findUnique({ where: { id } });
      if (!existing) {
        throw new NotFoundException('Tabela de preços não encontrada.');
      }
      if (!existing.active) {
        throw new ConflictException('Esta tabela de preços já está inativa.');
      }

      const deactivated = await tx.pricingTable.update({
        where: { id },
        data: { active: false },
        include: { serviceType: true, company: { select: { tradeName: true } } },
      });
      await this.audit.record(
        {
          actorUserId,
          action: 'PRICING_TABLE_DEACTIVATED',
          entityType: 'PRICING_TABLE',
          entityId: deactivated.id,
          summary: `Tabela de preços de ${deactivated.serviceType.name}${deactivated.company ? ` para ${deactivated.company.tradeName}` : ' geral'} desativada.`,
        },
        tx,
      );
      return deactivated;
    });

    return this.toItem(updated);
  }

  /**
   * Volta uma tabela desativada para o ar.
   *
   * A rota nao existia: `desativar` era efeito colateral de criar uma
   * substituta ("mudar preco cria nova linha e desativa a anterior"), e virou
   * botao solto na tela. Quem desativasse sem criar outra deixava a regiao SEM
   * TABELA — e sem caminho de volta, porque reativar nao existia.
   *
   * RECUSA se ja houver outra ativa no mesmo escopo, em vez de desativa-la
   * calada. Trocar qual tabela de preco governa a operacao e decisao de
   * dinheiro; fazer isso como efeito colateral de um clique em "Ativar"
   * mudaria o preco de todo pedido novo sem ninguem perceber.
   */
  async reactivate(id: string, actorUserId: string): Promise<PricingTableItem> {
    const existing = await this.prisma.pricingTable.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Tabela de preços não encontrada.');
    }
    if (existing.active) {
      throw new ConflictException('Esta tabela de preços já está ativa.');
    }

    const maxAttempts = 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const updated = await this.prisma.$transaction(
          async (tx) => {
            const emUso = await tx.pricingTable.findFirst({
              where: {
                regionId: existing.regionId,
                serviceTypeId: existing.serviceTypeId,
                companyId: existing.companyId,
                active: true,
              },
              include: { serviceType: true },
            });
            if (emUso) {
              throw new ConflictException(
                `Já existe uma tabela ativa para ${emUso.serviceType.name}` +
                  `${existing.companyId ? ' nesta empresa' : ' na tabela geral'}. ` +
                  'Desative aquela antes de reativar esta.',
              );
            }

            const reactivated = await tx.pricingTable.update({
              where: { id },
              data: { active: true },
              include: { serviceType: true, company: { select: { tradeName: true } } },
            });
            await this.audit.record(
              {
                actorUserId,
                action: 'PRICING_TABLE_REACTIVATED',
                entityType: 'PRICING_TABLE',
                entityId: reactivated.id,
                summary: `Tabela de preços de ${reactivated.serviceType.name}${reactivated.company ? ` para ${reactivated.company.tradeName}` : ' geral'} reativada.`,
              },
              tx,
            );
            return reactivated;
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );

        return this.toItem(updated);
      } catch (error) {
        if (!this.isRetryableWriteConflict(error)) throw error;
        if (attempt === maxAttempts) {
          throw new ConflictException(
            'Outra atualização de preços ocorreu ao mesmo tempo. Tente novamente.',
          );
        }
      }
    }

    throw new ConflictException('Não foi possível reativar a tabela de preços.');
  }

  private async createActiveVersion(
    regionId: string,
    payload: CreatePricingTablePayload,
    actorUserId: string,
  ) {
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

            const created = await tx.pricingTable.create({
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
                // Tabela geral tem uma unica fonte de verdade: PlatformSettings.
                // A validacao exige o percentual quando a tabela pertence a uma
                // empresa, mas mantemos o null explicito para o contrato ficar
                // correto mesmo se este metodo for chamado fora do controller.
                driverCommissionPercentage: payload.companyId
                  ? payload.driverCommissionPercentage
                  : null,
              },
              include: { serviceType: true, company: { select: { tradeName: true } } },
            });
            await this.audit.record(
              {
                actorUserId,
                action: 'PRICING_TABLE_CREATED',
                entityType: 'PRICING_TABLE',
                entityId: created.id,
                summary:
                  `Nova tabela de preços de ${created.serviceType.name}` +
                  `${created.company ? ` para ${created.company.tradeName}` : ' geral'} ativada.` +
                  (created.driverCommissionPercentage === null
                    ? ''
                    : ` Divisão: ${Number(created.driverCommissionPercentage)}% entregador e ${100 - Number(created.driverCommissionPercentage)}% plataforma.`),
              },
              tx,
            );
            return created;
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
    driverCommissionPercentage: { toString(): string } | null;
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
      driverCommissionPercentage:
        pricingTable.driverCommissionPercentage === null
          ? null
          : Number(pricingTable.driverCommissionPercentage),
      active: pricingTable.active,
      createdAt: pricingTable.createdAt.toISOString(),
    };
  }
}
