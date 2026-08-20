import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, OnModuleInit } from '@nestjs/common';
import type { Queue } from 'bullmq';
import {
  LIVE_PRESENCE_QUEUE,
  RECONCILE_DRIVER_PRESENCE_JOB,
} from './live-presence.processor';

@Injectable()
export class LivePresenceScheduler implements OnModuleInit {
  constructor(@InjectQueue(LIVE_PRESENCE_QUEUE) private readonly queue: Queue) {}

  async onModuleInit(): Promise<void> {
    await this.queue.upsertJobScheduler(
      'driver-presence-every-minute',
      { pattern: '* * * * *', tz: 'America/Sao_Paulo' },
      { name: RECONCILE_DRIVER_PRESENCE_JOB, data: {} },
    );
  }
}
