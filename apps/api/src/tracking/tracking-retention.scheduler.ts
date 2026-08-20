import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, OnModuleInit } from '@nestjs/common';
import type { Queue } from 'bullmq';
import {
  PURGE_EXPIRED_LOCATION_POINTS_JOB,
  TRACKING_QUEUE,
} from './tracking-retention.processor';
import { DeliveryTrackingService } from './delivery-tracking.service';

/** Mantém apenas os últimos 30 dias de pontos brutos de GPS. */
@Injectable()
export class TrackingRetentionScheduler implements OnModuleInit {
  constructor(
    @InjectQueue(TRACKING_QUEUE) private readonly trackingQueue: Queue,
    private readonly deliveryTrackingService: DeliveryTrackingService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.trackingQueue.upsertJobScheduler(
      'daily-location-history-retention',
      { pattern: '0 3 * * *', tz: 'America/Sao_Paulo' },
      { name: PURGE_EXPIRED_LOCATION_POINTS_JOB, data: {} },
    );
    await this.deliveryTrackingService.purgeExpiredPoints();
  }
}
