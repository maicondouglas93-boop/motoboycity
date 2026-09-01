import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';
import {
  buildRedisConnectionOptions,
  describeRedisTarget,
  type RedisConnectionOptions,
} from '../common/redis-connection';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';

export const DRIVER_PRESENCE_TTL_SECONDS = 150;
const DRIVER_PRESENCE_INDEX = 'motoboycity:driver-presence:active';
const DRIVER_DISPATCH_ORDER_INDEX = 'motoboycity:driver-dispatch-order';
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
  private readonly connectionOptions: RedisConnectionOptions;

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtimeGateway: RealtimeGateway,
  ) {
    this.connectionOptions = buildRedisConnectionOptions();
    this.redis = new Redis({
      ...this.connectionOptions,
      lazyConnect: true,
      maxRetriesPerRequest: 2,
    });
  }

  async onModuleInit(): Promise<void> {
    this.logger.log(`Conectando ao Redis em ${describeRedisTarget(this.connectionOptions)}`);
    await this.redis.connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis.quit();
  }

  /** Reutiliza a conexao existente; readiness nao abre outro cliente Redis. */
  async ping(): Promise<void> {
    await this.redis.ping();
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
    await this.redis
      .multi()
      .del(this.key(driverId))
      .zrem(DRIVER_PRESENCE_INDEX, driverId)
      .zrem(DRIVER_DISPATCH_ORDER_INDEX, driverId)
      .exec();
  }

  async get(driverId: string): Promise<LiveDriverSnapshot | null> {
    const value = await this.redis.get(this.key(driverId));
    if (!value) {
      await this.redis
        .multi()
        .zrem(DRIVER_PRESENCE_INDEX, driverId)
        .zrem(DRIVER_DISPATCH_ORDER_INDEX, driverId)
        .exec();
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

  /**
   * Ordena apenas os candidatos recebidos pela prioridade operacional global.
   *
   * A lista-base vem do banco em `wentOnlineAt ASC`, portanto continua sendo
   * o fallback justo quando o Redis esta vazio. Motoboys novos sao anexados ao
   * fim sem mover quem ja estava aguardando, e filtros de regiao/modalidade do
   * dispatch apenas removem incompatíveis preservando a ordem relativa.
   */
  async orderForDispatch(driverIds: string[]): Promise<string[]> {
    const uniqueDriverIds = [...new Set(driverIds)];
    if (uniqueDriverIds.length === 0) return [];

    const storedDriverIds = await this.redis.zrange(DRIVER_DISPATCH_ORDER_INDEX, 0, -1);
    const candidateIds = new Set(uniqueDriverIds);
    const storedCandidates = storedDriverIds.filter((driverId) => candidateIds.has(driverId));
    const storedCandidateIds = new Set(storedCandidates);
    const missingDriverIds = uniqueDriverIds.filter(
      (driverId) => !storedCandidateIds.has(driverId),
    );

    if (missingDriverIds.length > 0) {
      const tail = await this.redis.zrevrange(DRIVER_DISPATCH_ORDER_INDEX, 0, 0, 'WITHSCORES');
      let nextScore = Number(tail[1] ?? -1) + 1;
      const transaction = this.redis.multi();
      for (const driverId of missingDriverIds) {
        transaction.zadd(DRIVER_DISPATCH_ORDER_INDEX, nextScore, driverId);
        nextScore += 1;
      }
      await transaction.exec();
    }

    return [...storedCandidates, ...missingDriverIds];
  }

  /** Substitui a ordem dos motoboys online sem tocar em ofertas ja emitidas. */
  async replaceDispatchOrder(driverIds: string[]): Promise<void> {
    const uniqueDriverIds = [...new Set(driverIds)];
    const transaction = this.redis.multi().del(DRIVER_DISPATCH_ORDER_INDEX);
    uniqueDriverIds.forEach((driverId, index) => {
      transaction.zadd(DRIVER_DISPATCH_ORDER_INDEX, index, driverId);
    });
    await transaction.exec();
  }

  /** Consome a vez atual e recoloca o motoboy no fim da fila circular. */
  async moveToDispatchTail(driverId: string): Promise<void> {
    await this.redis.zadd(DRIVER_DISPATCH_ORDER_INDEX, Date.now(), driverId);
    this.realtimeGateway.emitDispatchQueueUpdated({
      driverId,
      movedToTailAt: new Date().toISOString(),
    });
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
        // Revalida também o relógio: um heartbeat pode chegar depois do
        // findMany acima e antes deste update. Nesse caso ele vence a corrida
        // e a presença nova não pode ser sobrescrita como indisponível.
        where: {
          id: driver.id,
          availability: 'AVAILABLE',
          OR: [{ lastSeenAt: null }, { lastSeenAt: { lt: staleBefore } }],
        },
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
      this.realtimeGateway.emitToDriver(driver.id, 'driver:presence-expired', {
        reason: 'HEARTBEAT_EXPIRED',
        at: now.toISOString(),
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
