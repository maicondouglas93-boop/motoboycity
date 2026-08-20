import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma, type User } from '@prisma/client';
import type {
  ApproveWithdrawalPayload,
  ListWithdrawalRequestsQuery,
  MarkWithdrawalPaidPayload,
  RejectWithdrawalPayload,
  RequestWithdrawalPayload,
} from '@motoboycity/validation';
import { PrismaService } from '../prisma/prisma.service';
import { calculateWalletBalances, type WalletTransactionType } from './driver-wallet.service';
import { FinancialClock } from './financial-clock.service';
import { isMondayInSaoPaulo } from './finance-release.utils';

type WithdrawalStatus = 'PENDING' | 'APPROVED' | 'PAID' | 'REJECTED';

const withdrawalInclude = {
  wallet: {
    include: {
      driver: { include: { user: { select: { id: true, name: true, email: true } } } },
    },
  },
  statusHistory: {
    orderBy: { changedAt: 'asc' },
    include: { changedByUser: { select: { id: true, name: true } } },
  },
} as const;

export interface WithdrawalStatusHistoryItem {
  fromStatus: WithdrawalStatus | null;
  toStatus: WithdrawalStatus;
  changedAt: string;
  changedBy: { id: string; name: string } | null;
  note: string | null;
}

export interface WithdrawalRequestItem {
  id: string;
  walletId: string;
  driver: { id: string; name: string; email: string };
  requestedAmount: number;
  feeAmount: number;
  netAmount: number;
  status: WithdrawalStatus;
  pixKey: string | null;
  pixKeyType: string | null;
  accountHolderName: string | null;
  paymentReference: string | null;
  createdAt: string;
  statusHistory: WithdrawalStatusHistoryItem[];
}

function numberValue(value: { toString(): string }): number {
  return Number(value);
}

function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

