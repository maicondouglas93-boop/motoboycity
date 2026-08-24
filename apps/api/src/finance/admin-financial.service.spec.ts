import { NotFoundException } from '@nestjs/common';
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

describe('AdminFinancialService.financialStatement', () => {
  let service: AdminFinancialService;
  let prisma: {
    delivery: { findMany: jest.Mock };
    walletTransaction: { groupBy: jest.Mock };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      delivery: { findMany: jest.fn().mockResolvedValue([]) },
      walletTransaction: { groupBy: jest.fn().mockResolvedValue([]) },
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

  it('usa janelas sem sobreposição e lê competência e ledger no mesmo snapshot', async () => {
    await service.financialStatement({ from: '2026-08-20', to: '2026-08-23' });

    expect(prisma.delivery.findMany.mock.calls[0]?.[0]?.where).toEqual({
      status: 'COMPLETED',
      statusChangedAt: {
        gte: new Date('2026-08-20T03:00:00.000Z'),
        lt: new Date('2026-08-24T03:00:00.000Z'),
      },
    });
    expect(prisma.delivery.findMany.mock.calls[1]?.[0]?.where).toEqual({
      status: 'COMPLETED',
      statusChangedAt: {
        gte: new Date('2026-08-16T03:00:00.000Z'),
        lt: new Date('2026-08-20T03:00:00.000Z'),
      },
    });
    expect(prisma.walletTransaction.groupBy.mock.calls[0]?.[0]?.where).toEqual({
      wallet: { driverId: { not: null } },
      type: { in: ['CREDIT_ADJUSTMENT', 'DEBIT_ADJUSTMENT', 'CREDIT_REFUND'] },
      status: { not: 'CANCELLED' },
      createdAt: {
        gte: new Date('2026-08-20T03:00:00.000Z'),
        lt: new Date('2026-08-24T03:00:00.000Z'),
      },
    });
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'RepeatableRead',
    });
  });

  it('reconcilia valores e consolida cliente, modalidade, pagamento, dia e ajustes', async () => {
    prisma.delivery.findMany
      .mockResolvedValueOnce([
        {
          statusChangedAt: new Date('2026-08-23T10:00:00Z'),
          totalValue: 100,
          driverValue: 70,
          platformValue: 30,
          paymentMethod: 'BILLED',
          company: { id: 'company-1', tradeName: 'Loja Azul' },
          serviceType: { id: 'service-1', name: 'Motoboy' },
        },
        {
          statusChangedAt: new Date('2026-08-23T20:00:00Z'),
          totalValue: 50,
          driverValue: 35,
          platformValue: 15,
          paymentMethod: 'ONLINE',
          company: { id: 'company-1', tradeName: 'Loja Azul' },
          serviceType: { id: 'service-1', name: 'Motoboy' },
        },
        {
          statusChangedAt: new Date('2026-08-22T12:00:00Z'),
          totalValue: 80,
          driverValue: 60,
          platformValue: 20,
          paymentMethod: 'BILLED',
          company: { id: 'company-2', tradeName: 'Loja Verde' },
          serviceType: { id: 'service-2', name: 'Utilitário' },
        },
        {
          statusChangedAt: new Date('2026-08-22T13:00:00Z'),
          totalValue: null,
          driverValue: null,
          platformValue: null,
          paymentMethod: 'BILLED',
          company: { id: 'company-2', tradeName: 'Loja Verde' },
          serviceType: { id: 'service-2', name: 'Utilitário' },
        },
      ])
      .mockResolvedValueOnce([
        { totalValue: 100, driverValue: 75, platformValue: 25 },
        { totalValue: 50, driverValue: 40, platformValue: 10 },
      ]);
    prisma.walletTransaction.groupBy.mockResolvedValue([
      {
        type: 'CREDIT_ADJUSTMENT',
        status: 'RELEASED',
        _count: { _all: 2 },
        _sum: { amount: 5.25 },
      },
      {
        type: 'CREDIT_REFUND',
        status: 'PENDING',
        _count: { _all: 1 },
        _sum: { amount: 2 },
      },
      {
        type: 'DEBIT_ADJUSTMENT',
        status: 'RELEASED',
        _count: { _all: 1 },
        _sum: { amount: 3.1 },
      },
    ]);

    const report = await service.financialStatement({ from: '2026-08-20', to: '2026-08-23' });

    expect(report.period).toEqual({ from: '2026-08-20', to: '2026-08-23' });
    expect(report.live).toBe(true);
    expect(report.totals).toEqual({
      completedCount: 4,
      pricedCount: 3,
      unpricedCount: 1,
      totalValue: 230,
      driverValue: 165,
      platformValue: 65,
      averageTicket: 76.67,
      contributionMarginPercent: 28.26,
      reconciliationDifference: 0,
    });
    expect(report.comparison).toEqual({
      period: { from: '2026-08-16', to: '2026-08-19' },
      totals: {
        completedCount: 2,
        pricedCount: 2,
        unpricedCount: 0,
        totalValue: 150,
        driverValue: 115,
        platformValue: 35,
        averageTicket: 75,
        contributionMarginPercent: 23.33,
        reconciliationDifference: 0,
      },
      changePercent: {
        completedCount: 100,
        totalValue: 53.3,
        driverValue: 43.5,
        platformValue: 85.7,
        averageTicket: 2.2,
      },
      contributionMarginPercentagePointChange: 4.93,
    });
    expect(report.walletAdjustments).toEqual({
      creditCount: 3,
      creditValue: 7.25,
      debitCount: 1,
      debitValue: 3.1,
      netDriverObligationImpact: 4.15,
      items: [
        {
          type: 'CREDIT_ADJUSTMENT',
          status: 'RELEASED',
          direction: 'CREDIT',
          count: 2,
          value: 5.25,
        },
        {
          type: 'DEBIT_ADJUSTMENT',
          status: 'RELEASED',
          direction: 'DEBIT',
          count: 1,
          value: 3.1,
        },
        {
          type: 'CREDIT_REFUND',
          status: 'PENDING',
          direction: 'CREDIT',
          count: 1,
          value: 2,
        },
      ],
    });
    expect(report.companies).toEqual([
      expect.objectContaining({
        id: 'company-1',
        name: 'Loja Azul',
        completedCount: 2,
        totalValue: 150,
        driverValue: 105,
        platformValue: 45,
        contributionMarginPercent: 30,
        platformRevenueSharePercent: 69.23,
      }),
      expect.objectContaining({
        id: 'company-2',
        name: 'Loja Verde',
        completedCount: 2,
        pricedCount: 1,
        unpricedCount: 1,
        totalValue: 80,
        platformValue: 20,
        platformRevenueSharePercent: 30.77,
      }),
    ]);
    expect(report.serviceTypes.map((item) => item.name)).toEqual(['Motoboy', 'Utilitário']);
    expect(report.paymentMethods).toEqual([
      expect.objectContaining({
        paymentMethod: 'BILLED',
        completedCount: 3,
        pricedCount: 2,
        totalValue: 180,
        platformValue: 50,
      }),
      expect.objectContaining({
        paymentMethod: 'ONLINE',
        completedCount: 1,
        pricedCount: 1,
        totalValue: 50,
        platformValue: 15,
      }),
    ]);
    expect(report.days).toEqual([
      expect.objectContaining({ day: '2026-08-22', completedCount: 2, totalValue: 80 }),
      expect.objectContaining({ day: '2026-08-23', completedCount: 2, totalValue: 150 }),
    ]);
  });

  it('devolve estrutura completa e zerada quando não há resultado', async () => {
    const report = await service.financialStatement({ from: '2026-08-01', to: '2026-08-02' });

    expect(report.totals).toEqual({
      completedCount: 0,
      pricedCount: 0,
      unpricedCount: 0,
      totalValue: 0,
      driverValue: 0,
      platformValue: 0,
      averageTicket: 0,
      contributionMarginPercent: 0,
      reconciliationDifference: 0,
    });
    expect(report.companies).toEqual([]);
    expect(report.serviceTypes).toEqual([]);
    expect(report.days).toEqual([]);
    expect(report.paymentMethods).toHaveLength(2);
    expect(report.walletAdjustments.items).toEqual([]);
    expect(report.walletAdjustments.netDriverObligationImpact).toBe(0);
  });
});

