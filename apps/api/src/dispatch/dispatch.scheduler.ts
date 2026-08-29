import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, OnModuleInit } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { DISPATCH_QUEUE, SWEEP_DISPATCH_JOB } from './dispatch.service';

/**
 * Liga a varredura periodica do despacho.
 *
 * `upsertJobScheduler` e idempotente entre reinicios e entre instancias: o
 * agendador tem nome fixo, entao subir a API duas vezes nao cria duas
 * varreduras. Um minuto e o intervalo porque a varredura so existe para
 * consertar o que um evento perdido deixou parado — ela nao e o caminho normal
 * de nenhum pedido, e o caminho normal continua sendo imediato.
 */
@Injectable()
export class DispatchScheduler implements OnModuleInit {
  constructor(@InjectQueue(DISPATCH_QUEUE) private readonly queue: Queue) {}

  async onModuleInit(): Promise<void> {
    await this.queue.upsertJobScheduler(
      'dispatch-sweep-every-minute',
      { every: 60_000 },
      { name: SWEEP_DISPATCH_JOB, data: {} },
    );
  }
}
