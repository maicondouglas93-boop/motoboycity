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

  /**
   * Estes dois testes existem por causa de um deploy real: em 31/08/2026 a
   * liberação de repasses estourou `P2028` (transação expirada) contra o Neon,
   * o erro subiu pelo `onModuleInit`, o Nest abortou o bootstrap e o processo
   * saiu com código 1. O Render registrou "No open ports detected" e o deploy
   * falhou inteiro.
   *
   * A recuperação do atraso é rede de segurança — os jobs agendados fazem o
   * mesmo trabalho. Rede de segurança que derruba a casa não é rede.
   */
  it('sobe mesmo se a liberação de repasses falhar', async () => {
    payoutService.releaseDueRepasses.mockRejectedValue(new Error('P2028'));

    await expect(scheduler.onModuleInit()).resolves.toBeUndefined();

    // E o faturamento ainda é tentado: uma falha não cancela a outra tarefa.
    expect(invoiceService.processScheduledBilling).toHaveBeenCalledTimes(1);
  });

  it('sobe mesmo se o faturamento falhar', async () => {
    invoiceService.processScheduledBilling.mockRejectedValue(new Error('P2028'));

    await expect(scheduler.onModuleInit()).resolves.toBeUndefined();
  });

  /**
   * O agendamento em si continua fatal de propósito: sem ele, repasse e
   * faturamento nunca mais rodam, e falhar calado deixaria a operação sem
   * nenhum dos dois sem ninguém perceber.
   */
  it('não engole falha ao registrar os agendamentos', async () => {
    queue.upsertJobScheduler.mockRejectedValue(new Error('redis fora'));

    await expect(scheduler.onModuleInit()).rejects.toThrow('redis fora');
  });
});
