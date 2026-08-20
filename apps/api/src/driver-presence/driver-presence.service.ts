import {
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import type {
  DriverPresenceHeartbeatPayload,
  SetDriverPresencePayload,
} from '@motoboycity/validation';
import type { DriverAvailability, User } from '@prisma/client';
import { DispatchService } from '../dispatch/dispatch.service';
import { LiveDriverPresenceService } from '../live-presence/live-driver-presence.service';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';

export interface DriverPresenceItem {
  availability: DriverAvailability;
  since: string | null;
}

@Injectable()
export class DriverPresenceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dispatchService: DispatchService,
    private readonly realtimeGateway: RealtimeGateway,
    private readonly livePresence: LiveDriverPresenceService,
  ) {}

  async get(user: User): Promise<DriverPresenceItem> {
    let driver = await this.findDriverForUser(user);
    if (driver.availability === 'AVAILABLE' && !(await this.livePresence.isLive(driver.id))) {
      await this.livePresence.reconcileExpired();
      driver = await this.findDriverForUser(user);
    }
    return this.buildItem(driver.id, driver.availability);
  }

  async setAvailability(user: User, payload: SetDriverPresencePayload): Promise<DriverPresenceItem> {
    const driver = await this.findDriverForUser(user);

    if (payload.availability === 'AVAILABLE') {
      if (driver.approvalStatus !== 'APPROVED') {
        throw new ForbiddenException('Motoboy precisa estar aprovado para ficar disponível.');
      }
      if (driver.accountStatus !== 'ACTIVE') {
        throw new ForbiddenException('Motoboy precisa estar com a conta ativa para ficar disponível.');
      }
      const now = new Date();
      try {
        await this.livePresence.upsert({
          driverId: driver.id,
          lat: payload.location.lat,
          lng: payload.location.lng,
          accuracy: payload.location.accuracy ?? 0,
          capturedAt: now.toISOString(),
          appVersion: payload.appVersion,
        });
        await this.prisma.$transaction(async (tx) => {
          await tx.driver.update({
            where: { id: driver.id },
            data: {
              availability: 'AVAILABLE',
              lastKnownLat: payload.location.lat,
              lastKnownLng: payload.location.lng,
              lastSeenAt: now,
              appVersion: payload.appVersion,
            },
          });
          const openLog = await tx.driverPresenceLog.findFirst({
            where: { driverId: driver.id, wentOfflineAt: null },
          });
          if (!openLog) {
            await tx.driverPresenceLog.create({ data: { driverId: driver.id, wentOnlineAt: now } });
          }
        });
      } catch (error) {
        await this.livePresence.remove(driver.id).catch(() => undefined);
        await this.prisma.$transaction([
          this.prisma.driver.update({
            where: { id: driver.id },
            data: { availability: 'UNAVAILABLE' },
          }),
          this.prisma.driverPresenceLog.updateMany({
            where: { driverId: driver.id, wentOfflineAt: null },
            data: { wentOfflineAt: now },
          }),
        ]);
        throw new ServiceUnavailableException(
          'Não foi possível iniciar o compartilhamento de localização.',
          { cause: error },
        );
      }

      this.emitPresence(driver.id, 'AVAILABLE', now);
      await this.dispatchService.dispatchAvailableDeliveries();
      return this.buildItem(driver.id, 'AVAILABLE');
    }

    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.driver.update({
        where: { id: driver.id },
        data: { availability: 'UNAVAILABLE' },
      }),
      this.prisma.driverPresenceLog.updateMany({
        where: { driverId: driver.id, wentOfflineAt: null },
        data: { wentOfflineAt: now },
      }),
    ]);
    await this.livePresence.remove(driver.id);
    this.emitPresence(driver.id, 'UNAVAILABLE', now);
    return { availability: 'UNAVAILABLE', since: null };
  }

  async heartbeat(
    user: User,
    payload: DriverPresenceHeartbeatPayload,
  ): Promise<DriverPresenceItem> {
    const driver = await this.findDriverForUser(user);
    if (
      driver.availability !== 'AVAILABLE' ||
      driver.approvalStatus !== 'APPROVED' ||
      driver.accountStatus !== 'ACTIVE'
    ) {
      throw new ForbiddenException('O motoboy precisa estar disponível e ativo para enviar GPS.');
    }
    const now = new Date();
    await this.livePresence.upsert({
      driverId: driver.id,
      lat: payload.lat,
      lng: payload.lng,
      accuracy: payload.accuracy ?? 0,
      capturedAt: now.toISOString(),
      appVersion: payload.appVersion,
    });
    await this.prisma.driver.update({
      where: { id: driver.id },
      data: {
        lastKnownLat: payload.lat,
        lastKnownLng: payload.lng,
        lastSeenAt: now,
        appVersion: payload.appVersion,
      },
    });
    this.realtimeGateway.emitDriverLocation({
      driverId: driver.id,
      lat: payload.lat,
      lng: payload.lng,
      accuracy: payload.accuracy ?? null,
      capturedAt: now.toISOString(),
    });
    return this.buildItem(driver.id, 'AVAILABLE');
  }

  private async findDriverForUser(user: User) {
    if (user.type !== 'DRIVER') {
      throw new ForbiddenException('Acesso restrito a entregadores.');
    }
    const driver = await this.prisma.driver.findUnique({ where: { userId: user.id } });
    if (!driver) {
      throw new ForbiddenException('Usuário não está vinculado a um cadastro de motoboy.');
    }
    return driver;
  }

  private emitPresence(
    driverId: string,
    availability: DriverAvailability,
    at: Date,
  ): void {
    this.realtimeGateway.emitDriverPresence({
      driverId,
      availability,
      at: at.toISOString(),
    });
    this.realtimeGateway.emitAdminActivity({
      type: availability === 'AVAILABLE' ? 'DRIVER_ONLINE' : 'DRIVER_OFFLINE',
      message: `Um motoboy ficou ${availability === 'AVAILABLE' ? 'online' : 'offline'}.`,
      driverId,
    });
  }

  private async buildItem(
    driverId: string,
    availability: DriverAvailability,
  ): Promise<DriverPresenceItem> {
    if (availability !== 'AVAILABLE') return { availability, since: null };
    const openLog = await this.prisma.driverPresenceLog.findFirst({
      where: { driverId, wentOfflineAt: null },
      orderBy: { wentOnlineAt: 'desc' },
    });
    return { availability, since: openLog?.wentOnlineAt.toISOString() ?? null };
  }
}
