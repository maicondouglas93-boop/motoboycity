import { ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import type { DriverAvailability, User } from '@prisma/client';
import { DispatchService } from '../dispatch/dispatch.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { PrismaService } from '../prisma/prisma.service';

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
  ) {}

  async get(user: User): Promise<DriverPresenceItem> {
    const driver = await this.findDriverForUser(user);
    return this.buildItem(driver.id, driver.availability);
  }

  async setAvailability(user: User, availability: DriverAvailability): Promise<DriverPresenceItem> {
    const driver = await this.findDriverForUser(user);

    if (availability === 'AVAILABLE') {
      if (driver.approvalStatus !== 'APPROVED') {
        throw new ForbiddenException('Motoboy precisa estar aprovado para ficar disponível.');
      }
      if (driver.accountStatus !== 'ACTIVE') {
        throw new ForbiddenException('Motoboy precisa estar com a conta ativa para ficar disponível.');
      }
    }

    if (driver.availability === availability) {
      throw new ConflictException(
        `Motoboy já está ${availability === 'AVAILABLE' ? 'disponível' : 'indisponível'}.`,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.driver.update({ where: { id: driver.id }, data: { availability } });

      if (availability === 'AVAILABLE') {
        await tx.driverPresenceLog.create({ data: { driverId: driver.id, wentOnlineAt: new Date() } });
      } else {
        await tx.driverPresenceLog.updateMany({
          where: { driverId: driver.id, wentOfflineAt: null },
          data: { wentOfflineAt: new Date() },
        });
      }
    });

    this.realtimeGateway.emitAdminActivity(
      `Um motoboy ficou ${availability === 'AVAILABLE' ? 'online' : 'offline'}.`,
    );

    if (availability === 'AVAILABLE') {
      await this.dispatchService.dispatchAvailableDeliveries();
    }

    return this.buildItem(driver.id, availability);
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

  private async buildItem(
    driverId: string,
    availability: DriverAvailability,
  ): Promise<DriverPresenceItem> {
    if (availability !== 'AVAILABLE') {
      return { availability, since: null };
    }

    const openLog = await this.prisma.driverPresenceLog.findFirst({
      where: { driverId, wentOfflineAt: null },
      orderBy: { wentOnlineAt: 'desc' },
    });

    return { availability, since: openLog?.wentOnlineAt.toISOString() ?? null };
  }
}
