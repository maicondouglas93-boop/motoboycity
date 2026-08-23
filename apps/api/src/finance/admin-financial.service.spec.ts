import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { AdminFinancialService } from './admin-financial.service';
import { InvoiceService } from './invoice.service';

/** Um agregado do Prisma, no formato que o service consome. */
function agregado(count: number, total: number | null) {
  return { _count: { _all: count }, _sum: { totalValue: total } };
}

describe('AdminFinancialService.cashPosition', () => {
  let service: AdminFinancialService;
  let prisma: {
    delivery: { aggregate: jest.Mock };
    invoice: { aggregate: jest.Mock };
    walletTransaction: { groupBy: jest.Mock };
  };
  let invoiceService: { refreshOverdueInvoices: jest.Mock };

  beforeEach(async () => {
    prisma = {
      delivery: { aggregate: jest.fn().mockResolvedValue(agregado(0, null)) },
      invoice: { aggregate: jest.fn().mockResolvedValue(agregado(0, null)) },
      walletTransaction: { groupBy: jest.fn().mockResolvedValue([]) },
    };
    invoiceService = { refreshOverdueInvoices: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminFinancialService,
        { provide: PrismaService, useValue: prisma },
        { provide: InvoiceService, useValue: invoiceService },
      ],
    }).compile();

    service = module.get(AdminFinancialService);
  });

  it('atualiza o vencimento das faturas antes de somar', async () => {
    // "Vencida" e status ARMAZENADO. Sem este passo, uma fatura que venceu
    // ontem ainda estaria PENDING e o caixa mostraria zero atrasado com
    // dinheiro atrasado de verdade.
    await service.cashPosition();

    expect(invoiceService.refreshOverdueInvoices).toHaveBeenCalled();
  });

  it('conta como "sem fatura" só entrega concluída, faturada e sem fatura', async () => {
    await service.cashPosition();

    const where = prisma.delivery.aggregate.mock.calls[0]?.[0]?.where;
    expect(where).toEqual({
      status: 'COMPLETED',
      // Pedido pago online nunca vira fatura, entao nunca seria "sem fatura":
      // entraria como divida que nao existe.
      paymentMethod: 'BILLED',
      invoiceId: null,
    });
    // Nenhum filtro de data: e posicao de caixa, nao relatorio de periodo.
    expect(where.statusChangedAt).toBeUndefined();
  });

  it('soma os três componentes no total a receber', async () => {
    prisma.delivery.aggregate.mockResolvedValue(agregado(12, 300.5));
    prisma.invoice.aggregate
      .mockResolvedValueOnce(agregado(2, 100.25)) // a vencer
      .mockResolvedValueOnce(agregado(1, 50.25)); // vencidas

    const caixa = await service.cashPosition();

    expect(caixa.unbilledValue).toBe(300.5);
    expect(caixa.unbilledCount).toBe(12);
    expect(caixa.invoicesDueValue).toBe(100.25);
    expect(caixa.invoicesOverdueValue).toBe(50.25);
    expect(caixa.totalReceivable).toBe(451);
  });

  it('sem nada lançado, devolve zero em vez de nulo', async () => {
    // Agregado do Prisma devolve `null` quando nao ha linha nenhuma, e null
    // vazando ate a tela viraria "R$ NaN".
    const caixa = await service.cashPosition();

    expect(caixa).toEqual({
      unbilledValue: 0,
      unbilledCount: 0,
      invoicesDueValue: 0,
      invoicesDueCount: 0,
      invoicesOverdueValue: 0,
      invoicesOverdueCount: 0,
      totalReceivable: 0,
      driverAvailableBalance: 0,
      driverBlockedBalance: 0,
      pendingWithdrawalValue: 0,
    });
  });

  it('olha só as carteiras de motoboy', async () => {
    await service.cashPosition();

    // A carteira de empresa existe no schema mas nao e usada; misturar as duas
    // daria um numero que nao e divida com ninguem.
    expect(prisma.walletTransaction.groupBy.mock.calls[0]?.[0]?.where).toEqual({
      wallet: { driverId: { not: null } },
    });
  });

  it('deriva os saldos do ledger, não de um campo de saldo', async () => {
    prisma.walletTransaction.groupBy.mockResolvedValue([
      { type: 'CREDIT_REPASSE', status: 'RELEASED', _sum: { amount: 200 } },
      { type: 'CREDIT_REPASSE', status: 'PENDING', _sum: { amount: 80 } },
      { type: 'DEBIT_WITHDRAWAL', status: 'PENDING', _sum: { amount: 50 } },
    ]);

    const caixa = await service.cashPosition();

    expect(caixa.driverAvailableBalance).toBe(150);
    expect(caixa.driverBlockedBalance).toBe(80);
    expect(caixa.pendingWithdrawalValue).toBe(50);
  });
});
