import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { SurchargeItem } from '@motoboycity/types';
import type { UpsertSurchargePayload } from '@motoboycity/validation';
import { PrismaService } from '../../prisma/prisma.service';
import { isSurchargeActiveAt } from '../../pricing/surcharge-window';

/**
 * As formas vêm de `@motoboycity/types` e não são redeclaradas aqui: uma cópia
 * local do contrato já foi a origem de um drift entre a API e o painel.
 */
export type { SurchargeItem };

type SurchargeRow = {
  id: string;
  name: string;
  type: 'PERCENTAGE' | 'FIXED';
  value: { toString(): string };
  driverSharePercentage: { toString(): string };
  active: boolean;
  manuallyActive: boolean;
  createdAt: Date;
  schedules: Array<{
    id: string;
    weekday: number | null;
    startDate: string | null;
    endDate: string | null;
    startMinute: number;
    endMinute: number;
  }>;
};

@Injectable()
export class AdminSurchargesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<SurchargeItem[]> {
    const surcharges = await this.prisma.surcharge.findMany({
      include: { schedules: true },
      orderBy: { createdAt: 'desc' },
    });
    const now = new Date();
    return surcharges.map((surcharge) => this.toItem(surcharge, now));
  }

  async create(payload: UpsertSurchargePayload): Promise<SurchargeItem> {
    const region = await this.resolveRegion();

    const created = await this.prisma.surcharge.create({
      data: {
        regionId: region.id,
        name: payload.name,
        type: payload.type,
        value: payload.value,
        driverSharePercentage: payload.driverSharePercentage ?? 0,
        active: payload.active ?? true,
        manuallyActive: payload.manuallyActive ?? false,
        schedules: { create: payload.schedules?.map((item) => this.toScheduleData(item)) ?? [] },
      },
      include: { schedules: true },
    });
    return this.toItem(created, new Date());
  }

  async update(id: string, payload: UpsertSurchargePayload): Promise<SurchargeItem> {
    await this.findOrThrow(id);

    /**
     * As janelas são substituídas por inteiro, não sincronizadas item a item.
     *
     * Casar janelas antigas com novas exigiria que o painel devolvesse os ids,
     * e o primeiro id perdido no caminho viraria uma janela órfã cobrando
     * sozinha. Trocar o conjunto inteiro é a operação que não tem esse estado
     * intermediário.
     */
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.surchargeSchedule.deleteMany({ where: { surchargeId: id } });
      return tx.surcharge.update({
        where: { id },
        data: {
          name: payload.name,
          type: payload.type,
          value: payload.value,
          driverSharePercentage: payload.driverSharePercentage ?? 0,
          ...(payload.active !== undefined && { active: payload.active }),
          ...(payload.manuallyActive !== undefined && { manuallyActive: payload.manuallyActive }),
          schedules: { create: payload.schedules?.map((item) => this.toScheduleData(item)) ?? [] },
        },
        include: { schedules: true },
      });
    });
    return this.toItem(updated, new Date());
  }

  /** O interruptor manual, isolado do resto para o admin ligar em um clique. */
  async setManuallyActive(id: string, manuallyActive: boolean): Promise<SurchargeItem> {
    const surcharge = await this.findOrThrow(id);
    if (!surcharge.active && manuallyActive) {
      throw new ConflictException('Reative a taxa antes de ligá-la.');
    }

    const updated = await this.prisma.surcharge.update({
      where: { id },
      data: { manuallyActive },
      include: { schedules: true },
    });
    return this.toItem(updated, new Date());
  }

  async setActive(id: string, active: boolean): Promise<SurchargeItem> {
    await this.findOrThrow(id);

    const updated = await this.prisma.surcharge.update({
      where: { id },
      /**
       * Desativar também desliga o interruptor manual. Sem isso, uma taxa
       * arquivada com o manual esquecido em ligado voltaria a cobrar no
       * instante em que alguém a reativasse.
       */
      data: { active, ...(active ? {} : { manuallyActive: false }) },
      include: { schedules: true },
    });
    return this.toItem(updated, new Date());
  }

  async remove(id: string): Promise<void> {
    await this.findOrThrow(id);
    await this.prisma.surcharge.delete({ where: { id } });
  }

  private async findOrThrow(id: string) {
    const surcharge = await this.prisma.surcharge.findUnique({ where: { id } });
    if (!surcharge) {
      throw new NotFoundException('Taxa não encontrada.');
    }
    return surcharge;
  }

  /**
   * A região é resolvida no servidor, como na tabela de preços: o admin não
   * escolhe praça numa operação de uma praça só, e pedir isso na tela seria um
   * campo a mais para errar.
   */
  private async resolveRegion() {
    const region = await this.prisma.region.findFirst({ where: { active: true } });
    if (!region) {
      throw new ConflictException('Nenhuma região ativa configurada.');
    }
    return region;
  }

  private toScheduleData(item: {
    weekday?: number | null;
    startDate?: string | null;
    endDate?: string | null;
    startMinute: number;
    endMinute: number;
  }) {
    return {
      weekday: item.weekday ?? null,
      startDate: item.startDate ?? null,
      endDate: item.endDate ?? null,
      startMinute: item.startMinute,
      endMinute: item.endMinute,
    };
  }

  private toItem(surcharge: SurchargeRow, now: Date): SurchargeItem {
    const schedules = surcharge.schedules.map((schedule) => ({
      id: schedule.id,
      weekday: schedule.weekday,
      startDate: schedule.startDate,
      endDate: schedule.endDate,
      startMinute: schedule.startMinute,
      endMinute: schedule.endMinute,
    }));

    return {
      id: surcharge.id,
      name: surcharge.name,
      type: surcharge.type,
      value: Number(surcharge.value),
      driverSharePercentage: Number(surcharge.driverSharePercentage),
      active: surcharge.active,
      manuallyActive: surcharge.manuallyActive,
      /**
       * Resolvido aqui e não no painel: avaliar janela exige o fuso da operação,
       * e uma segunda cópia dessa regra do lado do navegador divergiria da que
       * cobra de verdade.
       */
      activeNow: isSurchargeActiveAt(
        { active: surcharge.active, manuallyActive: surcharge.manuallyActive, schedules },
        now,
      ),
      schedules,
      createdAt: surcharge.createdAt.toISOString(),
    };
  }
}
