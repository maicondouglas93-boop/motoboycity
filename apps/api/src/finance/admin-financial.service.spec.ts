import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { AdminFinancialService } from './admin-financial.service';
import { FinancialClock } from './financial-clock.service';
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
        { provide: FinancialClock, useValue: { now: () => new Date('2026-08-23T15:00:00Z') } },
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
        { provide: FinancialClock, useValue: { now: () => new Date('2026-08-23T15:00:00Z') } },
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

    const extrato = await service.receipts({
      from: '2026-08-01',
      to: '2026-08-03',
      onlineOnly: false,
    });

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

    const extrato = await service.receipts({
      from: '2026-08-01',
      to: '2026-08-05',
      onlineOnly: false,
    });

    expect(extrato.days[0]?.day).toBe('2026-08-02');
  });

  it('soma sem erro de ponto flutuante', async () => {
    // 0.1 + 0.2 em float dá 0.30000000000000004.
    prisma.invoice.findMany.mockResolvedValue([
      fatura('0500', '2026-08-02T15:00:00Z', 0.1),
      fatura('0501', '2026-08-02T16:00:00Z', 0.2),
    ]);

    const extrato = await service.receipts({
      from: '2026-08-01',
      to: '2026-08-03',
      onlineOnly: false,
    });

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

    const extrato = await service.receipts({
      from: '2026-08-01',
      to: '2026-08-03',
      onlineOnly: false,
    });

    expect(extrato.total).toBe(70);
  });

  it('devolve vazio sem quebrar quando não houve recebimento', async () => {
    const extrato = await service.receipts({
      from: '2026-08-01',
      to: '2026-08-03',
      onlineOnly: false,
    });

    expect(extrato).toEqual({ total: 0, days: [] });
  });
});

