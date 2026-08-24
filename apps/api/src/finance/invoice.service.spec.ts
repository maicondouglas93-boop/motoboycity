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

  describe('cancelInvoice', () => {
    /** Um `tx` proprio: o cancelamento toca tabelas que o resto do spec nao usa. */
    const txCancel = {
      invoice: { findUnique: jest.fn(), updateMany: jest.fn() },
      delivery: { updateMany: jest.fn() },
      invoiceStatusHistory: { create: jest.fn() },
    };

    beforeEach(() => {
      prisma.$transaction.mockImplementation((callback: (client: typeof txCancel) => unknown) =>
        callback(txCancel),
      );
      txCancel.invoice.findUnique.mockResolvedValue({ status: 'PENDING' });
      txCancel.invoice.updateMany.mockResolvedValue({ count: 1 });
      jest.spyOn(service, 'getDetail').mockResolvedValue({} as never);
    });

    it('DEVOLVE as entregas para cobrança ao cancelar', async () => {
      /**
       * Este é o teste que importa. Sem soltar as entregas, cancelar a fatura
       * apagaria a cobrança em vez de reabri-la: elas continuariam marcadas
       * como faturadas e ninguém nunca mais as cobraria.
       */
      await service.cancelInvoice(admin, 'inv-1', { reason: 'Fatura emitida em duplicidade' });

      expect(txCancel.delivery.updateMany).toHaveBeenCalledWith({
        where: { invoiceId: 'inv-1' },
        data: { invoiceId: null },
      });
    });

    it('grava o motivo no histórico, com o autor', async () => {
      await service.cancelInvoice(admin, 'inv-1', { reason: 'Empresa cancelou o contrato antes' });

      expect(txCancel.invoiceStatusHistory.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          invoiceId: 'inv-1',
          fromStatus: 'PENDING',
          toStatus: 'CANCELLED',
          changedByUserId: 'admin-1',
          note: 'Empresa cancelou o contrato antes',
        }),
      });
    });

    it('recusa cancelar fatura já PAGA, mandando estornar', async () => {
      // Dinheiro que entrou nao se cancela. Apagar a fatura deixaria o
      // recebimento orfao no extrato.
      txCancel.invoice.findUnique.mockResolvedValue({ status: 'PAID' });

      await expect(
        service.cancelInvoice(admin, 'inv-1', { reason: 'Motivo qualquer bem escrito' }),
      ).rejects.toThrow(/estorno/i);

      expect(txCancel.delivery.updateMany).not.toHaveBeenCalled();
    });

    it('recusa cancelar duas vezes', async () => {
      txCancel.invoice.findUnique.mockResolvedValue({ status: 'CANCELLED' });

      await expect(
        service.cancelInvoice(admin, 'inv-1', { reason: 'Motivo qualquer bem escrito' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('para quando outra tela cancelou primeiro', async () => {
      // A leitura passou, mas o `updateMany` com o status na condicao nao
      // encontrou mais a fatura naquele estado.
      txCancel.invoice.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.cancelInvoice(admin, 'inv-1', { reason: 'Motivo qualquer bem escrito' }),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(txCancel.delivery.updateMany).not.toHaveBeenCalled();
    });
  });
});
