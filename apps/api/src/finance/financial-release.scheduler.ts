import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { Queue } from 'bullmq';
import {
  CLOSE_COMPANY_INVOICES_JOB,
  FINANCE_QUEUE,
  RELEASE_DRIVER_REPASSES_JOB,
} from './financial-payout.processor';
import { FinancialPayoutService } from './financial-payout.service';
import { InvoiceService } from './invoice.service';

/** Agenda repasses semanais e processa as politicas de faturamento diariamente. */
@Injectable()
export class FinancialReleaseScheduler implements OnModuleInit {
  private readonly logger = new Logger(FinancialReleaseScheduler.name);

  constructor(
    @InjectQueue(FINANCE_QUEUE) private readonly financeQueue: Queue,
    private readonly financialPayoutService: FinancialPayoutService,
    private readonly invoiceService: InvoiceService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.financeQueue.upsertJobScheduler(
      'weekly-driver-repasse-release',
      { pattern: '0 0 * * 1', tz: 'America/Sao_Paulo' },
      { name: RELEASE_DRIVER_REPASSES_JOB, data: {} },
    );
    await this.financeQueue.removeJobScheduler('weekly-company-invoice-close');
    await this.financeQueue.upsertJobScheduler(
      'daily-company-billing',
      { pattern: '5 0 * * *', tz: 'America/Sao_Paulo' },
      { name: CLOSE_COMPANY_INVOICES_JOB, data: {} },
    );
    const released = await this.financialPayoutService.releaseDueRepasses();
    if (released > 0) {
      this.logger.log(`${released} repasse(s) atrasado(s) liberado(s) na inicialização.`);
    }
    const billing = await this.invoiceService.processScheduledBilling();
    if (billing.invoices.length > 0) {
      this.logger.log(`${billing.invoices.length} fatura(s) fechada(s) na inicialização.`);
    }
    if (billing.blockedCompanyIds.length > 0) {
      this.logger.warn(
        `${billing.blockedCompanyIds.length} empresa(s) bloqueada(s) por inadimplencia na inicialização.`,
      );
    }
  }
}
