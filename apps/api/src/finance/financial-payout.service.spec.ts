import { Prisma, type User } from '@prisma/client';
import { FinancialClock } from './financial-clock.service';
import { FinancialPayoutService } from './financial-payout.service';

describe('FinancialPayoutService', () => {
  const tx = {
    walletTransaction: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
    },
    wallet: { findUnique: jest.fn(), update: jest.fn() },
    driver: { findUnique: jest.fn() },
    withdrawalRequest: { create: jest.fn() },
  };
  const prisma = {
    $transaction: jest.fn(),
    walletTransaction: { findUnique: jest.fn() },
  };
  const clock = { now: jest.fn() };
  const service = new FinancialPayoutService(prisma as never, clock as FinancialClock);

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation((callback: (client: typeof tx) => unknown) => callback(tx));
    tx.walletTransaction.findMany.mockResolvedValue([
      { id: 'credit-1', walletId: 'wallet-1', amount: { toString: () => '12.5' } },
      { id: 'credit-2', walletId: 'wallet-1', amount: { toString: () => '7.5' } },
    ]);
    tx.walletTransaction.updateMany.mockResolvedValue({ count: 1 });
    tx.walletTransaction.findUnique.mockResolvedValue(null);
    tx.walletTransaction.create.mockResolvedValue({ id: 'withdrawal-ledger-1' });
    tx.driver.findUnique.mockResolvedValue({
      id: 'driver-1',
      pixKey: 'driver@example.com',
      pixKeyType: 'EMAIL',
    });
    tx.wallet.findUnique.mockResolvedValue({ id: 'wallet-1' });
    tx.wallet.update.mockResolvedValue({ id: 'wallet-1' });
    prisma.walletTransaction.findUnique.mockResolvedValue(null);
  });

  it('libera os créditos vencidos e move o cache bloqueado para disponível', async () => {
    const now = new Date('2026-08-24T03:00:00.000Z');

    await expect(service.releaseDueRepasses(now)).resolves.toBe(2);

    expect(tx.walletTransaction.findMany).toHaveBeenCalledWith({
      where: {
        type: 'CREDIT_REPASSE',
        status: 'PENDING',
        OR: [{ releaseAt: { lte: now } }],
      },
      select: { id: true, walletId: true, amount: true },
    });
    expect(tx.walletTransaction.updateMany).toHaveBeenCalledTimes(2);
    expect(tx.wallet.update).toHaveBeenCalledWith({
      where: { id: 'wallet-1' },
      data: {
        cachedBlockedBalance: { decrement: 20 },
        cachedAvailableBalance: { increment: 20 },
      },
    });
  });

  it('inclui créditos antigos sem data somente no job semanal de migração', async () => {
    await service.releaseDueRepasses(new Date('2026-08-24T03:00:00.000Z'), {
      includeLegacyWithoutReleaseAt: true,
    });

    expect(tx.walletTransaction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([{ releaseAt: null }]),
        }),
      }),
    );
  });

  describe('requestWithdrawal', () => {
    const driverUser = {
      id: 'user-driver-1',
      name: 'Motoboy Teste',
      type: 'DRIVER',
    } as User;
    const idempotencyKey = '22222222-2222-4222-8222-222222222222';

    function withdrawal() {
      return {
        id: 'withdrawal-1',
        walletId: 'wallet-1',
        requestedAmount: { toString: () => '100' },
        feeAmount: { toString: () => '0' },
        netAmount: { toString: () => '100' },
        status: 'PENDING',
        pixKey: 'driver@example.com',
        pixKeyType: 'EMAIL',
        accountHolderName: 'Motoboy Teste',
        paymentReference: null,
        createdAt: new Date('2026-08-24T12:00:00.000Z'),
        wallet: {
          driver: {
            id: 'driver-1',
            user: { id: driverUser.id, name: driverUser.name, email: 'driver@example.com' },
          },
        },
        statusHistory: [],
      };
    }

    beforeEach(() => {
      clock.now.mockReturnValue(new Date('2026-08-24T12:00:00.000Z'));
      tx.walletTransaction.findMany.mockResolvedValue([
        { type: 'CREDIT_REPASSE', status: 'RELEASED', amount: { toString: () => '150' } },
      ]);
      tx.withdrawalRequest.create.mockResolvedValue(withdrawal());
    });

    it('grava a identidade da tentativa no ledger e debita o cache uma vez', async () => {
      await service.requestWithdrawal(driverUser, { amount: 100, idempotencyKey });

      expect(tx.walletTransaction.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          walletId: 'wallet-1',
          amount: 100,
          idempotencyKey: `driver-withdrawal:${driverUser.id}:${idempotencyKey}`,
        }),
      });
      expect(tx.wallet.update).toHaveBeenCalledTimes(1);
      expect(tx.withdrawalRequest.create).toHaveBeenCalledTimes(1);
    });

    it('devolve o saque existente antes de recalcular o saldo', async () => {
      tx.walletTransaction.findUnique.mockResolvedValue({
        walletId: 'wallet-1',
        withdrawalRequest: withdrawal(),
      });

      await expect(
        service.requestWithdrawal(driverUser, { amount: 100, idempotencyKey }),
      ).resolves.toMatchObject({ id: 'withdrawal-1', requestedAmount: 100 });

      expect(tx.walletTransaction.findMany).not.toHaveBeenCalled();
      expect(tx.walletTransaction.create).not.toHaveBeenCalled();
      expect(tx.wallet.update).not.toHaveBeenCalled();
    });

    it('reconcilia a colisão concorrente da mesma chave', async () => {
      prisma.$transaction.mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError('duplicate', {
          code: 'P2002',
          clientVersion: 'test',
        }),
      );
      prisma.walletTransaction.findUnique.mockResolvedValue({
        withdrawalRequest: withdrawal(),
      });

      await expect(
        service.requestWithdrawal(driverUser, { amount: 100, idempotencyKey }),
      ).resolves.toMatchObject({ id: 'withdrawal-1' });
    });
  });
});
