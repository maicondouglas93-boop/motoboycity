import { Injectable } from '@nestjs/common';
import type { PlatformSettingsItem } from '@motoboycity/types';
import type { UpdatePlatformSettingsPayload } from '@motoboycity/validation';
import { PrismaService } from '../../prisma/prisma.service';

const SETTINGS_ID = 'global';

// O tipo vem de `@motoboycity/types` de proposito: uma copia local aqui foi o
// que deixou o contrato compartilhado ficar para tras, expondo so a comissao
// enquanto a API ja devolvia os tres campos.
export type { PlatformSettingsItem };

@Injectable()
export class AdminPlatformSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async get(): Promise<PlatformSettingsItem> {
    const settings = await this.prisma.platformSettings.findUnique({
      where: { id: SETTINGS_ID },
      include: { updatedBy: true },
    });

    if (!settings) {
      return {
        driverCommissionPercentage: null,
        dispatchOfferTimeoutSeconds: null,
        returnProximityRadiusMeters: null,
        updatedBy: null,
        updatedAt: null,
      };
    }

    return this.toItem(settings);
  }

  async update(
    payload: UpdatePlatformSettingsPayload,
    updatedByUserId: string,
  ): Promise<PlatformSettingsItem> {
    const settings = await this.prisma.platformSettings.upsert({
      where: { id: SETTINGS_ID },
      update: {
        ...(payload.driverCommissionPercentage !== undefined && {
          driverCommissionPercentage: payload.driverCommissionPercentage,
        }),
        ...(payload.dispatchOfferTimeoutSeconds !== undefined && {
          dispatchOfferTimeoutSeconds: payload.dispatchOfferTimeoutSeconds,
        }),
        ...(payload.returnProximityRadiusMeters !== undefined && {
          returnProximityRadiusMeters: payload.returnProximityRadiusMeters,
        }),
        updatedByUserId,
      },
      create: {
        id: SETTINGS_ID,
        driverCommissionPercentage: payload.driverCommissionPercentage,
        dispatchOfferTimeoutSeconds: payload.dispatchOfferTimeoutSeconds,
        returnProximityRadiusMeters: payload.returnProximityRadiusMeters,
        updatedByUserId,
      },
      include: { updatedBy: true },
    });

    return this.toItem(settings);
  }

  private toItem(settings: {
    driverCommissionPercentage: { toString(): string } | null;
    dispatchOfferTimeoutSeconds: number | null;
    returnProximityRadiusMeters: number | null;
    updatedBy: { id: string; name: string } | null;
    updatedAt: Date;
  }): PlatformSettingsItem {
    return {
      driverCommissionPercentage:
        settings.driverCommissionPercentage === null
          ? null
          : Number(settings.driverCommissionPercentage),
      dispatchOfferTimeoutSeconds: settings.dispatchOfferTimeoutSeconds,
      returnProximityRadiusMeters: settings.returnProximityRadiusMeters,
      updatedBy: settings.updatedBy
        ? { id: settings.updatedBy.id, name: settings.updatedBy.name }
        : null,
      updatedAt: settings.updatedAt.toISOString(),
    };
  }
}
