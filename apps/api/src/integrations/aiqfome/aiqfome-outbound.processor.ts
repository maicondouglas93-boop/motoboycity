import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { INTEGRATION_OUTBOUND_QUEUE } from '../integration-events.module';
import {
  AiqfomeOutboundService,
  SCAN_INTEGRATION_OUTBOX_JOB,
  SEND_INTEGRATION_OUTBOX_JOB,
} from './aiqfome-outbound.service';

@Processor(INTEGRATION_OUTBOUND_QUEUE)
export class AiqfomeOutboundProcessor extends WorkerHost {
  constructor(private readonly outbound: AiqfomeOutboundService) {
    super();
  }

  async process(job: Job<{ eventId?: string }>): Promise<void> {
    if (job.name === SCAN_INTEGRATION_OUTBOX_JOB) {
      await this.outbound.enqueuePending();
      return;
    }
    if (job.name === SEND_INTEGRATION_OUTBOX_JOB && job.data.eventId) {
      await this.outbound.send(job.data.eventId);
    }
  }
}
