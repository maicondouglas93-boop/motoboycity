import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { FinancialPayoutService } from './financial-payout.service';
import { InvoiceService } from './invoice.service';

export const FINANCE_QUEUE = 'finance';
export const RELEASE_DRIVER_REPASSES_JOB = 'release-driver-repasses';
export const CLOSE_COMPANY_INVOICES_JOB = 'close-company-invoices';

@Processor(FINANCE_QUEUE)
export class FinancialPayoutProcessor extends WorkerHost {
  private readonly logger = new Logger(FinancialPayoutProcessor.name);

  constructor(
    private readonly financialPayoutService: FinancialPayoutService,
    private readonly invoiceService: InvoiceService,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name === RELEASE_DRIVER_REPASSES_JOB) {
      await this.financialPayoutService.releaseDueRepasses(undefined, {
        includeLegacyWithoutReleaseAt: true,
      });
      return;
    }
    if (job.name === CLOSE_COMPANY_INVOICES_JOB) {
      await this.invoiceService.processScheduledBilling();
      return;
    }
    this.logger.warn(`Job financeiro desconhecido: ${job.name}`);
  }
}
