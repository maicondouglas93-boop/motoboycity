import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import {
  AIQFOME_INBOUND_QUEUE,
  AiqfomeWebhookService,
  PROCESS_AIQFOME_INBOUND_JOB,
  SCAN_AIQFOME_INBOUND_JOB,
} from './aiqfome-webhook.service';

@Processor(AIQFOME_INBOUND_QUEUE)
export class AiqfomeInboundProcessor extends WorkerHost {
  constructor(private readonly webhookService: AiqfomeWebhookService) {
    super();
  }

  async process(job: Job<{ eventId: string }>): Promise<void> {
    if (job.name === SCAN_AIQFOME_INBOUND_JOB) {
      await this.webhookService.enqueuePending();
      return;
    }
    if (job.name !== PROCESS_AIQFOME_INBOUND_JOB) return;
    await this.webhookService.process(job.data.eventId);
  }
}