describe('AdminFinancialService.receivablesAging', () => {
  let service: AdminFinancialService;
  let prisma: {
    delivery: { groupBy: jest.Mock };
    invoice: { groupBy: jest.Mock };
    company: { findMany: jest.Mock };
    $transaction: jest.Mock;
  };
  let invoiceService: { refreshOverdueInvoices: jest.Mock };

  beforeEach(async () => {
    prisma = {
      delivery: { groupBy: jest.fn().mockResolvedValue([]) },
      invoice: { groupBy: jest.fn().mockResolvedValue([]) },
      company: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation((callback: (tx: typeof prisma) => unknown) =>
      callback(prisma),
    );
    invoiceService = { refreshOverdueInvoices: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminFinancialService,
        { provide: PrismaService, useValue: prisma },
        { provide: InvoiceService, useValue: invoiceService },
        { provide: FinancialClock, useValue: { now: () => new Date('2026-08-23T15:00:00Z') } },
      ],
    }).compile();

    service = module.get(AdminFinancialService);
  });

  it('consulta somente dívida atual e atualiza vencimentos antes do aging', async () => {
    await service.receivablesAging();

    expect(invoiceService.refreshOverdueInvoices).toHaveBeenCalledTimes(1);
    expect(prisma.delivery.groupBy.mock.calls[0]?.[0]?.where).toEqual({
      status: 'COMPLETED',
      paymentMethod: 'BILLED',
      invoiceId: null,
    });
    expect(prisma.invoice.groupBy.mock.calls[0]?.[0]?.where).toEqual({
      status: { in: ['PENDING', 'OVERDUE'] },
    });
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'RepeatableRead',
    });
  });

  it('separa as faixas sem dupla contagem e consolida por empresa', async () => {
    prisma.delivery.groupBy.mockResolvedValue([
      {
        companyId: 'empresa-1',
        _count: { _all: 2 },
        _sum: { totalValue: 150.5 },
        _min: { statusChangedAt: new Date('2026-08-13T15:00:00Z') },
      },
      {
        companyId: 'empresa-2',
        _count: { _all: 1 },
        _sum: { totalValue: 49.5 },
        _min: { statusChangedAt: new Date('2026-08-22T15:00:00Z') },
      },
    ]);
    prisma.invoice.groupBy.mockResolvedValue([
      {
        companyId: 'empresa-1',
        status: 'PENDING',
        dueDate: new Date('2026-08-23T00:00:00Z'),
        _count: { _all: 1 },
        _sum: { totalValue: 100.25 },
      },
      {
        companyId: 'empresa-1',
        status: 'OVERDUE',
        dueDate: new Date('2026-08-20T00:00:00Z'),
        _count: { _all: 1 },
        _sum: { totalValue: 40.25 },
      },
      {
        companyId: 'empresa-2',
        status: 'OVERDUE',
        dueDate: new Date('2026-08-10T00:00:00Z'),
        _count: { _all: 2 },
        _sum: { totalValue: 60.5 },
      },
      {
        companyId: 'empresa-2',
        status: 'OVERDUE',
        dueDate: new Date('2026-07-30T00:00:00Z'),
        _count: { _all: 1 },
        _sum: { totalValue: 30 },
      },
      {
        companyId: 'empresa-2',
        status: 'OVERDUE',
        dueDate: new Date('2026-07-20T00:00:00Z'),
        _count: { _all: 1 },
        _sum: { totalValue: 90 },
      },
    ]);
    prisma.company.findMany.mockResolvedValue([
      { id: 'empresa-1', tradeName: 'Drogaria Central' },
      { id: 'empresa-2', tradeName: 'Mercado Avenida' },
    ]);

    const report = await service.receivablesAging();

    expect(report.asOf).toBe('2026-08-23');
    expect(report.totalReceivable).toBe(521);
    expect(report.unbilled).toEqual({ count: 3, value: 200 });
    expect(report.invoices).toEqual({
      count: 6,
      value: 321,
      notDueCount: 1,
      notDueValue: 100.25,
      overdueCount: 5,
      overdueValue: 220.75,
    });
    expect(report.buckets).toEqual([
      { key: 'UNBILLED', count: 3, value: 200 },
      { key: 'NOT_DUE', count: 1, value: 100.25 },
      { key: 'OVERDUE_1_7', count: 1, value: 40.25 },
      { key: 'OVERDUE_8_15', count: 2, value: 60.5 },
      { key: 'OVERDUE_16_30', count: 1, value: 30 },
      { key: 'OVERDUE_31_PLUS', count: 1, value: 90 },
    ]);
    expect(report.companies[0]).toEqual({
      companyId: 'empresa-1',
      companyName: 'Drogaria Central',
      unbilledCount: 2,
      unbilledValue: 150.5,
      oldestUnbilledDate: '2026-08-13',
      maxUnbilledDays: 10,
      notDueInvoiceCount: 1,
      notDueInvoiceValue: 100.25,
      overdueInvoiceCount: 1,
      overdueInvoiceValue: 40.25,
      oldestOverdueDate: '2026-08-20',
      maxOverdueDays: 3,
      totalReceivable: 291,
    });
    expect(report.companies[1]?.maxOverdueDays).toBe(34);
    expect(report.companies[1]?.oldestOverdueDate).toBe('2026-07-20');
  });

  it('devolve todas as faixas zeradas quando não há exposição', async () => {
    const report = await service.receivablesAging();

    expect(report.totalReceivable).toBe(0);
    expect(report.totalCompanies).toBe(0);
    expect(report.companies).toEqual([]);
    expect(report.buckets).toHaveLength(6);
    expect(report.buckets.every((bucket) => bucket.count === 0 && bucket.value === 0)).toBe(true);
    expect(prisma.company.findMany).not.toHaveBeenCalled();
  });
});

