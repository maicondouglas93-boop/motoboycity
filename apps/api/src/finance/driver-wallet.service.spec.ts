import type { User } from '@prisma/client';
import { DriverWalletService } from './driver-wallet.service';

const driverUser = { id: 'user-driver-1', type: 'DRIVER' } as User;

describe('DriverWalletService', () => {
  const prisma = {
    driver: { findUnique: jest.fn() },
    wallet: { findUnique: jest.fn() },
    walletTransaction: { findMany: jest.fn() },
  };
  /** Segunda-feira: a regra que existia antes de o dia virar configuravel. */
  const platformSettings = { get: jest.fn().mockResolvedValue({ withdrawalWeekday: 1 }) };
  const service = new DriverWalletService(prisma as never, platformSettings as never);

  beforeEach(() => {
    jest.clearAllMocks();
    platformSettings.get.mockResolvedValue({ withdrawalWeekday: 1 });
    prisma.driver.findUnique.mockResolvedValue({ id: 'driver-1' });
  });

  it('retorna carteira vazia para entregador que ainda não concluiu pedidos', async () => {
    prisma.wallet.findUnique.mockResolvedValue(null);

    await expect(service.getForDriver(driverUser, { limit: 100 })).resolves.toEqual({
      walletId: null,
      withdrawal: { openToday: expect.any(Boolean), weekdayLabel: 'segunda-feira' },
      availableBalance: 0,
      blockedBalance: 0,
      pendingWithdrawalAmount: 0,
      cacheMatchesLedger: true,
      transactions: [],
      withdrawalRequests: [],
    });
    expect(prisma.walletTransaction.findMany).not.toHaveBeenCalled();
  });

  it('deriva saldos do ledger e reserva saques pendentes', async () => {
    const releasedCredit = {
      type: 'CREDIT_REPASSE',
      status: 'RELEASED',
      amount: { toString: () => '50.00' },
    };
    const pendingCredit = {
      type: 'CREDIT_REPASSE',
      status: 'PENDING',
      amount: { toString: () => '10.00' },
    };
    const pendingWithdrawal = {
      type: 'DEBIT_WITHDRAWAL',
      status: 'PENDING',
      amount: { toString: () => '15.00' },
    };
    prisma.wallet.findUnique.mockResolvedValue({
      id: 'wallet-1',
      cachedAvailableBalance: { toString: () => '35.00' },
      cachedBlockedBalance: { toString: () => '10.00' },
      transactions: [
        {
          id: 'tx-1',
          ...pendingCredit,
          releaseAt: null,
          createdAt: new Date('2026-08-20T12:00:00.000Z'),
          delivery: {
            id: 'delivery-1',
            displayNumber: 42,
            company: { tradeName: 'Loja Teste' },
          },
        },
      ],
      withdrawalRequests: [],
    });
    prisma.walletTransaction.findMany.mockResolvedValue([
      releasedCredit,
      pendingCredit,
      pendingWithdrawal,
    ]);

    const result = await service.getForDriver(driverUser, { limit: 100 });

    expect(result.availableBalance).toBe(35);
    expect(result.blockedBalance).toBe(10);
    expect(result.pendingWithdrawalAmount).toBe(15);
    expect(result.cacheMatchesLedger).toBe(true);
    expect(result.transactions).toEqual([
      expect.objectContaining({
        id: 'tx-1',
        direction: 'CREDIT',
        relatedDelivery: { id: 'delivery-1', displayNumber: 42, companyName: 'Loja Teste' },
      }),
    ]);
  });
});
