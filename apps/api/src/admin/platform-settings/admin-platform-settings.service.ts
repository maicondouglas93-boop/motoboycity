import { Injectable } from '@nestjs/common';
import type { UpdatePlatformSettingsPayload } from '@motoboycity/validation';
import { PrismaService } from '../../prisma/prisma.service';

const SETTINGS_ID = 'global';

export interface PlatformSettingsItem {
  driverCommissionPercentage: number | null;
  updatedBy: { id: string; name: string } | null;
  updatedAt: string | null;
}

@Injectable()
export class AdminPlatformSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async get(): Promise<PlatformSettingsItem> {
    const settings = await this.prisma.platformSettings.findUnique({
      where: { id: SETTINGS_ID },
      include: { updatedBy: true },
    });

    if (!settings) {
      return { driverCommissionPercentage: null, updatedBy: null, updatedAt: null };
    }

    return {
      driverCommissionPercentage:
        settings.driverCommissionPercentage === null
          ? null
          : Number(settings.driverCommissionPercentage),
      updatedBy: settings.updatedBy
        ? { id: settings.updatedBy.id, name: settings.updatedBy.name }
        : null,
      updatedAt: settings.updatedAt.toISOString(),
    };
  }

  async update(
    payload: UpdatePlatformSettingsPayload,
    updatedByUserId: string,
  ): Promise<PlatformSettingsItem> {
    const settings = await this.prisma.platformSettings.upsert({
      where: { id: SETTINGS_ID },
      update: { driverCommissionPercentage: payload.driverCommissionPercentage, updatedByUserId },
      create: {
        id: SETTINGS_ID,
        driverCommissionPercentage: payload.driverCommissionPercentage,
        updatedByUserId,
      },
      include: { updatedBy: true },
    });

    return {
      driverCommissionPercentage: Number(settings.driverCommissionPercentage),
      updatedBy: settings.updatedBy
        ? { id: settings.updatedBy.id, name: settings.updatedBy.name }
        : null,
      updatedAt: settings.updatedAt.toISOString(),
    };
  }
}
