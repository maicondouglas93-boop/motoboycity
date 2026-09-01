import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { FinancialPayoutService } from './financial-payout.service';
import { InvoiceService } from './invoice.service';
import {
  CLOSE_COMPANY_INVOICES_JOB,
  FINANCE_QUEUE,
  RELEASE_DRIVER_REPASSES_JOB,
} from './financial-payout.constants';

export { CLOSE_COMPANY_INVOICES_JOB, FINANCE_QUEUE, RELEASE_DRIVER_REPASSES_JOB };

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
      // Além de liberar os vencidos, reconcilia `releaseAt` com o dia atual da
      // plataforma. Assim uma troca feita pelo ADM alcança créditos que já
      // estavam bloqueados para o ciclo anterior.
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
