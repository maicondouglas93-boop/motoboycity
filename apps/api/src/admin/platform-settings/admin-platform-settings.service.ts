import { Injectable } from '@nestjs/common';
import type { DriverPunishmentTrigger, PlatformSettingsItem } from '@motoboycity/types';
import type { UpdatePlatformSettingsPayload } from '@motoboycity/validation';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminAuditService } from '../audit/admin-audit.service';

const SETTINGS_ID = 'global';

// O tipo vem de `@motoboycity/types` de proposito: uma copia local aqui foi o
// que deixou o contrato compartilhado ficar para tras, expondo so a comissao
// enquanto a API ja devolvia os tres campos.
export type { PlatformSettingsItem };

@Injectable()
export class AdminPlatformSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AdminAuditService,
  ) {}

  async get(): Promise<PlatformSettingsItem> {
    const settings = await this.prisma.platformSettings.findUnique({
      where: { id: SETTINGS_ID },
      include: { updatedBy: true },
    });

    if (!settings) {
      return {
        driverCommissionPercentage: null,
        dispatchOfferTimeoutSeconds: null,
        aiqfomeDispatchDelayMinutes: null,
        pickupAssignmentTimeoutMinutes: null,
        collectionProximityRadiusMeters: null,
        returnProximityRadiusMeters: null,
        businessHoursEnabled: false,
        minMinutesBeforeCollect: null,
        minMinutesBeforeDeliver: null,
        locationSilenceAlertMinutes: null,
        slaAlertMinutesToAccept: null,
        slaAlertMinutesToCollect: null,
        slaAlertMinutesToDeliver: null,
        maxConcurrentDeliveriesPerDriver: null,
        maxDeliveriesPerBatch: null,
        deliveryProximityRadiusMeters: null,
        deferredDestinationMaxAccuracyMeters: null,
        driverPunishmentEnabled: false,
        driverPunishmentTrigger: 'DECLINED',
        driverPunishmentOfferCount: null,
        driverPunishmentMinutes: null,
        driverPunishmentIgnoreWithActiveDelivery: false,
        driverPunishmentOncePerDelivery: true,
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
    const data = {
      ...(payload.driverCommissionPercentage !== undefined && {
        driverCommissionPercentage: payload.driverCommissionPercentage,
      }),
      ...(payload.dispatchOfferTimeoutSeconds !== undefined && {
        dispatchOfferTimeoutSeconds: payload.dispatchOfferTimeoutSeconds,
      }),
      ...(payload.aiqfomeDispatchDelayMinutes !== undefined && {
        aiqfomeDispatchDelayMinutes: payload.aiqfomeDispatchDelayMinutes,
      }),
      ...(payload.pickupAssignmentTimeoutMinutes !== undefined && {
        pickupAssignmentTimeoutMinutes: payload.pickupAssignmentTimeoutMinutes,
      }),
      ...(payload.collectionProximityRadiusMeters !== undefined && {
        collectionProximityRadiusMeters: payload.collectionProximityRadiusMeters,
      }),
      ...(payload.returnProximityRadiusMeters !== undefined && {
        returnProximityRadiusMeters: payload.returnProximityRadiusMeters,
      }),
      ...(payload.businessHoursEnabled !== undefined && {
        businessHoursEnabled: payload.businessHoursEnabled,
      }),
      ...(payload.minMinutesBeforeCollect !== undefined && {
        minMinutesBeforeCollect: payload.minMinutesBeforeCollect,
      }),
      ...(payload.minMinutesBeforeDeliver !== undefined && {
        minMinutesBeforeDeliver: payload.minMinutesBeforeDeliver,
      }),
      ...(payload.locationSilenceAlertMinutes !== undefined && {
        locationSilenceAlertMinutes: payload.locationSilenceAlertMinutes,
      }),
      ...(payload.slaAlertMinutesToAccept !== undefined && {
        slaAlertMinutesToAccept: payload.slaAlertMinutesToAccept,
      }),
      ...(payload.slaAlertMinutesToCollect !== undefined && {
        slaAlertMinutesToCollect: payload.slaAlertMinutesToCollect,
      }),
      ...(payload.slaAlertMinutesToDeliver !== undefined && {
        slaAlertMinutesToDeliver: payload.slaAlertMinutesToDeliver,
      }),
      ...(payload.maxConcurrentDeliveriesPerDriver !== undefined && {
        maxConcurrentDeliveriesPerDriver: payload.maxConcurrentDeliveriesPerDriver,
      }),
      ...(payload.maxDeliveriesPerBatch !== undefined && {
        maxDeliveriesPerBatch: payload.maxDeliveriesPerBatch,
      }),
      ...(payload.deliveryProximityRadiusMeters !== undefined && {
        deliveryProximityRadiusMeters: payload.deliveryProximityRadiusMeters,
      }),
      ...(payload.deferredDestinationMaxAccuracyMeters !== undefined && {
        deferredDestinationMaxAccuracyMeters: payload.deferredDestinationMaxAccuracyMeters,
      }),
      ...(payload.driverPunishmentEnabled !== undefined && {
        driverPunishmentEnabled: payload.driverPunishmentEnabled,
      }),
      ...(payload.driverPunishmentTrigger !== undefined && {
        driverPunishmentTrigger: payload.driverPunishmentTrigger,
      }),
      ...(payload.driverPunishmentOfferCount !== undefined && {
        driverPunishmentOfferCount: payload.driverPunishmentOfferCount,
      }),
      ...(payload.driverPunishmentMinutes !== undefined && {
        driverPunishmentMinutes: payload.driverPunishmentMinutes,
      }),
      ...(payload.driverPunishmentIgnoreWithActiveDelivery !== undefined && {
        driverPunishmentIgnoreWithActiveDelivery: payload.driverPunishmentIgnoreWithActiveDelivery,
      }),
      ...(payload.driverPunishmentOncePerDelivery !== undefined && {
        driverPunishmentOncePerDelivery: payload.driverPunishmentOncePerDelivery,
      }),
      updatedByUserId,
    };

    const settings = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.platformSettings.upsert({
        where: { id: SETTINGS_ID },
        update: data,
        create: { id: SETTINGS_ID, ...data },
        include: { updatedBy: true },
      });
      const changedFields = Object.keys(payload);
      await this.audit.record(
        {
          actorUserId: updatedByUserId,
          action: 'PLATFORM_SETTINGS_UPDATED',
          entityType: 'PLATFORM_SETTINGS',
          entityId: SETTINGS_ID,
          summary: `${changedFields.length} parâmetro(s) operacional(is) atualizado(s).`,
          metadata: { changedFields },
        },
        tx,
      );
      return updated;
    });

    return this.toItem(settings);
  }

  private toItem(settings: {
    driverCommissionPercentage: { toString(): string } | null;
    dispatchOfferTimeoutSeconds: number | null;
    aiqfomeDispatchDelayMinutes: number | null;
    pickupAssignmentTimeoutMinutes: number | null;
    collectionProximityRadiusMeters: number | null;
    returnProximityRadiusMeters: number | null;
    businessHoursEnabled: boolean;
    minMinutesBeforeCollect: number | null;
    minMinutesBeforeDeliver: number | null;
    locationSilenceAlertMinutes: number | null;
    slaAlertMinutesToAccept: number | null;
    slaAlertMinutesToCollect: number | null;
    slaAlertMinutesToDeliver: number | null;
    maxConcurrentDeliveriesPerDriver: number | null;
    maxDeliveriesPerBatch: number | null;
    deliveryProximityRadiusMeters: number | null;
    deferredDestinationMaxAccuracyMeters: number | null;
    driverPunishmentEnabled: boolean;
    driverPunishmentTrigger: DriverPunishmentTrigger;
    driverPunishmentOfferCount: number | null;
    driverPunishmentMinutes: number | null;
    driverPunishmentIgnoreWithActiveDelivery: boolean;
    driverPunishmentOncePerDelivery: boolean;
    updatedBy: { id: string; name: string } | null;
    updatedAt: Date;
  }): PlatformSettingsItem {
    return {
      driverCommissionPercentage:
        settings.driverCommissionPercentage === null
          ? null
          : Number(settings.driverCommissionPercentage),
      dispatchOfferTimeoutSeconds: settings.dispatchOfferTimeoutSeconds,
      aiqfomeDispatchDelayMinutes: settings.aiqfomeDispatchDelayMinutes,
      pickupAssignmentTimeoutMinutes: settings.pickupAssignmentTimeoutMinutes,
      collectionProximityRadiusMeters: settings.collectionProximityRadiusMeters,
      returnProximityRadiusMeters: settings.returnProximityRadiusMeters,
      businessHoursEnabled: settings.businessHoursEnabled,
      minMinutesBeforeCollect: settings.minMinutesBeforeCollect,
      minMinutesBeforeDeliver: settings.minMinutesBeforeDeliver,
      locationSilenceAlertMinutes: settings.locationSilenceAlertMinutes,
      slaAlertMinutesToAccept: settings.slaAlertMinutesToAccept,
      slaAlertMinutesToCollect: settings.slaAlertMinutesToCollect,
      slaAlertMinutesToDeliver: settings.slaAlertMinutesToDeliver,
      maxConcurrentDeliveriesPerDriver: settings.maxConcurrentDeliveriesPerDriver,
      maxDeliveriesPerBatch: settings.maxDeliveriesPerBatch,
      deliveryProximityRadiusMeters: settings.deliveryProximityRadiusMeters,
      deferredDestinationMaxAccuracyMeters: settings.deferredDestinationMaxAccuracyMeters,
      driverPunishmentEnabled: settings.driverPunishmentEnabled,
      driverPunishmentTrigger: settings.driverPunishmentTrigger,
      driverPunishmentOfferCount: settings.driverPunishmentOfferCount,
      driverPunishmentMinutes: settings.driverPunishmentMinutes,
      driverPunishmentIgnoreWithActiveDelivery: settings.driverPunishmentIgnoreWithActiveDelivery,
      driverPunishmentOncePerDelivery: settings.driverPunishmentOncePerDelivery,
      updatedBy: settings.updatedBy
        ? { id: settings.updatedBy.id, name: settings.updatedBy.name }
        : null,
      updatedAt: settings.updatedAt.toISOString(),
    };
  }
}
