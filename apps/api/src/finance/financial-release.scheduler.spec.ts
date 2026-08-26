import type { Queue } from 'bullmq';
import { FinancialPayoutService } from './financial-payout.service';
import { FinancialReleaseScheduler } from './financial-release.scheduler';
import { InvoiceService } from './invoice.service';

describe('FinancialReleaseScheduler', () => {
  const queue = { upsertJobScheduler: jest.fn(), removeJobScheduler: jest.fn() };
  const payoutService = { releaseDueRepasses: jest.fn() };
  const invoiceService = { processScheduledBilling: jest.fn() };
  const scheduler = new FinancialReleaseScheduler(
    queue as unknown as Queue,
    payoutService as unknown as FinancialPayoutService,
    invoiceService as unknown as InvoiceService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    queue.upsertJobScheduler.mockResolvedValue(undefined);
    queue.removeJobScheduler.mockResolvedValue(false);
    payoutService.releaseDueRepasses.mockResolvedValue(0);
    invoiceService.processScheduledBilling.mockResolvedValue({
      invoices: [],
      blockedCompanyIds: [],
    });
  });

  it('agenda repasses semanais e faturamento diario no fuso operacional', async () => {
    await scheduler.onModuleInit();

    expect(queue.upsertJobScheduler).toHaveBeenNthCalledWith(
      1,
      'weekly-driver-repasse-release',
      { pattern: '0 0 * * 1', tz: 'America/Sao_Paulo' },
      { name: 'release-driver-repasses', data: {} },
    );
    expect(queue.upsertJobScheduler).toHaveBeenNthCalledWith(
      2,
      'daily-company-billing',
      { pattern: '5 0 * * *', tz: 'America/Sao_Paulo' },
      { name: 'close-company-invoices', data: {} },
    );
    expect(payoutService.releaseDueRepasses).toHaveBeenCalledTimes(1);
    expect(queue.removeJobScheduler).toHaveBeenCalledWith('weekly-company-invoice-close');
    expect(invoiceService.processScheduledBilling).toHaveBeenCalledTimes(1);
  });
});
