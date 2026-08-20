import { ConflictException } from '@nestjs/common';
import type { User } from '@prisma/client';
import { FinancialClock } from './financial-clock.service';
import { InvoiceService } from './invoice.service';

describe('InvoiceService', () => {
  const tx = {
    delivery: { findMany: jest.fn() },
  };
  const prisma = { $transaction: jest.fn() };
  const clock = { now: jest.fn() };
  const service = new InvoiceService(prisma as never, clock as FinancialClock);
  const admin = { id: 'admin-1' } as User;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation((callback: (client: typeof tx) => unknown) =>
      callback(tx),
    );
    tx.delivery.findMany.mockResolvedValue([]);
  });

  it('recusa antecipar o fechamento manual antes do corte confirmado', async () => {
    clock.now.mockReturnValue(new Date('2026-08-24T03:04:59.000Z'));

    await expect(
      service.closeOpenInvoices(admin, { issueDate: '2026-08-24' }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('recupera no boot o último corte vencido e usa 00:05 de São Paulo como limite', async () => {
    await expect(
      service.closeScheduledInvoices(new Date('2026-08-26T12:00:00.000Z')),
    ).resolves.toEqual([]);

    expect(tx.delivery.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          statusChangedAt: { lte: new Date('2026-08-24T03:05:00.000Z') },
        }),
      }),
    );
  });
});
