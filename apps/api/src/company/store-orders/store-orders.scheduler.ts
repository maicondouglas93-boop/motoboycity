import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, type OnModuleInit } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { STORE_ORDERS_QUEUE, SWEEP_STORE_ORDERS_JOB } from './store-orders.queue';

/**
 * Liga a varredura de minuto dos pedidos da loja online (`varrer`), como a do
 * despacho: nome fixo, então subir a API duas vezes, ou em duas instâncias, não
 * cria duas varreduras.
 */
@Injectable()
export class StoreOrdersScheduler implements OnModuleInit {
  constructor(@InjectQueue(STORE_ORDERS_QUEUE) private readonly queue: Queue) {}

  async onModuleInit(): Promise<void> {
    await this.queue.upsertJobScheduler(
      'store-orders-sweep-every-minute',
      { every: 60_000 },
      { name: SWEEP_STORE_ORDERS_JOB, data: {} },
    );
  }
}