describe('AdminFinancialService.adjustDriverWallet', () => {
  let service: AdminFinancialService;
  let prisma: {
    driver: { findUnique: jest.Mock };
    wallet: { upsert: jest.Mock; update: jest.Mock };
    walletTransaction: { create: jest.Mock; findMany: jest.Mock; groupBy: jest.Mock };
    $transaction: jest.Mock;
  };
  let tx: {
    wallet: { upsert: jest.Mock; update: jest.Mock };
    walletTransaction: { create: jest.Mock };
  };

  beforeEach(async () => {
    tx = {
      wallet: { upsert: jest.fn().mockResolvedValue({ id: 'wallet-1' }), update: jest.fn() },
      walletTransaction: { create: jest.fn() },
    };
    prisma = {
      driver: { findUnique: jest.fn().mockResolvedValue({ id: 'driver-1' }) },
      wallet: { upsert: jest.fn(), update: jest.fn() },
      walletTransaction: { create: jest.fn(), findMany: jest.fn(), groupBy: jest.fn() },
      $transaction: jest.fn().mockImplementation(async (cb: (t: unknown) => unknown) => cb(tx)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminFinancialService,
        { provide: PrismaService, useValue: prisma },
        { provide: InvoiceService, useValue: { refreshOverdueInvoices: jest.fn() } },
        { provide: FinancialClock, useValue: { now: () => new Date('2026-08-24T12:00:00Z') } },
      ],
    }).compile();

    service = module.get(AdminFinancialService);
    // O detalhe recarregado no fim nao e o objeto deste teste.
    jest.spyOn(service, 'getDriverWallet').mockResolvedValue({} as never);
  });

  it('lança CRÉDITO como linha de ledger, já liberada, com motivo e autor', async () => {
    await service.adjustDriverWallet(
      'driver-1',
      { type: 'CREDIT', amount: 40, reason: 'Repasse do pedido #1173 saiu a menos' },
      'admin-9',
    );

    expect(tx.walletTransaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        walletId: 'wallet-1',
        type: 'CREDIT_ADJUSTMENT',
        // RELEASED, e nao PENDING: correcao de erro nosso nao faz o motoboy
        // esperar ate a segunda-feira.
        status: 'RELEASED',
        amount: 40,
        reason: 'Repasse do pedido #1173 saiu a menos',
        createdByUserId: 'admin-9',
      }),
    });
  });

  it('crédito soma no saldo DISPONÍVEL, não no bloqueado', async () => {
    await service.adjustDriverWallet(
      'driver-1',
      { type: 'CREDIT', amount: 40, reason: 'Correcao de repasse a menor' },
      'admin-9',
    );

    expect(tx.wallet.update).toHaveBeenCalledWith({
      where: { id: 'wallet-1' },
      data: { cachedAvailableBalance: { increment: 40 } },
    });
  });

  it('débito subtrai, e pode deixar o saldo negativo', async () => {
    /**
     * Negativo e proposital: se o motoboy recebeu a mais, ele passa a dever.
     * Zerar o saldo em vez de deixar negativo apagaria a divida da tela e do
     * extrato — e ninguem cobraria o que nao aparece.
     */
    await service.adjustDriverWallet(
      'driver-1',
      { type: 'DEBIT', amount: 500, reason: 'Recebeu em duplicidade o pedido #1174' },
      'admin-9',
    );

    expect(tx.walletTransaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ type: 'DEBIT_ADJUSTMENT', amount: 500 }),
    });
    expect(tx.wallet.update).toHaveBeenCalledWith({
      where: { id: 'wallet-1' },
      data: { cachedAvailableBalance: { decrement: 500 } },
    });
  });

  it('lançamento e saldo andam na MESMA transação', async () => {
    // Se o saldo pudesse ser atualizado fora da transacao do lancamento, uma
    // falha no meio deixaria extrato e saldo discordando — e a tela de
    // carteiras marcaria "Divergência" sem ninguem saber por que.
    await service.adjustDriverWallet(
      'driver-1',
      { type: 'CREDIT', amount: 10, reason: 'Acerto combinado por telefone' },
      'admin-9',
    );

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.walletTransaction.create).not.toHaveBeenCalled();
    expect(prisma.wallet.update).not.toHaveBeenCalled();
  });

  it('recusa entregador inexistente antes de mexer em dinheiro', async () => {
    prisma.driver.findUnique.mockResolvedValue(null);

    await expect(
      service.adjustDriverWallet(
        'nao-existe',
        { type: 'CREDIT', amount: 10, reason: 'Qualquer motivo escrito aqui' },
        'admin-9',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe('AdminFinancialService.financialCycle', () => {
  let service: AdminFinancialService;
  let prisma: {
    delivery: { findMany: jest.Mock };
    walletTransaction: { findMany: jest.Mock };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      delivery: { findMany: jest.fn().mockResolvedValue([]) },
      walletTransaction: { findMany: jest.fn().mockResolvedValue([]) },
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
        { provide: FinancialClock, useValue: { now: () => new Date('2026-08-24T12:00:00Z') } },
      ],
    }).compile();

    service = module.get(AdminFinancialService);
  });

  it('filtra pela competência e lê todas as etapas no mesmo snapshot', async () => {
    await service.financialCycle({ from: '2026-08-01', to: '2026-08-03' });

    expect(prisma.delivery.findMany.mock.calls[0]?.[0]?.where).toEqual({
      status: 'COMPLETED',
      statusChangedAt: {
        gte: new Date('2026-08-01T03:00:00.000Z'),
        lt: new Date('2026-08-04T03:00:00.000Z'),
      },
    });
    expect(prisma.walletTransaction.findMany.mock.calls[0]?.[0]?.where).toEqual({
      wallet: { driverId: { not: null } },
      type: { in: ['CREDIT_ADJUSTMENT', 'DEBIT_ADJUSTMENT', 'CREDIT_REFUND'] },
      createdAt: {
        gte: new Date('2026-08-01T03:00:00.000Z'),
        lt: new Date('2026-08-04T03:00:00.000Z'),
      },
    });
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'RepeatableRead',
    });
  });

  it('relaciona fatura, recebimento e repasse e sinaliza cada quebra do ciclo', async () => {
    const company = { id: 'company-1', tradeName: 'Loja Azul' };
    const driver = { id: 'driver-1', user: { name: 'Ana Entregadora' } };
    const serviceType = { id: 'service-1', name: 'Motoboy' };

    prisma.delivery.findMany.mockResolvedValue([
      {
        id: 'delivery-1',
        displayNumber: 1001,
        statusChangedAt: new Date('2026-08-03T15:00:00Z'),
        paymentMethod: 'BILLED',
        totalValue: 100,
        driverValue: 70,
        platformValue: 30,
        company,
        driver,
        serviceType,
        invoice: {
          id: 'invoice-1',
          number: 'FAT-1',
          issueDate: new Date('2026-08-04T00:00:00Z'),
          dueDate: new Date('2026-08-04T00:00:00Z'),
          paymentDate: new Date('2026-08-10T00:00:00Z'),
          status: 'PAID',
        },
        walletTransactions: [
          {
            id: 'repasse-1',
            status: 'PENDING',
            amount: 70,
            createdAt: new Date('2026-08-03T15:00:01Z'),
            releaseAt: new Date('2026-08-10T03:00:00Z'),
          },
        ],
      },
      {
        id: 'delivery-2',
        displayNumber: 1002,
        statusChangedAt: new Date('2026-08-03T14:00:00Z'),
        paymentMethod: 'BILLED',
        totalValue: 50,
        driverValue: 35,
        platformValue: 15,
        company,
        driver,
        serviceType,
        invoice: null,
        walletTransactions: [],
      },
      {
        id: 'delivery-3',
        displayNumber: 1003,
        statusChangedAt: new Date('2026-08-03T13:00:00Z'),
        paymentMethod: 'ONLINE',
        totalValue: 80,
        driverValue: 60,
        platformValue: 20,
        company,
        driver,
        serviceType,
        invoice: null,
        walletTransactions: [
          {
            id: 'repasse-3',
            status: 'RELEASED',
            amount: 60,
            createdAt: new Date('2026-08-03T13:00:01Z'),
            releaseAt: null,
          },
        ],
      },
      {
        id: 'delivery-4',
        displayNumber: 1004,
        statusChangedAt: new Date('2026-08-03T12:00:00Z'),
        paymentMethod: 'BILLED',
        totalValue: 40,
        driverValue: 30,
        platformValue: 10,
        company,
        driver,
        serviceType,
        invoice: {
          id: 'invoice-4',
          number: 'FAT-4',
          issueDate: new Date('2026-08-04T00:00:00Z'),
          dueDate: new Date('2026-08-04T00:00:00Z'),
          paymentDate: null,
          status: 'OVERDUE',
        },
        walletTransactions: [
          {
            id: 'repasse-4a',
            status: 'RELEASED',
            amount: 10,
            createdAt: new Date('2026-08-03T12:00:01Z'),
            releaseAt: null,
          },
          {
            id: 'repasse-4b',
            status: 'PENDING',
            amount: 10,
            createdAt: new Date('2026-08-03T12:00:02Z'),
            releaseAt: new Date('2026-08-10T03:00:00Z'),
          },
          {
            id: 'repasse-4c',
            status: 'CANCELLED',
            amount: 5,
            createdAt: new Date('2026-08-03T12:00:03Z'),
            releaseAt: null,
          },
        ],
      },
      {
        id: 'delivery-5',
        displayNumber: 1005,
        statusChangedAt: new Date('2026-08-03T11:00:00Z'),
        paymentMethod: 'BILLED',
        totalValue: null,
        driverValue: null,
        platformValue: null,
        company,
        driver: null,
        serviceType,
        invoice: null,
        walletTransactions: [],
      },
    ]);
    prisma.walletTransaction.findMany.mockResolvedValue([
      {
        id: 'adjustment-1',
        type: 'CREDIT_ADJUSTMENT',
        status: 'RELEASED',
        amount: 5,
        reason: 'Complemento combinado com o entregador',
        createdAt: new Date('2026-08-03T16:00:00Z'),
        wallet: { driver },
        createdBy: { id: 'admin-1', name: 'Administrador' },
      },
      {
        id: 'adjustment-2',
        type: 'DEBIT_ADJUSTMENT',
        status: 'RELEASED',
        amount: 2,
        reason: 'Correção de crédito lançado em duplicidade',
        createdAt: new Date('2026-08-03T17:00:00Z'),
        wallet: { driver },
        createdBy: { id: 'admin-1', name: 'Administrador' },
      },
      {
        id: 'adjustment-3',
        type: 'CREDIT_REFUND',
        status: 'CANCELLED',
        amount: 7,
        reason: null,
        createdAt: new Date('2026-08-03T18:00:00Z'),
        wallet: { driver },
        createdBy: null,
      },
    ]);

    const report = await service.financialCycle({ from: '2026-08-01', to: '2026-08-03' });

    expect(report.summary).toEqual({
      completedCount: 5,
      pricedCount: 4,
      competencyValue: 270,
      invoicedCount: 2,
      invoicedDeliveryValue: 140,
      unbilledCount: 2,
      unbilledValue: 50,
      receivedCount: 1,
      receivedDeliveryValue: 100,
      openInvoiceCount: 1,
      openInvoiceValue: 40,
      overdueCount: 1,
      overdueValue: 40,
      onlineCount: 1,
      onlineValue: 80,
      repasseRegisteredCount: 3,
      repasseRegisteredValue: 150,
      itemWithIssueCount: 3,
      adjustmentCreditValue: 5,
      adjustmentDebitValue: 2,
    });
    expect(report.items[0]?.invoice).toEqual({
      id: 'invoice-1',
      number: 'FAT-1',
      issueDate: '2026-08-04',
      dueDate: '2026-08-04',
      paymentDate: '2026-08-10',
      status: 'PAID',
    });
    expect(report.items[0]?.issues).toEqual([]);
    expect(report.items[1]?.issues).toEqual(['MISSING_INVOICE', 'MISSING_REPASSE']);
    expect(report.items[2]?.issues).toEqual([]);
    expect(report.items[3]?.issues).toEqual([
      'CANCELLED_REPASSE',
      'DUPLICATE_REPASSE',
      'REPASSE_AMOUNT_MISMATCH',
    ]);
    expect(report.items[4]?.issues).toEqual(['UNPRICED', 'MISSING_DRIVER', 'MISSING_INVOICE']);
    expect(report.adjustments).toEqual([
      expect.objectContaining({
        transactionId: 'adjustment-1',
        direction: 'CREDIT',
        reason: 'Complemento combinado com o entregador',
        driver: { id: 'driver-1', name: 'Ana Entregadora' },
        createdBy: { id: 'admin-1', name: 'Administrador' },
      }),
      expect.objectContaining({ transactionId: 'adjustment-2', direction: 'DEBIT' }),
      expect.objectContaining({ transactionId: 'adjustment-3', status: 'CANCELLED' }),
    ]);
  });

  it('devolve ciclo vazio sem nulos nos totais', async () => {
    const report = await service.financialCycle({ from: '2026-08-01', to: '2026-08-03' });

    expect(report.items).toEqual([]);
    expect(report.adjustments).toEqual([]);
    expect(Object.values(report.summary).every((value) => value === 0)).toBe(true);
  });
});

