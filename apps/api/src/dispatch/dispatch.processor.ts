import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { ACTIVATE_SCHEDULED_JOB, DISPATCH_QUEUE, DispatchService, OFFER_EXPIRE_JOB } from './dispatch.service';

@Processor(DISPATCH_QUEUE)
export class DispatchProcessor extends WorkerHost {
  private readonly logger = new Logger(DispatchProcessor.name);

  constructor(private readonly dispatchService: DispatchService) {
    super();
  }

  async process(job: Job): Promise<void> {
    switch (job.name) {
      case OFFER_EXPIRE_JOB:
        await this.dispatchService.handleOfferExpired(job.data.offerId as string);
        return;
      case ACTIVATE_SCHEDULED_JOB:
        await this.dispatchService.handleScheduledActivation(job.data.deliveryId as string);
        return;
      default:
        this.logger.warn(`Job desconhecido na fila de despacho: ${job.name}`);
    }
  }
}
