import { ForbiddenException, Injectable } from '@nestjs/common';
import type { ListWalletTransactionsQuery } from '@motoboycity/validation';
import type { User } from '@prisma/client';
import type { WithdrawalPolicy } from '@motoboycity/types';
import { PrismaService } from '../prisma/prisma.service';
import { AdminPlatformSettingsService } from '../admin/platform-settings/admin-platform-settings.service';
import { isWithdrawalDayInSaoPaulo, withdrawalWeekdayLabel } from './finance-release.utils';
import { endOfDayInSaoPaulo, startOfDayInSaoPaulo } from '../common/sao-paulo-time';

export type WalletTransactionType =
  | 'CREDIT_REPASSE'
  | 'DEBIT_WITHDRAWAL'
  | 'DEBIT_FEE'
  | 'CREDIT_ADVANCE_RELEASE'
  | 'CREDIT_ADJUSTMENT'
  | 'DEBIT_ADJUSTMENT'
  | 'CREDIT_REFUND';

export interface WalletTransactionItem {
  id: string;
  type: WalletTransactionType;
  status: 'PENDING' | 'RELEASED' | 'CANCELLED';
  amount: number;
  direction: 'CREDIT' | 'DEBIT';
  relatedDelivery: { id: string; displayNumber: number; companyName: string } | null;
  releaseAt: string | null;
  createdAt: string;
}

export interface DriverWalletSummary {
  walletId: string | null;
  /** Ver `WithdrawalPolicy` em `packages/types`: a decisão vem pronta daqui. */
  withdrawal: WithdrawalPolicy;
  availableBalance: number;
  blockedBalance: number;
  pendingWithdrawalAmount: number;
  cacheMatchesLedger: boolean;
  transactions: WalletTransactionItem[];
  withdrawalRequests: Array<{
    id: string;
    walletId: string;
    driver: { id: string; name: string; email: string };
    requestedAmount: number;
    feeAmount: number;
    netAmount: number;
    status: 'PENDING' | 'APPROVED' | 'PAID' | 'REJECTED';
    pixKey: string | null;
    pixKeyType: string | null;
    accountHolderName: string | null;
    paymentReference: string | null;
    createdAt: string;
    statusHistory: Array<{
      fromStatus: 'PENDING' | 'APPROVED' | 'PAID' | 'REJECTED' | null;
      toStatus: 'PENDING' | 'APPROVED' | 'PAID' | 'REJECTED';
      changedAt: string;
      changedBy: { id: string; name: string } | null;
      note: string | null;
    }>;
  }>;
}

const CREDIT_TRANSACTION_TYPES = new Set<WalletTransactionType>([
  'CREDIT_REPASSE',
  'CREDIT_ADVANCE_RELEASE',
  'CREDIT_ADJUSTMENT',
  'CREDIT_REFUND',
]);

export function toWalletTransactionItem(transaction: {
  id: string;
  type: WalletTransactionType;
  status: 'PENDING' | 'RELEASED' | 'CANCELLED';
  amount: { toString(): string };
  releaseAt: Date | null;
  createdAt: Date;
  delivery: { id: string; displayNumber: number; company: { tradeName: string } } | null;
}): WalletTransactionItem {
  const isCredit = CREDIT_TRANSACTION_TYPES.has(transaction.type);
  return {
    id: transaction.id,
    type: transaction.type,
    status: transaction.status,
    amount: Number(transaction.amount),
    direction: isCredit ? 'CREDIT' : 'DEBIT',
    relatedDelivery: transaction.delivery
      ? {
          id: transaction.delivery.id,
          displayNumber: transaction.delivery.displayNumber,
          companyName: transaction.delivery.company.tradeName,
        }
      : null,
    releaseAt: transaction.releaseAt?.toISOString() ?? null,
    createdAt: transaction.createdAt.toISOString(),
  };
}

function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function calculateWalletBalances(
  transactions: { type: WalletTransactionType; status: string; amount: { toString(): string } }[],
) {
  let availableBalance = 0;
  let blockedBalance = 0;
  let pendingWithdrawalAmount = 0;

  for (const transaction of transactions) {
    if (transaction.status === 'CANCELLED') continue;

    const amount = Number(transaction.amount);
    const isCredit = CREDIT_TRANSACTION_TYPES.has(transaction.type);

    if (transaction.status === 'PENDING') {
      if (isCredit) {
        blockedBalance += amount;
      } else {
        availableBalance -= amount;
        if (transaction.type === 'DEBIT_WITHDRAWAL') pendingWithdrawalAmount += amount;
      }
      continue;
    }

    availableBalance += isCredit ? amount : -amount;
  }

  return {
    availableBalance: roundCurrency(availableBalance),
    blockedBalance: roundCurrency(blockedBalance),
    pendingWithdrawalAmount: roundCurrency(pendingWithdrawalAmount),
  };
}

