import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { LiveDriverPresenceService } from './live-driver-presence.service';

export const LIVE_PRESENCE_QUEUE = 'live-presence';
export const RECONCILE_DRIVER_PRESENCE_JOB = 'reconcile-driver-presence';

@Processor(LIVE_PRESENCE_QUEUE)
export class LivePresenceProcessor extends WorkerHost {
  private readonly logger = new Logger(LivePresenceProcessor.name);

  constructor(private readonly livePresence: LiveDriverPresenceService) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name !== RECONCILE_DRIVER_PRESENCE_JOB) {
      this.logger.warn(`Job de presença desconhecido: ${job.name}`);
      return;
    }
    await this.livePresence.reconcileExpired();
  }
}
