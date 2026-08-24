import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  AdminFinancialOverviewQuery,
  ListAdminWalletsQuery,
  ListReceiptsQuery,
  ListWalletTransactionsQuery,
} from '@motoboycity/validation';
import type { CashPositionItem, ReceiptItem, ReceiptsReport } from '@motoboycity/types';
import { PrismaService } from '../prisma/prisma.service';
import { InvoiceService } from './invoice.service';
import {
  calculateWalletBalances,
  toWalletTransactionItem,
  type WalletTransactionItem,
  type WalletTransactionType,
} from './driver-wallet.service';
import { dateInSaoPaulo, endOfDayInSaoPaulo, startOfDayInSaoPaulo } from '../common/sao-paulo-time';

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

@Injectable()
export class AdminFinancialService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly invoiceService: InvoiceService,
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
