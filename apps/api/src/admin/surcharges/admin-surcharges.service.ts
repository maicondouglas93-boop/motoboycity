import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { SurchargeItem } from '@motoboycity/types';
import type { UpsertSurchargePayload } from '@motoboycity/validation';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { isSurchargeActiveAt } from '../../pricing/surcharge-window';
import { AdminAuditService } from '../audit/admin-audit.service';
import { RainWeatherService } from '../../weather/rain-weather.service';

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
  automaticRainEnabled: boolean;
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
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AdminAuditService,
    private readonly rainWeather: RainWeatherService,
  ) {}

  async list(): Promise<SurchargeItem[]> {
    const surcharges = await this.prisma.surcharge.findMany({
      include: { schedules: true },
      orderBy: { createdAt: 'desc' },
    });
    const now = new Date();
    return surcharges.map((surcharge) => this.toItem(surcharge, now));
  }

  async create(payload: UpsertSurchargePayload, actorUserId: string): Promise<SurchargeItem> {
    const region = await this.resolveRegion();

    const created = await this.prisma.$transaction(async (tx) => {
      const surcharge = await tx.surcharge.create({
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
      await this.audit.record(
        {
          actorUserId,
          action: 'SURCHARGE_CREATED',
          entityType: 'SURCHARGE',
          entityId: surcharge.id,
          summary: `Taxa adicional ${surcharge.name} criada.`,
        },
        tx,
      );
      return surcharge;
    });
    return this.toItem(created, new Date());
  }

  async update(
    id: string,
    payload: UpsertSurchargePayload,
    actorUserId: string,
  ): Promise<SurchargeItem> {
    const current = await this.findOrThrow(id);
    if (payload.manuallyActive && (current.automaticRainEnabled || !current.active)) {
      throw new ConflictException('Selecione o modo manual e reative a taxa antes de ligá-la.');
    }

    /**
     * As janelas são substituídas por inteiro, não sincronizadas item a item.
     *
     * Casar janelas antigas com novas exigiria que o painel devolvesse os ids,
     * e o primeiro id perdido no caminho viraria uma janela órfã cobrando
     * sozinha. Trocar o conjunto inteiro é a operação que não tem esse estado
     * intermediário.
     */
    const updated = await this.prisma
      .$transaction(async (tx) => {
        await tx.surchargeSchedule.deleteMany({ where: { surchargeId: id } });
        const surcharge = await tx.surcharge.update({
          where: {
            id,
            ...(payload.manuallyActive && { active: true, automaticRainEnabled: false }),
          },
          data: {
            name: payload.name,
            type: payload.type,
            value: payload.value,
            driverSharePercentage: payload.driverSharePercentage ?? 0,
            ...(payload.active !== undefined && { active: payload.active }),
            ...(payload.manuallyActive !== undefined && { manuallyActive: payload.manuallyActive }),
            schedules: {
              create: payload.schedules?.map((item) => this.toScheduleData(item)) ?? [],
            },
          },
          include: { schedules: true },
        });
        await this.audit.record(
          {
            actorUserId,
            action: 'SURCHARGE_UPDATED',
            entityType: 'SURCHARGE',
            entityId: surcharge.id,
            summary: `Taxa adicional ${surcharge.name} atualizada.`,
          },
          tx,
        );
        return surcharge;
      })
      .catch((error: unknown) => this.rethrowConcurrentChange(error));
    return this.toItem(updated, new Date());
  }

  /** Troca exclusiva de modo, sem misturar fontes nem reativar uma taxa. */
  async setRainAutomation(
    id: string,
    enabled: boolean,
    actorUserId: string,
  ): Promise<SurchargeItem> {
    await this.findOrThrow(id);
    if (enabled) {
      const weather = this.rainWeather.forSurcharge(id);
      if (!weather || weather.status === 'DISABLED' || weather.status === 'NOT_CONFIGURED') {
        throw new ConflictException(
          'Vincule esta taxa ao Open-Meteo e habilite a integração no servidor antes de escolher o automático.',
        );
      }
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      // A troca nunca religa um manual antigo. Não reativa uma taxa desativada.
      const changed = await tx.surcharge.updateMany({
        where: { id, automaticRainEnabled: !enabled },
        data: { automaticRainEnabled: enabled, manuallyActive: false },
      });
      const surcharge = await tx.surcharge.findUniqueOrThrow({
        where: { id },
        include: { schedules: true },
      });
      // Retry do mesmo modo não apaga um manual acionado depois da primeira resposta.
      if (changed.count === 0) return surcharge;
      await this.audit.record(
        {
          actorUserId,
          action: 'SURCHARGE_UPDATED',
          entityType: 'SURCHARGE',
          entityId: id,
          summary: `Taxa adicional ${surcharge.name}: modo ${enabled ? 'automático de chuva ativado' : 'manual/horários selecionado; automático desativado'}.`,
        },
        tx,
      );
      return surcharge;
    });
    return this.toItem(updated, new Date());
  }

  async setManuallyActive(
    id: string,
    manuallyActive: boolean,
    actorUserId: string,
  ): Promise<SurchargeItem> {
    const surcharge = await this.findOrThrow(id);
    if (!surcharge.active && manuallyActive) {
      throw new ConflictException('Reative a taxa antes de ligá-la.');
    }
    if (surcharge.automaticRainEnabled && manuallyActive) {
      throw new ConflictException('Selecione o modo manual antes de ligar a taxa manualmente.');
    }

    const updated = await this.prisma
      .$transaction(async (tx) => {
        const surchargeUpdated = await tx.surcharge.update({
          where: { id, ...(manuallyActive && { active: true, automaticRainEnabled: false }) },
          data: { manuallyActive },
          include: { schedules: true },
        });
        await this.audit.record(
          {
            actorUserId,
            action: manuallyActive ? 'SURCHARGE_TURNED_ON' : 'SURCHARGE_TURNED_OFF',
            entityType: 'SURCHARGE',
            entityId: surchargeUpdated.id,
            summary: `Taxa adicional ${surchargeUpdated.name} ${manuallyActive ? 'ligada manualmente' : 'desligada manualmente'}.`,
          },
          tx,
        );
        return surchargeUpdated;
      })
      .catch((error: unknown) => this.rethrowConcurrentChange(error));
    return this.toItem(updated, new Date());
  }

  async setActive(id: string, active: boolean, actorUserId: string): Promise<SurchargeItem> {
    await this.findOrThrow(id);

    const updated = await this.prisma.$transaction(async (tx) => {
      const surchargeUpdated = await tx.surcharge.update({
        where: { id },
        /**
         * Desativar também desliga o interruptor manual. Sem isso, uma taxa
         * arquivada com o manual esquecido em ligado voltaria a cobrar no
         * instante em que alguém a reativasse.
         */
        data: { active, ...(active ? {} : { manuallyActive: false }) },
        include: { schedules: true },
      });
      await this.audit.record(
        {
          actorUserId,
          action: active ? 'SURCHARGE_REACTIVATED' : 'SURCHARGE_DEACTIVATED',
          entityType: 'SURCHARGE',
          entityId: surchargeUpdated.id,
          summary: `Taxa adicional ${surchargeUpdated.name} ${active ? 'reativada' : 'desativada'}.`,
        },
        tx,
      );
      return surchargeUpdated;
    });
    return this.toItem(updated, new Date());
  }

  async remove(id: string, actorUserId: string): Promise<void> {
    const surcharge = await this.findOrThrow(id);
    await this.prisma.$transaction(async (tx) => {
      await tx.surcharge.delete({ where: { id } });
      await this.audit.record(
        {
          actorUserId,
          action: 'SURCHARGE_DELETED',
          entityType: 'SURCHARGE',
          entityId: id,
          summary: `Taxa adicional ${surcharge.name} excluída.`,
        },
        tx,
      );
    });
  }

  private rethrowConcurrentChange(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      throw new ConflictException(
        'A configuração da taxa mudou. Atualize a página e tente novamente.',
      );
    }
    throw error;
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
    const rainAutomation = this.rainWeather.forSurcharge(surcharge.id, now);
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
      automaticRainEnabled: surcharge.automaticRainEnabled,
      /**
       * Resolvido aqui e não no painel: avaliar janela exige o fuso da operação,
       * e uma segunda cópia dessa regra do lado do navegador divergiria da que
       * cobra de verdade.
       */
      activeNow: isSurchargeActiveAt(
        {
          active: surcharge.active,
          manuallyActive: surcharge.manuallyActive,
          automaticRainEnabled: surcharge.automaticRainEnabled,
          schedules,
          weatherActive: rainAutomation?.activeNow ?? false,
        },
        now,
      ),
      rainAutomation,
      schedules,
      createdAt: surcharge.createdAt.toISOString(),
    };
  }
}
