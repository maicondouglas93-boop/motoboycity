import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  AdjustDriverWalletPayload,
  AdminFinancialOverviewQuery,
  FinancialStatementQuery,
  ListAdminWalletsQuery,
  ListReceiptsQuery,
  ListWalletTransactionsQuery,
} from '@motoboycity/validation';
import type {
  CashPositionItem,
  DriverPayoutPositionItem,
  FinancialStatementAdjustmentItem,
  FinancialStatementDayItem,
  FinancialStatementDimensionItem,
  FinancialStatementPaymentMethodItem,
  FinancialStatementReport,
  FinancialStatementTotals,
  PayoutAgingBucketItem,
  PayoutAgingBucketKey,
  PayoutsAgingReport,
  ReceiptItem,
  ReceivablesAgingBucketItem,
  ReceivablesAgingBucketKey,
  ReceivablesAgingReport,
  ReceivablesCompanyItem,
  ReceiptsReport,
} from '@motoboycity/types';
import { PrismaService } from '../prisma/prisma.service';
import { InvoiceService } from './invoice.service';
import {
  calculateWalletBalances,
  toWalletTransactionItem,
  type WalletTransactionItem,
  type WalletTransactionType,
} from './driver-wallet.service';
import { dateInSaoPaulo, endOfDayInSaoPaulo, startOfDayInSaoPaulo } from '../common/sao-paulo-time';
import { FinancialClock } from './financial-clock.service';

export interface AdminFinancialOverview {
  completedDeliveries: {
    count: number;
    totalValue: number;
    driverValue: number;
    platformValue: number;
    unbilledValue: number;
  };
  invoices: {
    pendingCount: number;
    overdueCount: number;
    totalReceivable: number;
  };
  driverWallets: {
    availableBalance: number;
    blockedBalance: number;
    pendingWithdrawalAmount: number;
  };
}

export interface AdminDriverWalletItem {
  driverId: string;
  driverName: string;
  driverEmail: string;
  walletId: string | null;
  availableBalance: number;
  blockedBalance: number;
  pendingWithdrawalAmount: number;
  cacheMatchesLedger: boolean;
}

export interface AdminDriverWalletDetail extends AdminDriverWalletItem {
  transactions: WalletTransactionItem[];
}

function numberOrZero(value: { toString(): string } | null | undefined): number {
  return value === null || value === undefined ? 0 : Number(value);
}

function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Soma em centavos inteiros.
 *
 * `0.1 + 0.2` e `0.30000000000000004`. O banco guarda `Decimal(10,2)`, entao
 * converter para centavo antes de somar devolve exatamente o mesmo numero que
 * o banco daria.
 */
function somarEmCentavos(valores: number[]): number {
  return valores.reduce((total, valor) => total + Math.round(valor * 100), 0) / 100;
}

function roundMetric(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

type FinancialDeliveryRow = {
  totalValue: { toString(): string } | null;
  driverValue: { toString(): string } | null;
  platformValue: { toString(): string } | null;
};

function financialStatementTotals(rows: FinancialDeliveryRow[]): FinancialStatementTotals {
  const pricedRows = rows.filter(
    (
      row,
    ): row is FinancialDeliveryRow & {
      totalValue: { toString(): string };
      driverValue: { toString(): string };
      platformValue: { toString(): string };
    } => row.totalValue !== null && row.driverValue !== null && row.platformValue !== null,
  );
  const totalValue = somarEmCentavos(pricedRows.map((row) => Number(row.totalValue)));
  const driverValue = somarEmCentavos(pricedRows.map((row) => Number(row.driverValue)));
  const platformValue = somarEmCentavos(pricedRows.map((row) => Number(row.platformValue)));

  return {
    completedCount: rows.length,
    pricedCount: pricedRows.length,
    unpricedCount: rows.length - pricedRows.length,
    totalValue,
    driverValue,
    platformValue,
    averageTicket: pricedRows.length ? roundCurrency(totalValue / pricedRows.length) : 0,
    contributionMarginPercent: totalValue ? roundMetric((platformValue / totalValue) * 100) : 0,
    reconciliationDifference: somarEmCentavos([totalValue, -driverValue, -platformValue]),
  };
}

function statementDimensions<T extends FinancialDeliveryRow>(
  rows: T[],
  platformTotal: number,
  identify: (row: T) => { id: string; name: string },
): FinancialStatementDimensionItem[] {
  const grouped = new Map<string, { name: string; rows: T[] }>();
  for (const row of rows) {
    const dimension = identify(row);
    const current = grouped.get(dimension.id);
    if (current) current.rows.push(row);
    else grouped.set(dimension.id, { name: dimension.name, rows: [row] });
  }

  return [...grouped.entries()]
    .map(([id, group]) => {
      const totals = financialStatementTotals(group.rows);
      return {
        id,
        name: group.name,
        ...totals,
        platformRevenueSharePercent: platformTotal
          ? roundMetric((totals.platformValue / platformTotal) * 100)
          : 0,
      };
    })
    .sort(
      (left, right) =>
        right.platformValue - left.platformValue ||
        right.totalValue - left.totalValue ||
        left.name.localeCompare(right.name, 'pt-BR'),
    );
}

const RECEIVABLE_BUCKET_ORDER: ReceivablesAgingBucketKey[] = [
  'UNBILLED',
  'NOT_DUE',
  'OVERDUE_1_7',
  'OVERDUE_8_15',
  'OVERDUE_16_30',
  'OVERDUE_31_PLUS',
];

const PAYOUT_BUCKET_ORDER: PayoutAgingBucketKey[] = [
  'OPEN_0_1',
  'OPEN_2_3',
  'OPEN_4_7',
  'OPEN_8_PLUS',
];

function civilDateEpoch(date: string): number {
  const [year, month, day] = date.split('-').map(Number);
  return Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1);
}

