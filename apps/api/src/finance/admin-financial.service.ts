import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  AdminFinancialOverviewQuery,
  ListAdminWalletsQuery,
  ListWalletTransactionsQuery,
} from '@motoboycity/validation';
import { PrismaService } from '../prisma/prisma.service';
import {
  calculateWalletBalances,
  toWalletTransactionItem,
  type WalletTransactionItem,
  type WalletTransactionType,
} from './driver-wallet.service';
import { endOfDayInSaoPaulo, startOfDayInSaoPaulo } from '../common/sao-paulo-time';

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

@Injectable()
export class AdminFinancialService {
  constructor(private readonly prisma: PrismaService) {}

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
  private startOfDay(date: string): Date {
    return startOfDayInSaoPaulo(date);
  }

  private endOfDay(date: string): Date {
    return endOfDayInSaoPaulo(date);
  }
}
