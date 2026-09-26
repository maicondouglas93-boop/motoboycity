import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { STORE_ORDERS_QUEUE, SWEEP_STORE_ORDERS_JOB } from './store-orders.queue';
import { StoreOrdersService } from './store-orders.service';

@Processor(STORE_ORDERS_QUEUE)
export class StoreOrdersProcessor extends WorkerHost {
  private readonly logger = new Logger(StoreOrdersProcessor.name);

  constructor(private readonly storeOrders: StoreOrdersService) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name === SWEEP_STORE_ORDERS_JOB) {
      await this.storeOrders.varrer();
      return;
    }
    this.logger.warn(`Job da loja online desconhecido: ${job.name}`);
  }
}
