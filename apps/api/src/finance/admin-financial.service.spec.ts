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

describe('AdminFinancialService.receipts', () => {
  let service: AdminFinancialService;
  let prisma: { invoice: { findMany: jest.Mock } };

  /** Uma fatura quitada, no formato que o Prisma devolve. */
  function fatura(numero: string, pagoEm: string, valor: number, metodo = 'BILLED') {
    return {
      id: `inv-${numero}`,
      number: numero,
      companyId: 'empresa-1',
      totalValue: valor,
      paymentDate: new Date(pagoEm),
      paymentMethod: metodo,
      company: { tradeName: 'Drogaria Teste' },
    };
  }

  beforeEach(async () => {
    prisma = { invoice: { findMany: jest.fn().mockResolvedValue([]) } };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminFinancialService,
        { provide: PrismaService, useValue: prisma },
        { provide: InvoiceService, useValue: { refreshOverdueInvoices: jest.fn() } },
      ],
    }).compile();

    service = module.get(AdminFinancialService);
  });

  it('agrupa por dia e soma o total de cada um', async () => {
    prisma.invoice.findMany.mockResolvedValue([
      fatura('0302', '2026-08-02T15:00:00Z', 429.77),
      fatura('0315', '2026-08-02T18:00:00Z', 115.45),
      fatura('0270', '2026-08-03T14:00:00Z', 22.86),
    ]);

    const extrato = await service.receipts({ from: '2026-08-01', to: '2026-08-03', onlineOnly: false });

    expect(extrato.days).toHaveLength(2);
    // Mais recente primeiro: quem abre o extrato quer ver ontem.
    expect(extrato.days[0]?.day).toBe('2026-08-03');
    expect(extrato.days[1]?.day).toBe('2026-08-02');
    expect(extrato.days[1]?.total).toBe(545.22);
    expect(extrato.total).toBe(568.08);
  });

  it('agrupa pelo dia em SÃO PAULO, e não em UTC', async () => {
    /**
     * 03/08 às 00:30 UTC é ainda 02/08 às 21:30 em Lajinha. Agrupar por
     * `toISOString()` jogaria este recebimento para o dia seguinte, e o total do
     * dia 2 fecharia errado no fim do mês.
     */
    prisma.invoice.findMany.mockResolvedValue([fatura('0400', '2026-08-03T00:30:00Z', 100)]);

    const extrato = await service.receipts({ from: '2026-08-01', to: '2026-08-05', onlineOnly: false });

    expect(extrato.days[0]?.day).toBe('2026-08-02');
  });

  it('soma sem erro de ponto flutuante', async () => {
    // 0.1 + 0.2 em float dá 0.30000000000000004.
    prisma.invoice.findMany.mockResolvedValue([
      fatura('0500', '2026-08-02T15:00:00Z', 0.1),
      fatura('0501', '2026-08-02T16:00:00Z', 0.2),
    ]);

    const extrato = await service.receipts({ from: '2026-08-01', to: '2026-08-03', onlineOnly: false });

    expect(extrato.days[0]?.total).toBe(0.3);
  });

  it('filtra somente pagamentos online quando pedido', async () => {
    await service.receipts({ from: '2026-08-01', to: '2026-08-03', onlineOnly: true });

    expect(prisma.invoice.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ paymentMethod: 'ONLINE' }),
      }),
    );
  });

  it('ignora fatura paga sem data de pagamento em vez de derrubar o extrato', async () => {
    // Linha inconsistente no banco não pode apagar o extrato inteiro.
    prisma.invoice.findMany.mockResolvedValue([
      { ...fatura('0600', '2026-08-02T15:00:00Z', 50), paymentDate: null },
      fatura('0601', '2026-08-02T16:00:00Z', 70),
    ]);

    const extrato = await service.receipts({ from: '2026-08-01', to: '2026-08-03', onlineOnly: false });

    expect(extrato.total).toBe(70);
  });

  it('devolve vazio sem quebrar quando não houve recebimento', async () => {
    const extrato = await service.receipts({ from: '2026-08-01', to: '2026-08-03', onlineOnly: false });

    expect(extrato).toEqual({ total: 0, days: [] });
  });
});