describe('AdminFinancialService.cashFlowForecast', () => {
  let service: AdminFinancialService;
  let prisma: {
    invoice: { findMany: jest.Mock };
    walletTransaction: { findMany: jest.Mock };
    withdrawalRequest: { findMany: jest.Mock };
    withdrawalRequestStatusHistory: { findMany: jest.Mock };
    delivery: { aggregate: jest.Mock };
    $transaction: jest.Mock;
  };
  let invoiceService: { refreshOverdueInvoices: jest.Mock };

  beforeEach(async () => {
    prisma = {
      invoice: { findMany: jest.fn().mockResolvedValue([]) },
      walletTransaction: { findMany: jest.fn().mockResolvedValue([]) },
      withdrawalRequest: { findMany: jest.fn().mockResolvedValue([]) },
      withdrawalRequestStatusHistory: { findMany: jest.fn().mockResolvedValue([]) },
      delivery: { aggregate: jest.fn().mockResolvedValue(agregado(0, null)) },
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
        { provide: FinancialClock, useValue: { now: () => new Date('2026-08-24T12:00:00Z') } },
      ],
    }).compile();

    service = module.get(AdminFinancialService);
  });

  it('consulta as datas no fuso operacional e mantem um snapshot unico', async () => {
    await service.cashFlowForecast({ from: '2026-08-24', to: '2026-08-31' });

    expect(invoiceService.refreshOverdueInvoices).toHaveBeenCalledTimes(1);
    expect(prisma.invoice.findMany.mock.calls[0]?.[0]?.where).toEqual({
      status: { in: ['PENDING', 'OVERDUE'] },
      dueDate: {
        gte: new Date('2026-08-24T00:00:00.000Z'),
        lt: new Date('2026-09-01T00:00:00.000Z'),
      },
    });
    expect(prisma.walletTransaction.findMany.mock.calls[0]?.[0]?.where).toEqual({
      type: 'CREDIT_REPASSE',
      status: 'PENDING',
      wallet: { driverId: { not: null } },
      OR: [{ releaseAt: { lt: new Date('2026-09-01T03:00:00.000Z') } }, { releaseAt: null }],
    });
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'RepeatableRead',
    });
  });

  it('separa previsao, compromisso sem data e movimentos realizados', async () => {
    const company = { id: 'company-1', tradeName: 'Loja Azul' };
    const driver = { id: 'driver-1', user: { name: 'Ana Entregadora' } };
    const invoice = (id: string, status: string, dueDate: string, totalValue: number) => ({
      id,
      number: `FAT-${id}`,
      status,
      dueDate: new Date(`${dueDate}T00:00:00Z`),
      paymentDate: null,
      totalValue,
      company,
    });

    prisma.invoice.findMany
      .mockResolvedValueOnce([
        invoice('1', 'PENDING', '2026-08-25', 100),
        invoice('2', 'OVERDUE', '2026-08-26', 50.25),
      ])
      .mockResolvedValueOnce([invoice('old', 'OVERDUE', '2026-08-10', 80)])
      .mockResolvedValueOnce([
        {
          ...invoice('paid', 'PAID', '2026-08-20', 200),
          paymentDate: new Date('2026-08-27T00:00:00Z'),
        },
      ]);
    prisma.walletTransaction.findMany.mockResolvedValue([
      {
        id: 'repasse-periodo',
        amount: 70,
        releaseAt: new Date('2026-08-31T03:00:00Z'),
        wallet: { driver },
        delivery: { id: 'delivery-1', displayNumber: 1001 },
      },
      {
        id: 'repasse-atrasado',
        amount: 30,
        releaseAt: new Date('2026-08-17T03:00:00Z'),
        wallet: { driver },
        delivery: null,
      },
      {
        id: 'repasse-sem-data',
        amount: 15,
        releaseAt: null,
        wallet: { driver },
        delivery: null,
      },
    ]);
    prisma.withdrawalRequest.findMany.mockResolvedValue([
      {
        id: 'withdrawal-pending',
        status: 'PENDING',
        requestedAmount: 60,
        netAmount: 60,
        createdAt: new Date('2026-08-24T13:00:00Z'),
        wallet: { driver },
      },
      {
        id: 'withdrawal-approved',
        status: 'APPROVED',
        requestedAmount: 40,
        netAmount: 40,
        createdAt: new Date('2026-08-24T14:00:00Z'),
        wallet: { driver },
      },
    ]);
    prisma.withdrawalRequestStatusHistory.findMany.mockResolvedValue([
      {
        changedAt: new Date('2026-08-28T16:00:00Z'),
        withdrawalRequest: {
          id: 'withdrawal-paid',
          status: 'PAID',
          requestedAmount: 35,
          netAmount: 35,
          createdAt: new Date('2026-08-24T13:00:00Z'),
          wallet: { driver },
        },
      },
    ]);
    prisma.delivery.aggregate.mockResolvedValue(agregado(2, 90));

    const report = await service.cashFlowForecast({ from: '2026-08-24', to: '2026-08-31' });

    expect(report.summary).toEqual({
      projectedInvoiceCount: 2,
      projectedInvoiceValue: 150.25,
      overdueBeforePeriodCount: 1,
      overdueBeforePeriodValue: 80,
      unbilledCount: 2,
      unbilledValue: 90,
      scheduledRepasseCount: 1,
      scheduledRepasseValue: 70,
      overdueRepasseCount: 1,
      overdueRepasseValue: 30,
      unscheduledRepasseCount: 1,
      unscheduledRepasseValue: 15,
      openWithdrawalCount: 2,
      openWithdrawalRequestedValue: 100,
      openWithdrawalNetValue: 100,
      approvedWithdrawalCount: 1,
      approvedWithdrawalNetValue: 40,
      realizedReceiptCount: 1,
      realizedReceiptValue: 200,
      realizedWithdrawalCount: 1,
      realizedWithdrawalValue: 35,
    });
    expect(report.days).toHaveLength(8);
    expect(report.days.find((day) => day.day === '2026-08-25')).toEqual(
      expect.objectContaining({ projectedInvoiceInflowCount: 1, projectedInvoiceInflowValue: 100 }),
    );
    expect(report.days.find((day) => day.day === '2026-08-31')).toEqual(
      expect.objectContaining({
        scheduledRepasseReleaseCount: 1,
        scheduledRepasseReleaseValue: 70,
      }),
    );
    expect(report.days.find((day) => day.day === '2026-08-27')).toEqual(
      expect.objectContaining({ realizedReceiptCount: 1, realizedReceiptValue: 200 }),
    );
    expect(report.days.find((day) => day.day === '2026-08-28')).toEqual(
      expect.objectContaining({ realizedWithdrawalCount: 1, realizedWithdrawalValue: 35 }),
    );
    expect(report.repasses.map((item) => item.timing)).toEqual([
      'IN_PERIOD',
      'OVERDUE_BEFORE_PERIOD',
      'UNSCHEDULED',
    ]);
    expect(report.openWithdrawals.every((item) => item.paidAt === null)).toBe(true);
  });

  it('preenche todos os dias e devolve zero quando nao ha movimentos', async () => {
    const report = await service.cashFlowForecast({ from: '2026-08-24', to: '2026-08-26' });

    expect(report.days.map((day) => day.day)).toEqual(['2026-08-24', '2026-08-25', '2026-08-26']);
    expect(Object.values(report.summary).every((value) => value === 0)).toBe(true);
    expect(report.projectedInvoices).toEqual([]);
    expect(report.openWithdrawals).toEqual([]);
  });
});

