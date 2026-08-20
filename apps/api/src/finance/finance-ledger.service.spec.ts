import { InternalServerErrorException } from '@nestjs/common';
import { FinanceLedgerService } from './finance-ledger.service';

describe('FinanceLedgerService', () => {
  const service = new FinanceLedgerService();
  const tx = {
    wallet: { upsert: jest.fn() },
    walletTransaction: { create: jest.fn() },
    walletUpdate: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    tx.wallet.upsert.mockResolvedValue({ id: 'wallet-1' });
    tx.walletTransaction.create.mockResolvedValue({ id: 'transaction-1' });
    tx.walletUpdate.mockResolvedValue({ id: 'wallet-1' });
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
