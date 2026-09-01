import { InternalServerErrorException } from '@nestjs/common';
import { FinanceLedgerService } from './finance-ledger.service';

describe('FinanceLedgerService', () => {
  const platformSettings = { get: jest.fn() };
  const clock = { now: jest.fn() };
  const service = new FinanceLedgerService(platformSettings as never, clock as never);
  const tx = {
    wallet: { upsert: jest.fn() },
    walletTransaction: { create: jest.fn() },
    walletUpdate: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    platformSettings.get.mockResolvedValue({ withdrawalWeekday: 1 });
    clock.now.mockReturnValue(new Date('2026-08-25T12:00:00.000Z'));
    tx.wallet.upsert.mockResolvedValue({ id: 'wallet-1' });
    tx.walletTransaction.create.mockResolvedValue({ id: 'transaction-1' });
    tx.walletUpdate.mockResolvedValue({ id: 'wallet-1' });
  });

  it('agenda o crédito para 00:00 do dia escolhido pelo administrador', async () => {
    platformSettings.get.mockResolvedValue({ withdrawalWeekday: 0 });

    await service.creditDriverRepasse(prismaTransaction() as never, {
      id: 'delivery-sunday',
      driverId: 'driver-1',
      driverValue: 10,
    });

    expect(tx.walletTransaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        releaseAt: new Date('2026-08-30T03:00:00.000Z'),
      }),
    });
  });

  it('na opção todos os dias agenda para a próxima meia-noite', async () => {
    platformSettings.get.mockResolvedValue({ withdrawalWeekday: null });

    await service.creditDriverRepasse(prismaTransaction() as never, {
      id: 'delivery-daily',
      driverId: 'driver-1',
      driverValue: 10,
    });

    expect(tx.walletTransaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        releaseAt: new Date('2026-08-26T03:00:00.000Z'),
      }),
    });
  });

  function prismaTransaction() {
    return {
      wallet: {
        upsert: tx.wallet.upsert,
        update: tx.walletUpdate,
      },
      walletTransaction: tx.walletTransaction,
    };
  }

  it('cria crédito pendente e aumenta apenas o saldo bloqueado', async () => {
    await service.creditDriverRepasse(prismaTransaction() as never, {
      id: 'delivery-1',
      driverId: 'driver-1',
      driverValue: 18.5,
    });

    expect(tx.wallet.upsert).toHaveBeenCalledWith({
      where: { driverId: 'driver-1' },
      update: {},
      create: { driverId: 'driver-1' },
    });
    expect(tx.walletTransaction.create).toHaveBeenCalledWith({
      data: {
        walletId: 'wallet-1',
        type: 'CREDIT_REPASSE',
        status: 'PENDING',
        amount: 18.5,
        relatedDeliveryId: 'delivery-1',
        idempotencyKey: 'driver-repasse:delivery-1',
        releaseAt: expect.any(Date),
      },
    });
    expect(tx.walletUpdate).toHaveBeenCalledWith({
      where: { id: 'wallet-1' },
      data: { cachedBlockedBalance: { increment: 18.5 } },
    });
  });

  it('recusa crédito quando a entrega concluída não traz entregador e valor congelado', async () => {
    await expect(
      service.creditDriverRepasse(prismaTransaction() as never, {
        id: 'delivery-1',
        driverId: null,
        driverValue: null,
      }),
    ).rejects.toBeInstanceOf(InternalServerErrorException);

    expect(tx.wallet.upsert).not.toHaveBeenCalled();
  });
});