describe('AdminFinancialService.financialAudit', () => {
  let service: AdminFinancialService;
  let prisma: {
    walletTransaction: { findMany: jest.Mock };
    invoiceStatusHistory: { findMany: jest.Mock };
    withdrawalRequestStatusHistory: { findMany: jest.Mock };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      walletTransaction: { findMany: jest.fn().mockResolvedValue([]) },
      invoiceStatusHistory: { findMany: jest.fn().mockResolvedValue([]) },
      withdrawalRequestStatusHistory: { findMany: jest.fn().mockResolvedValue([]) },
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
        { provide: FinancialClock, useValue: { now: () => new Date('2026-08-24T12:00:00Z') } },
      ],
    }).compile();

    service = module.get(AdminFinancialService);
  });

  it('filtra as tres trilhas pelo dia de Sao Paulo no mesmo snapshot', async () => {
    await service.financialAudit({ from: '2026-08-01', to: '2026-08-03' });

    const period = {
      gte: new Date('2026-08-01T03:00:00.000Z'),
      lt: new Date('2026-08-04T03:00:00.000Z'),
    };
    expect(prisma.walletTransaction.findMany.mock.calls[0]?.[0]?.where).toEqual({
      wallet: { driverId: { not: null } },
      type: { in: ['CREDIT_ADJUSTMENT', 'DEBIT_ADJUSTMENT', 'CREDIT_REFUND'] },
      createdAt: period,
    });
    expect(prisma.invoiceStatusHistory.findMany.mock.calls[0]?.[0]?.where).toEqual({
      changedAt: period,
    });
    expect(prisma.withdrawalRequestStatusHistory.findMany.mock.calls[0]?.[0]?.where).toEqual({
      changedAt: period,
    });
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'RepeatableRead',
    });
  });

  it('ordena a cronologia e resume valores ativos, autores e pagamentos', async () => {
    const admin = { id: 'admin-1', name: 'Administrador' };
    const driver = { id: 'driver-1', user: { name: 'Ana Entregadora' } };
    const company = { id: 'company-1', tradeName: 'Loja Azul' };
    prisma.walletTransaction.findMany.mockResolvedValue([
      {
        id: 'adjustment-credit',
        type: 'CREDIT_ADJUSTMENT',
        status: 'RELEASED',
        amount: 50,
        reason: 'Complemento de repasse',
        createdAt: new Date('2026-08-03T10:00:00Z'),
        createdBy: admin,
        wallet: { driver },
      },
      {
        id: 'adjustment-debit-cancelled',
        type: 'DEBIT_ADJUSTMENT',
        status: 'CANCELLED',
        amount: 10,
        reason: 'Lancamento cancelado',
        createdAt: new Date('2026-08-03T11:00:00Z'),
        createdBy: admin,
        wallet: { driver },
      },
      {
        id: 'refund-system',
        type: 'CREDIT_REFUND',
        status: 'RELEASED',
        amount: 5,
        reason: null,
        createdAt: new Date('2026-08-03T12:00:00Z'),
        createdBy: null,
        wallet: { driver },
      },
    ]);
    prisma.invoiceStatusHistory.findMany.mockResolvedValue([
      {
        id: 'invoice-paid',
        fromStatus: 'PENDING',
        toStatus: 'PAID',
        changedAt: new Date('2026-08-03T13:00:00Z'),
        note: 'Pagamento confirmado',
        changedByUser: admin,
        invoice: { id: 'invoice-1', number: 'FAT-1', totalValue: 100, company },
      },
      {
        id: 'invoice-created',
        fromStatus: null,
        toStatus: 'PENDING',
        changedAt: new Date('2026-08-03T09:00:00Z'),
        note: 'Fechamento automatico',
        changedByUser: null,
        invoice: { id: 'invoice-2', number: 'FAT-2', totalValue: 70, company },
      },
    ]);
    prisma.withdrawalRequestStatusHistory.findMany.mockResolvedValue([
      {
        id: 'withdrawal-paid',
        fromStatus: 'APPROVED',
        toStatus: 'PAID',
        changedAt: new Date('2026-08-03T14:00:00Z'),
        note: 'PIX enviado',
        changedByUser: admin,
        withdrawalRequest: {
          id: 'withdrawal-1',
          requestedAmount: 40,
          netAmount: 40,
          wallet: { driver },
        },
      },
      {
        id: 'withdrawal-created',
        fromStatus: null,
        toStatus: 'PENDING',
        changedAt: new Date('2026-08-03T08:00:00Z'),
        note: 'Solicitacao criada',
        changedByUser: { id: 'driver-user-1', name: 'Ana Entregadora' },
        withdrawalRequest: {
          id: 'withdrawal-1',
          requestedAmount: 40,
          netAmount: 40,
          wallet: { driver },
        },
      },
    ]);

    const report = await service.financialAudit({ from: '2026-08-01', to: '2026-08-03' });

    expect(report.summary).toEqual({
      totalEventCount: 7,
      identifiedActorCount: 5,
      systemEventCount: 2,
      walletAdjustmentCount: 3,
      walletCreditValue: 55,
      walletDebitValue: 0,
      invoiceStatusChangeCount: 2,
      invoicePaidCount: 1,
      invoicePaidValue: 100,
      withdrawalStatusChangeCount: 2,
      withdrawalPaidCount: 1,
      withdrawalPaidValue: 40,
    });
    expect(report.events[0]).toEqual(
      expect.objectContaining({
        id: 'withdrawal-paid',
        kind: 'WITHDRAWAL_STATUS_CHANGE',
        actor: admin,
      }),
    );
    expect(report.events.at(-1)?.id).toBe('withdrawal-created');
    expect(report.events.find((event) => event.id === 'adjustment-credit')).toEqual(
      expect.objectContaining({ direction: 'CREDIT', amount: 50 }),
    );
  });

  it('devolve totais zerados quando nao houve evento financeiro', async () => {
    const report = await service.financialAudit({ from: '2026-08-01', to: '2026-08-03' });

    expect(report.events).toEqual([]);
    expect(Object.values(report.summary).every((value) => value === 0)).toBe(true);
  });
});