@Injectable()
export class FinancialPayoutService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: FinancialClock,
  ) {}

  /**
   * Libera créditos cuja data prevista já chegou. O job semanal inclui os
   * créditos legados sem releaseAt; a inicialização da API só recupera jobs
   * atrasados que já possuíam uma data prevista.
   */
  async releaseDueRepasses(
    now = this.clock.now(),
    options: { includeLegacyWithoutReleaseAt?: boolean } = {},
  ): Promise<number> {
    const includeLegacy = options.includeLegacyWithoutReleaseAt ?? false;
    return this.withSerializableTransaction(async (tx) => {
      const candidates = await tx.walletTransaction.findMany({
        where: {
          type: 'CREDIT_REPASSE',
          status: 'PENDING',
          OR: [
            { releaseAt: { lte: now } },
            ...(includeLegacy ? [{ releaseAt: null }] : []),
          ],
        },
        select: { id: true, walletId: true, amount: true },
      });

      const releasedByWallet = new Map<string, number>();
      for (const candidate of candidates) {
        const updated = await tx.walletTransaction.updateMany({
          where: { id: candidate.id, status: 'PENDING' },
          data: { status: 'RELEASED' },
        });
        if (updated.count === 1) {
          releasedByWallet.set(
            candidate.walletId,
            roundCurrency((releasedByWallet.get(candidate.walletId) ?? 0) + numberValue(candidate.amount)),
          );
        }
      }

      for (const [walletId, amount] of releasedByWallet) {
        await tx.wallet.update({
          where: { id: walletId },
          data: {
            cachedBlockedBalance: { decrement: amount },
            cachedAvailableBalance: { increment: amount },
          },
        });
      }

      return candidates.length;
    });
  }

  async requestWithdrawal(user: User, payload: RequestWithdrawalPayload): Promise<WithdrawalRequestItem> {
    const now = this.clock.now();
    if (!isMondayInSaoPaulo(now)) {
      throw new UnprocessableEntityException('Saques estão disponíveis somente às segundas-feiras.');
    }
    if (user.type !== 'DRIVER') {
      throw new ForbiddenException('Acesso restrito a entregadores.');
    }

    return this.withSerializableTransaction(async (tx) => {
      const driver = await tx.driver.findUnique({
        where: { userId: user.id },
        select: { id: true, pixKey: true, pixKeyType: true },
      });
      if (!driver) {
        throw new ForbiddenException('Usuário não está vinculado a um cadastro de motoboy.');
      }

      const wallet = await tx.wallet.findUnique({ where: { driverId: driver.id } });
      if (!wallet) {
        throw new UnprocessableEntityException('Não há saldo disponível para saque.');
      }

      const transactions = await tx.walletTransaction.findMany({
        where: { walletId: wallet.id },
        select: { type: true, status: true, amount: true },
      });
      const balances = calculateWalletBalances(
        transactions.map((transaction) => ({
          type: transaction.type as WalletTransactionType,
          status: transaction.status,
          amount: transaction.amount,
        })),
      );
      if (roundCurrency(payload.amount) > balances.availableBalance) {
        throw new UnprocessableEntityException('O valor solicitado supera o saldo disponível.');
      }

      const walletTransaction = await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type: 'DEBIT_WITHDRAWAL',
          status: 'PENDING',
          amount: payload.amount,
        },
      });
      const withdrawal = await tx.withdrawalRequest.create({
        data: {
          walletId: wallet.id,
          requestedAmount: payload.amount,
          feeAmount: 0,
          netAmount: payload.amount,
          pixKey: driver.pixKey,
          pixKeyType: driver.pixKeyType,
          accountHolderName: user.name,
          walletTransactionId: walletTransaction.id,
          statusHistory: {
            create: {
              fromStatus: null,
              toStatus: 'PENDING',
              changedByUserId: user.id,
              note: 'Solicitação criada pelo motoboy.',
            },
          },
        },
        include: withdrawalInclude,
      });
      await tx.wallet.update({
        where: { id: wallet.id },
        data: { cachedAvailableBalance: { decrement: payload.amount } },
      });

      return this.toWithdrawalRequestItem(withdrawal);
    });
  }

  async listForDriver(user: User): Promise<WithdrawalRequestItem[]> {
    if (user.type !== 'DRIVER') {
      throw new ForbiddenException('Acesso restrito a entregadores.');
    }
    const driver = await this.prisma.driver.findUnique({
      where: { userId: user.id },
      select: { id: true },
    });
    if (!driver) {
      throw new ForbiddenException('Usuário não está vinculado a um cadastro de motoboy.');
    }
    const requests = await this.prisma.withdrawalRequest.findMany({
      where: { wallet: { driverId: driver.id } },
      include: withdrawalInclude,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return requests.map((request) => this.toWithdrawalRequestItem(request));
  }

  async listForAdmin(filters: ListWithdrawalRequestsQuery): Promise<WithdrawalRequestItem[]> {
    const requests = await this.prisma.withdrawalRequest.findMany({
      where: {
        ...(filters.status && { status: filters.status }),
        ...(filters.search
          ? {
              wallet: {
                driver: {
                  user: {
                    OR: [
                      { name: { contains: filters.search, mode: 'insensitive' } },
                      { email: { contains: filters.search, mode: 'insensitive' } },
                    ],
                  },
                },
              },
            }
          : {}),
        ...(filters.from || filters.to
          ? {
              createdAt: {
                ...(filters.from && { gte: this.startOfDay(filters.from) }),
                ...(filters.to && { lte: this.endOfDay(filters.to) }),
              },
            }
          : {}),
      },
      include: withdrawalInclude,
      orderBy: { createdAt: 'desc' },
      take: filters.limit,
    });
    return requests.map((request) => this.toWithdrawalRequestItem(request));
  }

  async getForAdmin(withdrawalId: string): Promise<WithdrawalRequestItem> {
    const request = await this.prisma.withdrawalRequest.findUnique({
      where: { id: withdrawalId },
      include: withdrawalInclude,
    });
    if (!request) throw new NotFoundException('Solicitação de saque não encontrada.');
    return this.toWithdrawalRequestItem(request);
  }

  async approve(
    admin: User,
    withdrawalId: string,
    payload: ApproveWithdrawalPayload,
  ): Promise<WithdrawalRequestItem> {
    return this.changeStatus({
      admin,
      withdrawalId,
      fromStatuses: ['PENDING'],
      toStatus: 'APPROVED',
      note: payload.note ?? 'Saque aprovado para pagamento.',
    });
  }

  async markPaid(
    admin: User,
    withdrawalId: string,
    payload: MarkWithdrawalPaidPayload,
  ): Promise<WithdrawalRequestItem> {
    return this.withSerializableTransaction(async (tx) => {
      const current = await tx.withdrawalRequest.findUnique({ where: { id: withdrawalId } });
      if (!current) throw new NotFoundException('Solicitação de saque não encontrada.');
      if (current.status !== 'APPROVED') {
        throw new ConflictException('Somente saques aprovados podem ser marcados como pagos.');
      }

      const changed = await tx.withdrawalRequest.updateMany({
        where: { id: withdrawalId, status: 'APPROVED' },
        data: {
          status: 'PAID',
          ...(payload.paymentReference && { paymentReference: payload.paymentReference }),
        },
      });
      if (changed.count !== 1) {
        throw new ConflictException('O saque foi alterado por outra operação. Atualize a tela.');
      }
      const ledgerChanged = await tx.walletTransaction.updateMany({
        where: { id: current.walletTransactionId, status: 'PENDING' },
        data: { status: 'RELEASED' },
      });
      if (ledgerChanged.count !== 1) {
        throw new ConflictException('O lançamento do saque não está mais pendente.');
      }
      await tx.withdrawalRequestStatusHistory.create({
        data: {
          withdrawalRequestId: withdrawalId,
          fromStatus: 'APPROVED',
          toStatus: 'PAID',
          changedByUserId: admin.id,
          note: payload.note ?? 'Pagamento registrado pelo administrador.',
        },
      });
      const updated = await tx.withdrawalRequest.findUniqueOrThrow({
        where: { id: withdrawalId },
        include: withdrawalInclude,
      });
      return this.toWithdrawalRequestItem(updated);
    });
  }

  async reject(
    admin: User,
    withdrawalId: string,
    payload: RejectWithdrawalPayload,
  ): Promise<WithdrawalRequestItem> {
    return this.withSerializableTransaction(async (tx) => {
      const current = await tx.withdrawalRequest.findUnique({ where: { id: withdrawalId } });
      if (!current) throw new NotFoundException('Solicitação de saque não encontrada.');
      if (current.status !== 'PENDING' && current.status !== 'APPROVED') {
        throw new ConflictException('Este saque não pode mais ser rejeitado.');
      }

      const changed = await tx.withdrawalRequest.updateMany({
        where: { id: withdrawalId, status: { in: ['PENDING', 'APPROVED'] } },
        data: { status: 'REJECTED' },
      });
      if (changed.count !== 1) {
        throw new ConflictException('O saque foi alterado por outra operação. Atualize a tela.');
      }
      const ledgerChanged = await tx.walletTransaction.updateMany({
        where: { id: current.walletTransactionId, status: 'PENDING' },
        data: { status: 'CANCELLED' },
      });
      if (ledgerChanged.count !== 1) {
        throw new ConflictException('O lançamento do saque não está mais pendente.');
      }
      await tx.wallet.update({
        where: { id: current.walletId },
        data: { cachedAvailableBalance: { increment: current.requestedAmount } },
      });
      await tx.withdrawalRequestStatusHistory.create({
        data: {
          withdrawalRequestId: withdrawalId,
          fromStatus: current.status,
          toStatus: 'REJECTED',
          changedByUserId: admin.id,
          note: payload.note,
        },
      });
      const updated = await tx.withdrawalRequest.findUniqueOrThrow({
        where: { id: withdrawalId },
        include: withdrawalInclude,
      });
      return this.toWithdrawalRequestItem(updated);
    });
  }

  private async changeStatus(input: {
    admin: User;
    withdrawalId: string;
    fromStatuses: WithdrawalStatus[];
    toStatus: WithdrawalStatus;
    note: string;
  }): Promise<WithdrawalRequestItem> {
    return this.withSerializableTransaction(async (tx) => {
      const current = await tx.withdrawalRequest.findUnique({ where: { id: input.withdrawalId } });
      if (!current) throw new NotFoundException('Solicitação de saque não encontrada.');
      if (!input.fromStatuses.includes(current.status)) {
        throw new ConflictException('O saque não está no status esperado para esta operação.');
      }

      const changed = await tx.withdrawalRequest.updateMany({
        where: { id: input.withdrawalId, status: { in: input.fromStatuses } },
        data: { status: input.toStatus },
      });
      if (changed.count !== 1) {
        throw new ConflictException('O saque foi alterado por outra operação. Atualize a tela.');
      }
      await tx.withdrawalRequestStatusHistory.create({
        data: {
          withdrawalRequestId: input.withdrawalId,
          fromStatus: current.status,
          toStatus: input.toStatus,
          changedByUserId: input.admin.id,
          note: input.note,
        },
      });
      const updated = await tx.withdrawalRequest.findUniqueOrThrow({
        where: { id: input.withdrawalId },
        include: withdrawalInclude,
      });
      return this.toWithdrawalRequestItem(updated);
    });
  }

  private toWithdrawalRequestItem(request: Prisma.WithdrawalRequestGetPayload<{ include: typeof withdrawalInclude }>): WithdrawalRequestItem {
    return {
      id: request.id,
      walletId: request.walletId,
      driver: request.wallet.driver
        ? {
            id: request.wallet.driver.id,
            name: request.wallet.driver.user.name,
            email: request.wallet.driver.user.email,
          }
        : { id: '', name: 'Conta não vinculada', email: '' },
      requestedAmount: numberValue(request.requestedAmount),
      feeAmount: numberValue(request.feeAmount),
      netAmount: numberValue(request.netAmount),
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
    };
  }

  private startOfDay(date: string): Date {
    return new Date(`${date}T00:00:00.000Z`);
  }

  private endOfDay(date: string): Date {
    return new Date(`${date}T23:59:59.999Z`);
  }

  private async withSerializableTransaction<T>(
    callback: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.prisma.$transaction(callback, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error) {
        const canRetry =
          error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034';
        if (!canRetry || attempt === 2) throw error;
      }
    }
    throw new ConflictException('Não foi possível concluir a operação financeira. Tente novamente.');
  }
}
