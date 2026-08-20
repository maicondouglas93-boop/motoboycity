import type { Queue } from 'bullmq';
import { FinancialPayoutService } from './financial-payout.service';
import { FinancialReleaseScheduler } from './financial-release.scheduler';
import { InvoiceService } from './invoice.service';

describe('FinancialReleaseScheduler', () => {
  const queue = { upsertJobScheduler: jest.fn() };
  const payoutService = { releaseDueRepasses: jest.fn() };
  const invoiceService = { closeScheduledInvoices: jest.fn() };
  const scheduler = new FinancialReleaseScheduler(
    queue as unknown as Queue,
    payoutService as unknown as FinancialPayoutService,
    invoiceService as unknown as InvoiceService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    queue.upsertJobScheduler.mockResolvedValue(undefined);
    payoutService.releaseDueRepasses.mockResolvedValue(0);
    invoiceService.closeScheduledInvoices.mockResolvedValue([]);
  });

  it('agenda repasses às 00:00 e faturas às 00:05 no fuso operacional', async () => {
    await scheduler.onModuleInit();

    expect(queue.upsertJobScheduler).toHaveBeenNthCalledWith(
      1,
      'weekly-driver-repasse-release',
      { pattern: '0 0 * * 1', tz: 'America/Sao_Paulo' },
      { name: 'release-driver-repasses', data: {} },
    );
    expect(queue.upsertJobScheduler).toHaveBeenNthCalledWith(
      2,
      'weekly-company-invoice-close',
      { pattern: '5 0 * * 1', tz: 'America/Sao_Paulo' },
      { name: 'close-company-invoices', data: {} },
    );
    expect(payoutService.releaseDueRepasses).toHaveBeenCalledTimes(1);
    expect(invoiceService.closeScheduledInvoices).toHaveBeenCalledTimes(1);
  });
});