function daysBetweenCivilDates(later: string, earlier: string): number {
  return Math.max(0, Math.floor((civilDateEpoch(later) - civilDateEpoch(earlier)) / 86_400_000));
}

function databaseDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function overdueBucket(days: number): ReceivablesAgingBucketKey {
  if (days <= 7) return 'OVERDUE_1_7';
  if (days <= 15) return 'OVERDUE_8_15';
  if (days <= 30) return 'OVERDUE_16_30';
  return 'OVERDUE_31_PLUS';
}

function payoutBucket(days: number): PayoutAgingBucketKey {
  if (days <= 1) return 'OPEN_0_1';
  if (days <= 3) return 'OPEN_2_3';
  if (days <= 7) return 'OPEN_4_7';
  return 'OPEN_8_PLUS';
}

type ReceivablesCompanyAccumulator = ReceivablesCompanyItem;

function emptyCompany(companyId: string, companyName: string): ReceivablesCompanyAccumulator {
  return {
    companyId,
    companyName,
    unbilledCount: 0,
    unbilledValue: 0,
    oldestUnbilledDate: null,
    maxUnbilledDays: 0,
    notDueInvoiceCount: 0,
    notDueInvoiceValue: 0,
    overdueInvoiceCount: 0,
    overdueInvoiceValue: 0,
    oldestOverdueDate: null,
    maxOverdueDays: 0,
    totalReceivable: 0,
  };
}

