import { ConflictException, Injectable } from '@nestjs/common';
import type { BusinessHoursResult } from '@motoboycity/types';
import type { ReplaceBusinessHoursPayload } from '@motoboycity/validation';
import { checkBusinessHours } from '../../deliveries/business-hours';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminPlatformSettingsService } from '../platform-settings/admin-platform-settings.service';

export type { BusinessHoursResult };

@Injectable()
export class AdminBusinessHoursService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly platformSettingsService: AdminPlatformSettingsService,
  ) {}

  async get(): Promise<BusinessHoursResult> {
    const region = await this.resolveRegion();
    const [hours, settings] = await Promise.all([
      this.prisma.businessHour.findMany({
        where: { regionId: region.id },
        orderBy: [{ weekday: 'asc' }, { startMinute: 'asc' }],
      }),
      this.platformSettingsService.get(),
    ]);

    /**
     * `openNow` sai daqui e não do painel: avaliar a faixa exige o fuso da
     * operação, e uma segunda cópia dessa regra do lado do navegador divergiria
     * da que bloqueia de verdade.
     */
    const { open, nextOpeningLabel } = checkBusinessHours(hours, new Date());

    return {
      enabled: settings.businessHoursEnabled,
      hours: hours.map((hour) => ({
        id: hour.id,
        weekday: hour.weekday,
        startMinute: hour.startMinute,
        endMinute: hour.endMinute,
      })),
      openNow: open,
      nextOpeningLabel,
    };
  }

  /**
   * Substitui todas as faixas de uma vez.
   *
   * Sincronizar item a item exigiria que o painel devolvesse ids, e o primeiro
   * id perdido no caminho deixaria uma faixa órfã mantendo a operação aberta
   * numa hora que ninguém configurou. Trocar o conjunto inteiro não tem esse
   * estado intermediário.
   */
  async replace(payload: ReplaceBusinessHoursPayload): Promise<BusinessHoursResult> {
    const region = await this.resolveRegion();

    await this.prisma.$transaction(async (tx) => {
      await tx.businessHour.deleteMany({ where: { regionId: region.id } });
      if (payload.hours.length > 0) {
        await tx.businessHour.createMany({
          data: payload.hours.map((hour) => ({ ...hour, regionId: region.id })),
        });
      }
    });

    return this.get();
  }

  private async resolveRegion() {
    const region = await this.prisma.region.findFirst({ where: { active: true } });
    if (!region) {
      throw new ConflictException('Nenhuma região ativa configurada.');
    }
    return region;
  }
}
