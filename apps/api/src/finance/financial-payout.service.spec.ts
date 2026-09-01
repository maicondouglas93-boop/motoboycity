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
    walletTransaction: { findMany: jest.fn(), findUnique: jest.fn() },
  };
  const clock = { now: jest.fn() };
  /** Padrao dos testes: segunda-feira, que e a regra que existia antes de o dia virar configuravel. */
  const platformSettings = { get: jest.fn().mockResolvedValue({ withdrawalWeekday: 1 }) };
  const service = new FinancialPayoutService(
    prisma as never,
    clock as FinancialClock,
    platformSettings as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    platformSettings.get.mockResolvedValue({ withdrawalWeekday: 1 });
    prisma.$transaction.mockImplementation((callback: (client: typeof tx) => unknown) =>
      callback(tx),
    );
    prisma.walletTransaction.findMany.mockResolvedValue([
      {
        id: 'credit-1',
        walletId: 'wallet-1',
        amount: { toString: () => '12.5' },
        createdAt: new Date('2026-08-18T12:00:00.000Z'),
        releaseAt: new Date('2026-08-24T03:00:00.000Z'),
      },
      {
        id: 'credit-2',
        walletId: 'wallet-1',
        amount: { toString: () => '7.5' },
        createdAt: new Date('2026-08-18T12:00:00.000Z'),
        releaseAt: new Date('2026-08-24T03:00:00.000Z'),
      },
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

    expect(prisma.walletTransaction.findMany).toHaveBeenCalledWith({
      where: {
        type: 'CREDIT_REPASSE',
        status: 'PENDING',
        releaseAt: { not: null },
      },
      select: { id: true, walletId: true, amount: true, createdAt: true, releaseAt: true },
      orderBy: [{ walletId: 'asc' }, { id: 'asc' }],
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

  it('inclui créditos antigos sem data somente no job diário de reconciliação', async () => {
    await service.releaseDueRepasses(new Date('2026-08-24T03:00:00.000Z'), {
      includeLegacyWithoutReleaseAt: true,
    });

    expect(prisma.walletTransaction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { type: 'CREDIT_REPASSE', status: 'PENDING' },
      }),
    );
  });

  it('reagenda e libera os créditos já bloqueados quando o ADM muda o ciclo', async () => {
    const now = new Date('2026-08-30T03:00:00.000Z'); // domingo 00:00
    platformSettings.get.mockResolvedValue({ withdrawalWeekday: 0 });
    prisma.walletTransaction.findMany.mockResolvedValue([
      {
        id: 'credit-old-policy',
        walletId: 'wallet-1',
        amount: { toString: () => '12.5' },
        createdAt: new Date('2026-08-25T12:00:00.000Z'),
        // Antes da troca, estava marcado para a segunda-feira.
        releaseAt: new Date('2026-08-31T03:00:00.000Z'),
      },
    ]);

    await expect(
      service.releaseDueRepasses(now, { includeLegacyWithoutReleaseAt: true }),
    ).resolves.toBe(1);

    expect(tx.walletTransaction.updateMany).toHaveBeenCalledWith({
      where: { id: 'credit-old-policy', status: 'PENDING' },
      data: { releaseAt: now, status: 'RELEASED' },
    });
    expect(tx.wallet.update).toHaveBeenCalledWith({
      where: { id: 'wallet-1' },
      data: {
        cachedBlockedBalance: { decrement: 12.5 },
        cachedAvailableBalance: { increment: 12.5 },
      },
    });
  });

  it('divide muitos repasses em transacoes curtas para nao expirar no banco remoto', async () => {
    prisma.walletTransaction.findMany.mockResolvedValue(
      Array.from({ length: 26 }, (_, index) => ({
        id: `credit-${String(index).padStart(2, '0')}`,
        walletId: 'wallet-1',
        amount: { toString: () => '1' },
        createdAt: new Date('2026-08-18T12:00:00.000Z'),
        releaseAt: new Date('2026-08-24T03:00:00.000Z'),
      })),
    );

    await expect(service.releaseDueRepasses(new Date('2026-08-24T03:00:00.000Z'))).resolves.toBe(
      26,
    );

    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    expect(tx.wallet.update).toHaveBeenCalledTimes(2);
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

    /**
     * O dia do saque virou configuração. Estes testes existem porque a recusa
     * precisa continuar morando no SERVIDOR: o aplicativo mostra o botão
     * conforme a política que recebe, mas uma versão antiga instalada, um
     * relógio de aparelho errado ou uma chamada direta à API não podem furar
     * a regra.
     */
    it('recusa fora do dia configurado, dizendo qual é o dia', async () => {
      // Relógio numa segunda-feira, com o saque configurado para quarta.
      platformSettings.get.mockResolvedValue({ withdrawalWeekday: 3 });

      await expect(
        service.requestWithdrawal(driverUser, { amount: 100, idempotencyKey }),
      ).rejects.toThrow('quarta-feiras');

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('aceita no dia configurado, mesmo não sendo segunda', async () => {
      clock.now.mockReturnValue(new Date('2026-08-26T13:00:00.000Z')); // quarta
      platformSettings.get.mockResolvedValue({ withdrawalWeekday: 3 });

      await expect(
        service.requestWithdrawal(driverUser, { amount: 100, idempotencyKey }),
      ).resolves.toMatchObject({ id: 'withdrawal-1' });
    });

    /** `null` é a escolha "qualquer dia", e não falta de configuração. */
    it('com dia nulo, aceita em qualquer dia', async () => {
      clock.now.mockReturnValue(new Date('2026-08-27T13:00:00.000Z')); // quinta
      platformSettings.get.mockResolvedValue({ withdrawalWeekday: null });

      await expect(
        service.requestWithdrawal(driverUser, { amount: 100, idempotencyKey }),
      ).resolves.toMatchObject({ id: 'withdrawal-1' });
    });
  });
});