@Injectable()
export class AdminFinancialService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly invoiceService: InvoiceService,
    private readonly clock: FinancialClock,
  ) {}

  /**
   * Posicao de caixa do instante. Nada aqui e filtrado por periodo.
   *
   * O numero que faltava e "concluido sem fatura": trabalho feito e ainda nao
   * cobrado. No concorrente isso passava de um terco do faturamento mensal, e
   * aqui nao aparecia em tela nenhuma como posicao — so dentro de um recorte de
   * datas, onde some assim que alguem filtra outro mes.
   */
  async cashPosition(): Promise<CashPositionItem> {
    /**
     * "Vencida" e status ARMAZENADO. Sem este refresh, uma fatura que venceu
     * ontem ainda estaria PENDING e o caixa mostraria zero atrasado com
     * dinheiro atrasado de verdade.
     */
    await this.invoiceService.refreshOverdueInvoices();

    const [unbilled, due, overdue, transactionGroups] = await Promise.all([
      this.prisma.delivery.aggregate({
        // Somente faturadas: pedido pago online nao vira fatura, entao nunca
        // seria "sem fatura" — entraria como divida que nao existe.
        where: { status: 'COMPLETED', paymentMethod: 'BILLED', invoiceId: null },
        _count: { _all: true },
        _sum: { totalValue: true },
      }),
      this.prisma.invoice.aggregate({
        where: { status: 'PENDING' },
        _count: { _all: true },
        _sum: { totalValue: true },
      }),
      this.prisma.invoice.aggregate({
        where: { status: 'OVERDUE' },
        _count: { _all: true },
        _sum: { totalValue: true },
      }),
      this.prisma.walletTransaction.groupBy({
        by: ['type', 'status'],
        // So carteiras de motoboy: a carteira de empresa existe no schema mas
        // nao e usada, e misturar as duas daria um numero que nao e divida
        // com ninguem.
        where: { wallet: { driverId: { not: null } } },
        _sum: { amount: true },
      }),
    ]);

    const wallets = calculateWalletBalances(
      transactionGroups.map((group) => ({
        type: group.type as WalletTransactionType,
        status: group.status,
        amount: { toString: () => numberOrZero(group._sum.amount).toString() },
      })),
    );

    const unbilledValue = numberOrZero(unbilled._sum.totalValue);
    const invoicesDueValue = numberOrZero(due._sum.totalValue);
    const invoicesOverdueValue = numberOrZero(overdue._sum.totalValue);

    return {
      unbilledValue: roundCurrency(unbilledValue),
      unbilledCount: unbilled._count._all,
      invoicesDueValue: roundCurrency(invoicesDueValue),
      invoicesDueCount: due._count._all,
      invoicesOverdueValue: roundCurrency(invoicesOverdueValue),
      invoicesOverdueCount: overdue._count._all,
      totalReceivable: roundCurrency(unbilledValue + invoicesDueValue + invoicesOverdueValue),
      driverAvailableBalance: wallets.availableBalance,
      driverBlockedBalance: wallets.blockedBalance,
      pendingWithdrawalValue: wallets.pendingWithdrawalAmount,
    };
  }

  /**
   * Contas a receber no instante atual, classificadas pela idade da dívida.
   *
   * Entregas ainda sem fatura formam uma faixa própria. Faturas entram em
   * exatamente uma faixa pela data civil de vencimento, evitando dupla
   * contagem entre o total, o cliente e o aging.
   */
  async receivablesAging(): Promise<ReceivablesAgingReport> {
    await this.invoiceService.refreshOverdueInvoices();

    const asOf = dateInSaoPaulo(this.clock.now());
    const { unbilledGroups, invoiceGroups, companies } = await this.prisma.$transaction(
      async (tx) => {
        const [currentUnbilledGroups, currentInvoiceGroups] = await Promise.all([
          tx.delivery.groupBy({
            by: ['companyId'],
            where: { status: 'COMPLETED', paymentMethod: 'BILLED', invoiceId: null },
            _count: { _all: true },
            _sum: { totalValue: true },
            _min: { statusChangedAt: true },
          }),
          tx.invoice.groupBy({
            by: ['companyId', 'status', 'dueDate'],
            where: { status: { in: ['PENDING', 'OVERDUE'] } },
            _count: { _all: true },
            _sum: { totalValue: true },
          }),
        ]);
        const companyIds = [
          ...new Set([
            ...currentUnbilledGroups.map((group) => group.companyId),
            ...currentInvoiceGroups.map((group) => group.companyId),
          ]),
        ];
        const currentCompanies = companyIds.length
          ? await tx.company.findMany({
              where: { id: { in: companyIds } },
              select: { id: true, tradeName: true },
            })
          : [];
        return {
          unbilledGroups: currentUnbilledGroups,
          invoiceGroups: currentInvoiceGroups,
          companies: currentCompanies,
        };
      },
      // Sem este snapshot, um fechamento concorrente poderia fazer o mesmo
      // valor aparecer como "sem fatura" na primeira consulta e faturado na
      // segunda. O relatório financeiro precisa reconciliar centavo a centavo.
      { isolationLevel: 'RepeatableRead' },
    );
    const companyNames = new Map(companies.map((company) => [company.id, company.tradeName]));
    const companyRows = new Map<string, ReceivablesCompanyAccumulator>();
    const buckets = new Map<ReceivablesAgingBucketKey, { count: number; values: number[] }>(
      RECEIVABLE_BUCKET_ORDER.map((key) => [key, { count: 0, values: [] }]),
    );

    const getCompany = (companyId: string): ReceivablesCompanyAccumulator => {
      const current = companyRows.get(companyId);
      if (current) return current;
      const created = emptyCompany(
        companyId,
        companyNames.get(companyId) ?? 'Empresa não encontrada',
      );
      companyRows.set(companyId, created);
      return created;
    };

    for (const group of unbilledGroups) {
      const count = group._count._all;
      const value = numberOrZero(group._sum.totalValue);
      const oldestDate = group._min.statusChangedAt
        ? dateInSaoPaulo(group._min.statusChangedAt)
        : null;
      const company = getCompany(group.companyId);
      company.unbilledCount += count;
      company.unbilledValue = somarEmCentavos([company.unbilledValue, value]);
      company.oldestUnbilledDate = oldestDate;
      company.maxUnbilledDays = oldestDate ? daysBetweenCivilDates(asOf, oldestDate) : 0;
      company.totalReceivable = somarEmCentavos([company.totalReceivable, value]);

      const bucket = buckets.get('UNBILLED')!;
      bucket.count += count;
      bucket.values.push(value);
    }

    for (const group of invoiceGroups) {
      const count = group._count._all;
      const value = numberOrZero(group._sum.totalValue);
      const dueDate = databaseDate(group.dueDate);
      const daysOverdue = daysBetweenCivilDates(asOf, dueDate);
      const bucketKey = dueDate >= asOf ? 'NOT_DUE' : overdueBucket(daysOverdue);
      const company = getCompany(group.companyId);

      if (bucketKey === 'NOT_DUE') {
        company.notDueInvoiceCount += count;
        company.notDueInvoiceValue = somarEmCentavos([company.notDueInvoiceValue, value]);
      } else {
        company.overdueInvoiceCount += count;
        company.overdueInvoiceValue = somarEmCentavos([company.overdueInvoiceValue, value]);
        company.maxOverdueDays = Math.max(company.maxOverdueDays, daysOverdue);
        company.oldestOverdueDate =
          !company.oldestOverdueDate || dueDate < company.oldestOverdueDate
            ? dueDate
            : company.oldestOverdueDate;
      }
      company.totalReceivable = somarEmCentavos([company.totalReceivable, value]);

      const bucket = buckets.get(bucketKey)!;
      bucket.count += count;
      bucket.values.push(value);
    }

    const bucketItems: ReceivablesAgingBucketItem[] = RECEIVABLE_BUCKET_ORDER.map((key) => {
      const bucket = buckets.get(key)!;
      return { key, count: bucket.count, value: somarEmCentavos(bucket.values) };
    });
    const bucketByKey = new Map(bucketItems.map((bucket) => [bucket.key, bucket]));
    const unbilled = bucketByKey.get('UNBILLED')!;
    const notDue = bucketByKey.get('NOT_DUE')!;
    const overdueBuckets = bucketItems.filter((bucket) => bucket.key.startsWith('OVERDUE_'));
    const overdueCount = overdueBuckets.reduce((total, bucket) => total + bucket.count, 0);
    const overdueValue = somarEmCentavos(overdueBuckets.map((bucket) => bucket.value));
    const invoicesValue = somarEmCentavos([notDue.value, overdueValue]);

    return {
      asOf,
      totalReceivable: somarEmCentavos([unbilled.value, invoicesValue]),
      totalCompanies: companyRows.size,
      unbilled: { count: unbilled.count, value: unbilled.value },
      invoices: {
        count: notDue.count + overdueCount,
        value: invoicesValue,
        notDueCount: notDue.count,
        notDueValue: notDue.value,
        overdueCount,
        overdueValue,
      },
      buckets: bucketItems,
      companies: [...companyRows.values()].sort(
        (left, right) =>
          right.totalReceivable - left.totalReceivable ||
          left.companyName.localeCompare(right.companyName, 'pt-BR'),
      ),
    };
  }

  /**
   * Obrigações atuais com entregadores e idade dos saques ainda abertos.
   *
   * O saque pendente já foi reservado por um DEBIT_WITHDRAWAL PENDING e,
   * portanto, já saiu de `availableBalance`. Para não esconder essa obrigação,
   * o total soma disponível + bloqueado + reservado em saques.
   */
  async payoutsAging(): Promise<PayoutsAgingReport> {
    const asOf = dateInSaoPaulo(this.clock.now());
    const { wallets, transactionGroups, openWithdrawals } = await this.prisma.$transaction(
      async (tx) => {
        const [currentWallets, currentTransactionGroups, currentOpenWithdrawals] =
          await Promise.all([
            tx.wallet.findMany({
              where: { driverId: { not: null } },
              select: {
                id: true,
                cachedAvailableBalance: true,
                cachedBlockedBalance: true,
                driver: {
                  select: {
                    id: true,
                    user: { select: { name: true, email: true } },
                  },
                },
              },
            }),
            tx.walletTransaction.groupBy({
              by: ['walletId', 'type', 'status'],
              where: { wallet: { driverId: { not: null } } },
              _sum: { amount: true },
            }),
            tx.withdrawalRequest.findMany({
              where: {
                status: { in: ['PENDING', 'APPROVED'] },
                wallet: { driverId: { not: null } },
              },
              select: {
                walletId: true,
                status: true,
                requestedAmount: true,
                netAmount: true,
                createdAt: true,
              },
            }),
          ]);
        return {
          wallets: currentWallets,
          transactionGroups: currentTransactionGroups,
          openWithdrawals: currentOpenWithdrawals,
        };
      },
      // Aprovar/pagar/rejeitar um saque altera solicitação e ledger na mesma
      // operação. O relatório precisa enxergar os dois lados do mesmo snapshot.
      { isolationLevel: 'RepeatableRead' },
    );

    const transactionsByWallet = new Map<
      string,
      { type: WalletTransactionType; status: string; amount: { toString(): string } }[]
    >();
    for (const group of transactionGroups) {
      const transaction = {
        type: group.type as WalletTransactionType,
        status: group.status,
        amount: { toString: () => numberOrZero(group._sum.amount).toString() },
      };
      const current = transactionsByWallet.get(group.walletId);
      if (current) current.push(transaction);
      else transactionsByWallet.set(group.walletId, [transaction]);
    }

    const driverByWallet = new Map<string, DriverPayoutPositionItem>();
    for (const wallet of wallets) {
      if (!wallet.driver) continue;
      const balances = calculateWalletBalances(transactionsByWallet.get(wallet.id) ?? []);
      const row: DriverPayoutPositionItem = {
        driverId: wallet.driver.id,
        driverName: wallet.driver.user.name,
        driverEmail: wallet.driver.user.email,
        walletId: wallet.id,
        ...balances,
        totalObligation: somarEmCentavos([
          balances.availableBalance,
          balances.blockedBalance,
          balances.pendingWithdrawalAmount,
        ]),
        openWithdrawalCount: 0,
        openRequestedValue: 0,
        openNetValue: 0,
        pendingRequestCount: 0,
        pendingNetValue: 0,
        approvedRequestCount: 0,
        approvedNetValue: 0,
        oldestOpenDate: null,
        maxOpenDays: 0,
        cacheMatchesLedger:
          roundCurrency(Number(wallet.cachedAvailableBalance)) === balances.availableBalance &&
          roundCurrency(Number(wallet.cachedBlockedBalance)) === balances.blockedBalance,
        withdrawalLedgerDifference: balances.pendingWithdrawalAmount,
      };
      driverByWallet.set(wallet.id, row);
    }

    const buckets = new Map<
      PayoutAgingBucketKey,
      { count: number; requestedValues: number[]; netValues: number[] }
    >(PAYOUT_BUCKET_ORDER.map((key) => [key, { count: 0, requestedValues: [], netValues: [] }]));
    let pendingCount = 0;
    const pendingNetValues: number[] = [];
    let approvedCount = 0;
    const approvedNetValues: number[] = [];

    for (const withdrawal of openWithdrawals) {
      const driver = driverByWallet.get(withdrawal.walletId);
      if (!driver) continue;
      const requestedValue = numberOrZero(withdrawal.requestedAmount);
      const netValue = numberOrZero(withdrawal.netAmount);
      const createdDate = dateInSaoPaulo(withdrawal.createdAt);
      const openDays = daysBetweenCivilDates(asOf, createdDate);

      driver.openWithdrawalCount += 1;
      driver.openRequestedValue = somarEmCentavos([driver.openRequestedValue, requestedValue]);
      driver.openNetValue = somarEmCentavos([driver.openNetValue, netValue]);
      driver.oldestOpenDate =
        !driver.oldestOpenDate || createdDate < driver.oldestOpenDate
          ? createdDate
          : driver.oldestOpenDate;
      driver.maxOpenDays = Math.max(driver.maxOpenDays, openDays);
      driver.withdrawalLedgerDifference = somarEmCentavos([
        driver.withdrawalLedgerDifference,
        -requestedValue,
      ]);

      if (withdrawal.status === 'PENDING') {
        driver.pendingRequestCount += 1;
        driver.pendingNetValue = somarEmCentavos([driver.pendingNetValue, netValue]);
        pendingCount += 1;
        pendingNetValues.push(netValue);
      } else {
        driver.approvedRequestCount += 1;
        driver.approvedNetValue = somarEmCentavos([driver.approvedNetValue, netValue]);
        approvedCount += 1;
        approvedNetValues.push(netValue);
      }

      const bucket = buckets.get(payoutBucket(openDays))!;
      bucket.count += 1;
      bucket.requestedValues.push(requestedValue);
      bucket.netValues.push(netValue);
    }

    const bucketItems: PayoutAgingBucketItem[] = PAYOUT_BUCKET_ORDER.map((key) => {
      const bucket = buckets.get(key)!;
      return {
        key,
        count: bucket.count,
        requestedValue: somarEmCentavos(bucket.requestedValues),
        netValue: somarEmCentavos(bucket.netValues),
      };
    });
    const drivers = [...driverByWallet.values()].sort(
      (left, right) =>
        right.totalObligation - left.totalObligation ||
        left.driverName.localeCompare(right.driverName, 'pt-BR'),
    );
    const availableBalance = somarEmCentavos(drivers.map((driver) => driver.availableBalance));
    const blockedBalance = somarEmCentavos(drivers.map((driver) => driver.blockedBalance));
    const pendingWithdrawalAmount = somarEmCentavos(
      drivers.map((driver) => driver.pendingWithdrawalAmount),
    );
    const requestedValue = somarEmCentavos(drivers.map((driver) => driver.openRequestedValue));
    const netValue = somarEmCentavos(drivers.map((driver) => driver.openNetValue));
    const withdrawalLedgerDifference = somarEmCentavos(
      drivers.map((driver) => driver.withdrawalLedgerDifference),
    );
    const oldestOpenDate =
      drivers
        .map((driver) => driver.oldestOpenDate)
        .filter((date): date is string => date !== null)
        .sort()[0] ?? null;
    const maxOpenDays = Math.max(0, ...drivers.map((driver) => driver.maxOpenDays));

    return {
      asOf,
      totalObligation: somarEmCentavos([availableBalance, blockedBalance, pendingWithdrawalAmount]),
      wallets: {
        driverCount: drivers.length,
        availableBalance,
        blockedBalance,
        pendingWithdrawalAmount,
        divergentCount: drivers.filter((driver) => !driver.cacheMatchesLedger).length,
      },
      withdrawals: {
        openCount: pendingCount + approvedCount,
        requestedValue,
        netValue,
        pendingCount,
        pendingNetValue: somarEmCentavos(pendingNetValues),
        approvedCount,
        approvedNetValue: somarEmCentavos(approvedNetValues),
        oldestOpenDate,
        maxOpenDays,
        withdrawalLedgerDifference,
      },
      buckets: bucketItems,
      drivers,
    };
  }

  /**
   * Resultado gerencial por competência.
   *
   * A competência nasce quando a entrega chega a COMPLETED. Movimentos de
   * saque e liberação não entram novamente, pois seriam caixa ou mudança de
   * disponibilidade da mesma obrigação. Ajustes de carteira ficam visíveis em
   * bloco separado, sem classificação contábil inventada.
   */
  async financialStatement(query: FinancialStatementQuery): Promise<FinancialStatementReport> {
    const periodFrom = startOfDayInSaoPaulo(query.from);
    const periodToExclusive = new Date(endOfDayInSaoPaulo(query.to).getTime() + 1);
    const duration = periodToExclusive.getTime() - periodFrom.getTime();
    const comparisonToExclusive = periodFrom;
    const comparisonFrom = new Date(periodFrom.getTime() - duration);
    const adjustmentTypes = ['CREDIT_ADJUSTMENT', 'DEBIT_ADJUSTMENT', 'CREDIT_REFUND'] as const;

    const { currentDeliveries, comparisonDeliveries, adjustmentGroups } =
      await this.prisma.$transaction(
        async (tx) => {
          const [current, comparison, adjustments] = await Promise.all([
            tx.delivery.findMany({
              where: {
                status: 'COMPLETED',
                statusChangedAt: { gte: periodFrom, lt: periodToExclusive },
              },
              select: {
                statusChangedAt: true,
                totalValue: true,
                driverValue: true,
                platformValue: true,
                paymentMethod: true,
                company: { select: { id: true, tradeName: true } },
                serviceType: { select: { id: true, name: true } },
              },
            }),
            tx.delivery.findMany({
              where: {
                status: 'COMPLETED',
                statusChangedAt: { gte: comparisonFrom, lt: comparisonToExclusive },
              },
              select: {
                totalValue: true,
                driverValue: true,
                platformValue: true,
              },
            }),
            tx.walletTransaction.groupBy({
              by: ['type', 'status'],
              where: {
                wallet: { driverId: { not: null } },
                type: { in: [...adjustmentTypes] },
                status: { not: 'CANCELLED' },
                createdAt: { gte: periodFrom, lt: periodToExclusive },
              },
              _count: { _all: true },
              _sum: { amount: true },
            }),
          ]);
          return {
            currentDeliveries: current,
            comparisonDeliveries: comparison,
            adjustmentGroups: adjustments,
          };
        },
        // Uma conclusão e seu crédito de repasse são gravados na mesma
        // transação. O demonstrativo precisa ler dimensões e ledger no mesmo
        // snapshot para não mostrar metades de estados concorrentes.
        { isolationLevel: 'RepeatableRead' },
      );

    const totals = financialStatementTotals(currentDeliveries);
    const comparisonTotals = financialStatementTotals(comparisonDeliveries);
    const companies = statementDimensions(currentDeliveries, totals.platformValue, (delivery) => ({
      id: delivery.company.id,
      name: delivery.company.tradeName,
    }));
    const serviceTypes = statementDimensions(
      currentDeliveries,
      totals.platformValue,
      (delivery) => ({ id: delivery.serviceType.id, name: delivery.serviceType.name }),
    );

    const paymentMethods: FinancialStatementPaymentMethodItem[] = (
      ['BILLED', 'ONLINE'] as const
    ).map((paymentMethod) => ({
      paymentMethod,
      ...financialStatementTotals(
        currentDeliveries.filter((delivery) => delivery.paymentMethod === paymentMethod),
      ),
    }));

    const rowsByDay = new Map<string, typeof currentDeliveries>();
    for (const delivery of currentDeliveries) {
      const day = dateInSaoPaulo(delivery.statusChangedAt);
      const rows = rowsByDay.get(day);
      if (rows) rows.push(delivery);
      else rowsByDay.set(day, [delivery]);
    }
    const days: FinancialStatementDayItem[] = [...rowsByDay.entries()]
      .map(([day, rows]) => ({ day, ...financialStatementTotals(rows) }))
      .sort((left, right) => left.day.localeCompare(right.day));

    const adjustmentItems: FinancialStatementAdjustmentItem[] = adjustmentGroups
      .map((group) => ({
        type: group.type as FinancialStatementAdjustmentItem['type'],
        status: group.status,
        direction: (group.type === 'DEBIT_ADJUSTMENT' ? 'DEBIT' : 'CREDIT') as 'CREDIT' | 'DEBIT',
        count: group._count._all,
        value: numberOrZero(group._sum.amount),
      }))
      .sort(
        (left, right) =>
          adjustmentTypes.indexOf(left.type) - adjustmentTypes.indexOf(right.type) ||
          left.status.localeCompare(right.status),
      );
    const creditItems = adjustmentItems.filter((item) => item.direction === 'CREDIT');
    const debitItems = adjustmentItems.filter((item) => item.direction === 'DEBIT');
    const creditValue = somarEmCentavos(creditItems.map((item) => item.value));
    const debitValue = somarEmCentavos(debitItems.map((item) => item.value));

    return {
      period: { from: query.from, to: query.to },
      live: query.to === dateInSaoPaulo(this.clock.now()),
      totals,
      comparison: {
        period: {
          from: dateInSaoPaulo(comparisonFrom),
          to: dateInSaoPaulo(new Date(comparisonToExclusive.getTime() - 1)),
        },
        totals: comparisonTotals,
        changePercent: {
          completedCount: percentChange(totals.completedCount, comparisonTotals.completedCount),
          totalValue: percentChange(totals.totalValue, comparisonTotals.totalValue),
          driverValue: percentChange(totals.driverValue, comparisonTotals.driverValue),
          platformValue: percentChange(totals.platformValue, comparisonTotals.platformValue),
          averageTicket: percentChange(totals.averageTicket, comparisonTotals.averageTicket),
        },
        contributionMarginPercentagePointChange: roundMetric(
          totals.contributionMarginPercent - comparisonTotals.contributionMarginPercent,
        ),
      },
      walletAdjustments: {
        creditCount: creditItems.reduce((total, item) => total + item.count, 0),
        creditValue,
        debitCount: debitItems.reduce((total, item) => total + item.count, 0),
        debitValue,
        netDriverObligationImpact: somarEmCentavos([creditValue, -debitValue]),
        items: adjustmentItems,
      },
      companies,
      serviceTypes,
      paymentMethods,
      days,
    };
  }

  async overview(filters: AdminFinancialOverviewQuery): Promise<AdminFinancialOverview> {
    const completedWhere = {
      status: 'COMPLETED' as const,
      ...(filters.from || filters.to
        ? {
            statusChangedAt: {
              ...(filters.from && { gte: this.startOfDay(filters.from) }),
              ...(filters.to && { lte: this.endOfDay(filters.to) }),
            },
          }
        : {}),
    };

    const [completed, unbilled, pendingInvoices, overdueInvoices, transactionGroups] =
      await Promise.all([
        this.prisma.delivery.aggregate({
          where: completedWhere,
          _count: { _all: true },
          _sum: { totalValue: true, driverValue: true, platformValue: true },
        }),
        this.prisma.delivery.aggregate({
          where: { ...completedWhere, paymentMethod: 'BILLED', invoiceId: null },
          _sum: { totalValue: true },
        }),
        this.prisma.invoice.aggregate({
          where: { status: 'PENDING' },
          _count: { _all: true },
          _sum: { totalValue: true },
        }),
        this.prisma.invoice.aggregate({
          where: { status: 'OVERDUE' },
          _count: { _all: true },
          _sum: { totalValue: true },
        }),
        this.prisma.walletTransaction.groupBy({
          by: ['type', 'status'],
          _sum: { amount: true },
        }),
      ]);

    const walletBalances = calculateWalletBalances(
      transactionGroups.map((group) => ({
        type: group.type as WalletTransactionType,
        status: group.status,
        amount: { toString: () => numberOrZero(group._sum.amount).toString() },
      })),
    );

    return {
      completedDeliveries: {
        count: completed._count._all,
        totalValue: numberOrZero(completed._sum.totalValue),
        driverValue: numberOrZero(completed._sum.driverValue),
        platformValue: numberOrZero(completed._sum.platformValue),
        unbilledValue: numberOrZero(unbilled._sum.totalValue),
      },
      invoices: {
        pendingCount: pendingInvoices._count._all,
        overdueCount: overdueInvoices._count._all,
        totalReceivable: roundCurrency(
          numberOrZero(pendingInvoices._sum.totalValue) +
            numberOrZero(overdueInvoices._sum.totalValue),
        ),
      },
      driverWallets: walletBalances,
    };
  }

  async listDriverWallets(filters: ListAdminWalletsQuery): Promise<AdminDriverWalletItem[]> {
    const drivers = await this.prisma.driver.findMany({
      where: filters.search
        ? {
            user: {
              OR: [
                { name: { contains: filters.search, mode: 'insensitive' } },
                { email: { contains: filters.search, mode: 'insensitive' } },
              ],
            },
          }
        : undefined,
      include: {
        user: { select: { name: true, email: true } },
        wallet: {
          include: { transactions: { select: { type: true, status: true, amount: true } } },
        },
      },
      orderBy: { user: { name: 'asc' } },
      take: filters.limit,
    });

    return drivers.map((driver) => this.toDriverWalletItem(driver));
  }

  /**
   * Ajuste manual na carteira do motoboy, lancado pelo admin.
   *
   * Existe porque erro de repasse, cobranca indevida e acerto combinado
   * acontecem na primeira semana de operacao real, e sem isto a unica saida e
   * escrever SQL direto no banco de producao — sem motivo registrado, sem
   * autor, e sem aparecer no extrato do motoboy.
   *
   * O lancamento entra pelo MESMO ledger do repasse, e nao mexendo no saldo:
   * a carteira nao e um numero mutavel, e a soma das linhas. Escrever o saldo
   * na mao criaria uma segunda verdade que discordaria do extrato.
   *
   * Ajuste nasce RELEASED, e nao PENDING: o repasse fica bloqueado ate a
   * segunda porque e adiantamento de servico prestado; uma correcao de erro
   * nosso nao tem por que fazer o motoboy esperar.
   */
  async adjustDriverWallet(
    driverId: string,
    payload: AdjustDriverWalletPayload,
    adminUserId: string,
  ): Promise<AdminDriverWalletDetail> {
    const driver = await this.prisma.driver.findUnique({
      where: { id: driverId },
      select: { id: true },
    });
    if (!driver) {
      throw new NotFoundException('Entregador não encontrado.');
    }

    const ehCredito = payload.type === 'CREDIT';

    await this.prisma.$transaction(async (tx) => {
      const wallet = await tx.wallet.upsert({
        where: { driverId },
        update: {},
        create: { driverId },
      });

      await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type: ehCredito ? 'CREDIT_ADJUSTMENT' : 'DEBIT_ADJUSTMENT',
          status: 'RELEASED',
          amount: payload.amount,
          reason: payload.reason,
          createdByUserId: adminUserId,
        },
      });

      /**
       * O cache do saldo acompanha o lancamento na MESMA transacao.
       *
       * Debito pode deixar o saldo negativo, e isso e proposital: se o motoboy
       * recebeu a mais, ele passa a dever, e esconder isso zerando o saldo
       * apagaria a divida. A tela mostra negativo em vermelho.
       */
      await tx.wallet.update({
        where: { id: wallet.id },
        data: {
          cachedAvailableBalance: ehCredito
            ? { increment: payload.amount }
            : { decrement: payload.amount },
        },
      });
    });

    // O detalhe recarregado ja inclui o ajuste recem-criado, entao a tela nao
    // precisa de uma segunda chamada para mostrar o extrato atualizado.
    return this.getDriverWallet(driverId, { limit: 50 });
  }

  async getDriverWallet(
    driverId: string,
    filters: ListWalletTransactionsQuery,
  ): Promise<AdminDriverWalletDetail> {
    const driver = await this.prisma.driver.findUnique({
      where: { id: driverId },
      include: {
        user: { select: { name: true, email: true } },
        wallet: {
          include: {
            transactions: {
              where: {
                ...(filters.status && { status: filters.status }),
                ...(filters.from || filters.to
                  ? {
                      createdAt: {
                        ...(filters.from && { gte: this.startOfDay(filters.from) }),
                        ...(filters.to && { lte: this.endOfDay(filters.to) }),
                      },
                    }
                  : {}),
              },
              include: {
                delivery: {
                  select: {
                    id: true,
                    displayNumber: true,
                    company: { select: { tradeName: true } },
                  },
                },
              },
              orderBy: { createdAt: 'desc' },
              take: filters.limit,
            },
          },
        },
      },
    });
    if (!driver) {
      throw new NotFoundException('Motoboy não encontrado.');
    }
    const allTransactions = driver.wallet
      ? await this.prisma.walletTransaction.findMany({
          where: { walletId: driver.wallet.id },
          select: { type: true, status: true, amount: true },
        })
      : [];
    const summary = this.toDriverWalletItem({
      ...driver,
      wallet: driver.wallet ? { ...driver.wallet, transactions: allTransactions } : null,
    });

    return {
      ...summary,
      transactions: driver.wallet?.transactions.map(toWalletTransactionItem) ?? [],
    };
  }

  private toDriverWalletItem(driver: {
    id: string;
    user: { name: string; email: string };
    wallet: {
      id: string;
      cachedAvailableBalance: { toString(): string };
      cachedBlockedBalance: { toString(): string };
      transactions: {
        type: WalletTransactionType;
        status: string;
        amount: { toString(): string };
      }[];
    } | null;
  }): AdminDriverWalletItem {
    const balances = calculateWalletBalances(driver.wallet?.transactions ?? []);
    return {
      driverId: driver.id,
      driverName: driver.user.name,
      driverEmail: driver.user.email,
      walletId: driver.wallet?.id ?? null,
      ...balances,
      cacheMatchesLedger:
        !driver.wallet ||
        (roundCurrency(Number(driver.wallet.cachedAvailableBalance)) ===
          balances.availableBalance &&
          roundCurrency(Number(driver.wallet.cachedBlockedBalance)) === balances.blockedBalance),
    };
  }

  /**
   * O filtro por data e lido no relogio da operacao, nao em UTC.
   *
   * Com as pontas em `T00:00:00Z`/`T23:59:59Z`, o registro das 22h de terca
   * caia no recorte de quarta: tres horas de todo dia lancadas no dia errado.
   * Quem digita 22/08 no painel quer o dia 22 em Lajinha.
   */
  /**
   * Extrato de recebimentos: o que entrou, agrupado por dia.
   *
   * O agrupamento acontece AQUI, e nao na tela, por dois motivos. O total do
   * dia sai de `Decimal(10,2)` somado no servidor — somar float no cliente faz
   * o numero exibido divergir do real depois de algumas dezenas de linhas. E o
   * agrupamento por dia usa o fuso da operacao: fazer isso com
   * `toISOString().slice(0, 10)` jogaria todo recebimento depois das 21h para o
   * dia seguinte.
   */
  async receipts(filters: ListReceiptsQuery): Promise<ReceiptsReport> {
    const faturas = await this.prisma.invoice.findMany({
      where: {
        status: 'PAID',
        paymentDate: {
          gte: startOfDayInSaoPaulo(filters.from),
          lte: endOfDayInSaoPaulo(filters.to),
        },
        ...(filters.onlineOnly && { paymentMethod: 'ONLINE' }),
      },
      select: {
        id: true,
        number: true,
        companyId: true,
        totalValue: true,
        paymentDate: true,
        paymentMethod: true,
        company: { select: { tradeName: true } },
      },
      orderBy: { paymentDate: 'desc' },
    });

    const porDia = new Map<string, ReceiptItem[]>();
    for (const fatura of faturas) {
      // `paymentDate` é obrigatório em fatura PAID, mas o schema o deixa
      // opcional; sem esta guarda, uma linha inconsistente derrubaria o extrato
      // inteiro em vez de apenas faltar.
      if (!fatura.paymentDate) continue;

      const dia = dateInSaoPaulo(fatura.paymentDate);
      const linha: ReceiptItem = {
        invoiceId: fatura.id,
        invoiceNumber: fatura.number,
        companyId: fatura.companyId,
        companyName: fatura.company.tradeName,
        paidAt: fatura.paymentDate.toISOString(),
        paymentMethod: fatura.paymentMethod,
        amount: Number(fatura.totalValue),
      };

      const doDia = porDia.get(dia);
      if (doDia) doDia.push(linha);
      else porDia.set(dia, [linha]);
    }

    const days = [...porDia.entries()]
      // Mais recente primeiro: quem abre o extrato quer ver ontem, nao o
      // primeiro dia do mes.
      .sort(([diaA], [diaB]) => diaB.localeCompare(diaA))
      .map(([day, receipts]) => ({
        day,
        total: somarEmCentavos(receipts.map((r) => r.amount)),
        receipts,
      }));

    return {
      total: somarEmCentavos(days.map((dia) => dia.total)),
      days,
    };
  }

  private startOfDay(date: string): Date {
    return startOfDayInSaoPaulo(date);
  }

  private endOfDay(date: string): Date {
    return endOfDayInSaoPaulo(date);
  }
}