describe('AdminFinancialService.payoutsAging', () => {
  let service: AdminFinancialService;
  let prisma: {
    wallet: { findMany: jest.Mock };
    walletTransaction: { groupBy: jest.Mock };
    withdrawalRequest: { findMany: jest.Mock };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      wallet: { findMany: jest.fn().mockResolvedValue([]) },
      walletTransaction: { groupBy: jest.fn().mockResolvedValue([]) },
      withdrawalRequest: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation((callback: (tx: typeof prisma) => unknown) =>
      callback(prisma),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminFinancialService,
        { provide: PrismaService, useValue: prisma },
        { provide: InvoiceService, useValue: { refreshOverdueInvoices: jest.fn() } },
        { provide: FinancialClock, useValue: { now: () => new Date('2026-08-23T15:00:00Z') } },
      ],
    }).compile();

    service = module.get(AdminFinancialService);
  });

  it('lê ledger e solicitações abertas no mesmo snapshot', async () => {
    await service.payoutsAging();

    expect(prisma.walletTransaction.groupBy.mock.calls[0]?.[0]?.where).toEqual({
      wallet: { driverId: { not: null } },
    });
    expect(prisma.withdrawalRequest.findMany.mock.calls[0]?.[0]?.where).toEqual({
      status: { in: ['PENDING', 'APPROVED'] },
      wallet: { driverId: { not: null } },
    });
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'RepeatableRead',
    });
  });

  it('reconcilia obrigações, saques e idade por entregador', async () => {
    prisma.wallet.findMany.mockResolvedValue([
      {
        id: 'wallet-1',
        cachedAvailableBalance: 70,
        cachedBlockedBalance: 50,
        driver: {
          id: 'driver-1',
          user: { name: 'Ana Entregadora', email: 'ana@example.com' },
        },
      },
      {
        id: 'wallet-2',
        cachedAvailableBalance: 0,
        cachedBlockedBalance: 0,
        driver: {
          id: 'driver-2',
          user: { name: 'Bruno Entregador', email: 'bruno@example.com' },
        },
      },
    ]);
    prisma.walletTransaction.groupBy.mockResolvedValue([
      {
        walletId: 'wallet-1',
        type: 'CREDIT_REPASSE',
        status: 'RELEASED',
        _sum: { amount: 100 },
      },
      {
        walletId: 'wallet-1',
        type: 'CREDIT_REPASSE',
        status: 'PENDING',
        _sum: { amount: 50 },
      },
      {
        walletId: 'wallet-1',
        type: 'DEBIT_WITHDRAWAL',
        status: 'PENDING',
        _sum: { amount: 30 },
      },
      {
        walletId: 'wallet-2',
        type: 'CREDIT_REPASSE',
        status: 'RELEASED',
        _sum: { amount: 20 },
      },
      {
        walletId: 'wallet-2',
        type: 'DEBIT_WITHDRAWAL',
        status: 'PENDING',
        _sum: { amount: 10 },
      },
    ]);
    prisma.withdrawalRequest.findMany.mockResolvedValue([
      {
        walletId: 'wallet-1',
        status: 'PENDING',
        requestedAmount: 30,
        netAmount: 30,
        createdAt: new Date('2026-08-23T12:00:00Z'),
      },
      {
        walletId: 'wallet-2',
        status: 'APPROVED',
        requestedAmount: 10,
        netAmount: 10,
        createdAt: new Date('2026-08-18T12:00:00Z'),
      },
    ]);

    const report = await service.payoutsAging();

    expect(report.asOf).toBe('2026-08-23');
    expect(report.totalObligation).toBe(170);
    expect(report.wallets).toEqual({
      driverCount: 2,
      availableBalance: 80,
      blockedBalance: 50,
      pendingWithdrawalAmount: 40,
      divergentCount: 1,
    });
    expect(report.withdrawals).toEqual({
      openCount: 2,
      requestedValue: 40,
      netValue: 40,
      pendingCount: 1,
      pendingNetValue: 30,
      approvedCount: 1,
      approvedNetValue: 10,
      oldestOpenDate: '2026-08-18',
      maxOpenDays: 5,
      withdrawalLedgerDifference: 0,
    });
    expect(report.buckets).toEqual([
      { key: 'OPEN_0_1', count: 1, requestedValue: 30, netValue: 30 },
      { key: 'OPEN_2_3', count: 0, requestedValue: 0, netValue: 0 },
      { key: 'OPEN_4_7', count: 1, requestedValue: 10, netValue: 10 },
      { key: 'OPEN_8_PLUS', count: 0, requestedValue: 0, netValue: 0 },
    ]);
    expect(report.drivers[0]).toEqual({
      driverId: 'driver-1',
      driverName: 'Ana Entregadora',
      driverEmail: 'ana@example.com',
      walletId: 'wallet-1',
      availableBalance: 70,
      blockedBalance: 50,
      pendingWithdrawalAmount: 30,
      totalObligation: 150,
      openWithdrawalCount: 1,
      openRequestedValue: 30,
      openNetValue: 30,
      pendingRequestCount: 1,
      pendingNetValue: 30,
      approvedRequestCount: 0,
      approvedNetValue: 0,
      oldestOpenDate: '2026-08-23',
      maxOpenDays: 0,
      cacheMatchesLedger: true,
      withdrawalLedgerDifference: 0,
    });
    expect(report.drivers[1]?.cacheMatchesLedger).toBe(false);
    expect(report.drivers[1]?.maxOpenDays).toBe(5);
  });

  it('devolve saldos e faixas zerados quando não há carteira', async () => {
    const report = await service.payoutsAging();

    expect(report.totalObligation).toBe(0);
    expect(report.wallets.driverCount).toBe(0);
    expect(report.withdrawals.openCount).toBe(0);
    expect(report.drivers).toEqual([]);
    expect(report.buckets).toHaveLength(4);
    expect(report.buckets.every((bucket) => bucket.count === 0 && bucket.netValue === 0)).toBe(
      true,
    );
  });
});
