import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';

export const DRIVER_PRESENCE_TTL_SECONDS = 150;
const DRIVER_PRESENCE_INDEX = 'motoboycity:driver-presence:active';
const DRIVER_PRESENCE_KEY_PREFIX = 'motoboycity:driver-presence:';

export interface LiveDriverSnapshot {
  driverId: string;
  lat: number;
  lng: number;
  accuracy: number;
  capturedAt: string;
  appVersion: string;
}

@Injectable()
export class LiveDriverPresenceService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LiveDriverPresenceService.name);
  private readonly redis: Redis;

  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly realtimeGateway: RealtimeGateway,
  ) {
    this.redis = new Redis({
      host: config.get<string>('REDIS_HOST', 'localhost'),
      port: config.get<number>('REDIS_PORT', 6379),
      lazyConnect: true,
      maxRetriesPerRequest: 2,
    });
  }

  async onModuleInit(): Promise<void> {
    await this.redis.connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis.quit();
  }

  async upsert(snapshot: LiveDriverSnapshot): Promise<void> {
    const expiresAt = Date.now() + DRIVER_PRESENCE_TTL_SECONDS * 1000;
    await this.redis
      .multi()
      .set(this.key(snapshot.driverId), JSON.stringify(snapshot), 'EX', DRIVER_PRESENCE_TTL_SECONDS)
      .zadd(DRIVER_PRESENCE_INDEX, expiresAt, snapshot.driverId)
      .exec();
  }

  async remove(driverId: string): Promise<void> {
    await this.redis.multi().del(this.key(driverId)).zrem(DRIVER_PRESENCE_INDEX, driverId).exec();
  }

  async get(driverId: string): Promise<LiveDriverSnapshot | null> {
    const value = await this.redis.get(this.key(driverId));
    if (!value) {
      await this.redis.zrem(DRIVER_PRESENCE_INDEX, driverId);
      return null;
    }
    try {
      return JSON.parse(value) as LiveDriverSnapshot;
    } catch {
      await this.remove(driverId);
      return null;
    }
  }

  async isLive(driverId: string): Promise<boolean> {
    return (await this.get(driverId)) !== null;
  }

  async listActive(): Promise<LiveDriverSnapshot[]> {
    const now = Date.now();
    await this.redis.zremrangebyscore(DRIVER_PRESENCE_INDEX, '-inf', now);
    const driverIds = await this.redis.zrange(DRIVER_PRESENCE_INDEX, 0, -1);
    const snapshots = await Promise.all(driverIds.map((driverId) => this.get(driverId)));
    return snapshots.filter((snapshot): snapshot is LiveDriverSnapshot => snapshot !== null);
  }

  async reconcileExpired(): Promise<number> {
    const staleBefore = new Date(Date.now() - DRIVER_PRESENCE_TTL_SECONDS * 1000);
    const candidates = await this.prisma.driver.findMany({
      where: {
        availability: 'AVAILABLE',
        OR: [{ lastSeenAt: null }, { lastSeenAt: { lt: staleBefore } }],
      },
      select: { id: true, user: { select: { name: true } } },
    });
    let reconciled = 0;
    for (const driver of candidates) {
      if (await this.isLive(driver.id)) continue;
      const now = new Date();
      const update = await this.prisma.driver.updateMany({
        where: { id: driver.id, availability: 'AVAILABLE' },
        data: { availability: 'UNAVAILABLE' },
      });
      if (update.count === 0) continue;
      await this.prisma.driverPresenceLog.updateMany({
        where: { driverId: driver.id, wentOfflineAt: null },
        data: { wentOfflineAt: now },
      });
      await this.remove(driver.id);
      this.realtimeGateway.emitDriverPresence({
        driverId: driver.id,
        availability: 'UNAVAILABLE',
        at: now.toISOString(),
        reason: 'HEARTBEAT_EXPIRED',
      });
      this.realtimeGateway.emitAdminActivity({
        type: 'DRIVER_OFFLINE',
        message: `${driver.user.name} ficou offline por perda de localização.`,
        driverId: driver.id,
        driverName: driver.user.name,
      });
      reconciled += 1;
    }
    if (reconciled > 0) this.logger.log(`${reconciled} presença(s) expirada(s) reconciliada(s).`);
    return reconciled;
  }

  private key(driverId: string): string {
    return `${DRIVER_PRESENCE_KEY_PREFIX}${driverId}`;
  }
}
