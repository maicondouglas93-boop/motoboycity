import type { Job } from 'bullmq';
import {
  CLOSE_COMPANY_INVOICES_JOB,
  FinancialPayoutProcessor,
  RELEASE_DRIVER_REPASSES_JOB,
} from './financial-payout.processor';
import { FinancialPayoutService } from './financial-payout.service';
import { InvoiceService } from './invoice.service';

describe('FinancialPayoutProcessor', () => {
  const payoutService = { releaseDueRepasses: jest.fn() };
  const invoiceService = { closeScheduledInvoices: jest.fn() };
  const processor = new FinancialPayoutProcessor(
    payoutService as unknown as FinancialPayoutService,
    invoiceService as unknown as InvoiceService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    payoutService.releaseDueRepasses.mockResolvedValue(0);
    invoiceService.closeScheduledInvoices.mockResolvedValue([]);
  });

  it('executa a liberação idempotente de repasses pelo job semanal', async () => {
    await processor.process({ name: RELEASE_DRIVER_REPASSES_JOB } as Job);

    expect(payoutService.releaseDueRepasses).toHaveBeenCalledWith(undefined, {
      includeLegacyWithoutReleaseAt: true,
    });
    expect(invoiceService.closeScheduledInvoices).not.toHaveBeenCalled();
  });

  it('executa o fechamento automático de faturas pelo job semanal', async () => {
    await processor.process({ name: CLOSE_COMPANY_INVOICES_JOB } as Job);

    expect(invoiceService.closeScheduledInvoices).toHaveBeenCalledTimes(1);
    expect(payoutService.releaseDueRepasses).not.toHaveBeenCalled();
  });
});
