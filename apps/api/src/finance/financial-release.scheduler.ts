import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { Queue } from 'bullmq';
import {
  FINANCE_QUEUE,
  RELEASE_DRIVER_REPASSES_JOB,
} from './financial-payout.processor';
import { FinancialPayoutService } from './financial-payout.service';

/** Agenda e recupera a liberação semanal, de forma idempotente. */
@Injectable()
export class FinancialReleaseScheduler implements OnModuleInit {
  private readonly logger = new Logger(FinancialReleaseScheduler.name);

  constructor(
    @InjectQueue(FINANCE_QUEUE) private readonly financeQueue: Queue,
    private readonly financialPayoutService: FinancialPayoutService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.financeQueue.upsertJobScheduler(
      'weekly-driver-repasse-release',
      { pattern: '0 0 * * 1', tz: 'America/Sao_Paulo' },
      { name: RELEASE_DRIVER_REPASSES_JOB, data: {} },
    );
    const released = await this.financialPayoutService.releaseDueRepasses();
    if (released > 0) {
      this.logger.log(`${released} repasse(s) atrasado(s) liberado(s) na inicialização.`);
    }
  }
}