@Injectable()
export class DriverWalletService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly platformSettings: AdminPlatformSettingsService,
  ) {}

  /**
   * A politica vai junto da carteira, e nao num endpoint proprio: a tela do
   * saque ja carrega a carteira, e um segundo pedido so para saber o dia
   * abriria a janela em que os dois discordam.
   */
  private async politicaDoSaque(): Promise<WithdrawalPolicy> {
    const { withdrawalWeekday } = await this.platformSettings.get();
    return {
      openToday: isWithdrawalDayInSaoPaulo(new Date(), withdrawalWeekday),
      weekdayLabel: withdrawalWeekdayLabel(withdrawalWeekday),
    };
  }

  async getForDriver(
    user: User,
    filters: ListWalletTransactionsQuery,
  ): Promise<DriverWalletSummary> {
    if (user.type !== 'DRIVER') {
      throw new ForbiddenException('Acesso restrito a entregadores.');
    }

    const driver = await this.prisma.driver.findUnique({ where: { userId: user.id } });
    if (!driver) {
      throw new ForbiddenException('Usuário não está vinculado a um cadastro de motoboy.');
    }

    const snapshot = await this.prisma.$transaction(
      async (tx) => {
        const wallet = await tx.wallet.findUnique({
          where: { driverId: driver.id },
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
            withdrawalRequests: {
              include: {
                statusHistory: {
                  orderBy: { changedAt: 'asc' },
                  include: { changedByUser: { select: { id: true, name: true } } },
                },
              },
              orderBy: { createdAt: 'desc' },
              take: 100,
            },
          },
        });

        if (!wallet) return null;

        const allTransactions = await tx.walletTransaction.findMany({
          where: { walletId: wallet.id },
          select: { type: true, status: true, amount: true },
        });

        return { wallet, allTransactions };
      },
      // Cache e ledger precisam pertencer ao mesmo instante. Sem este snapshot,
      // uma entrega concluída entre as duas leituras gerava um falso alerta de
      // divergência, embora a escrita financeira tivesse sido atômica.
      { isolationLevel: 'RepeatableRead' },
    );

    if (!snapshot) {
      return {
        walletId: null,
        withdrawal: await this.politicaDoSaque(),
        availableBalance: 0,
        blockedBalance: 0,
        pendingWithdrawalAmount: 0,
        cacheMatchesLedger: true,
        transactions: [],
        withdrawalRequests: [],
      };
    }

    const { wallet, allTransactions } = snapshot;
    const balances = calculateWalletBalances(allTransactions);

    return {
      walletId: wallet.id,
      withdrawal: await this.politicaDoSaque(),
      availableBalance: balances.availableBalance,
      blockedBalance: balances.blockedBalance,
      pendingWithdrawalAmount: balances.pendingWithdrawalAmount,
      cacheMatchesLedger:
        roundCurrency(Number(wallet.cachedAvailableBalance)) === balances.availableBalance &&
        roundCurrency(Number(wallet.cachedBlockedBalance)) === balances.blockedBalance,
      transactions: wallet.transactions.map(toWalletTransactionItem),
      withdrawalRequests: wallet.withdrawalRequests.map((request) => ({
        id: request.id,
        walletId: request.walletId,
        driver: { id: driver.id, name: user.name, email: user.email },
        requestedAmount: Number(request.requestedAmount),
        feeAmount: Number(request.feeAmount),
        netAmount: Number(request.netAmount),
        status: request.status,
        pixKey: request.pixKey,
        pixKeyType: request.pixKeyType,
        accountHolderName: request.accountHolderName,
        paymentReference: request.paymentReference,
        createdAt: request.createdAt.toISOString(),
        statusHistory: request.statusHistory.map((entry) => ({
          fromStatus: entry.fromStatus,
          toStatus: entry.toStatus,
          changedAt: entry.changedAt.toISOString(),
          changedBy: entry.changedByUser,
          note: entry.note,
        })),
      })),
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
