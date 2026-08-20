import { FinancialClock } from './financial-clock.service';
import { FinancialPayoutService } from './financial-payout.service';

describe('FinancialPayoutService', () => {
  const tx = {
    walletTransaction: {
      findMany: jest.fn(),
      updateMany: jest.fn(),
    },
    wallet: { update: jest.fn() },
  };
  const prisma = {
    $transaction: jest.fn(),
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
    tx.wallet.update.mockResolvedValue({ id: 'wallet-1' });
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
});
