import { ConflictException } from '@nestjs/common';
import type { User } from '@prisma/client';
import { FinancialClock } from './financial-clock.service';
import { InvoiceService } from './invoice.service';

describe('InvoiceService', () => {
  const tx = {
    delivery: { findMany: jest.fn(), updateMany: jest.fn() },
    invoice: { create: jest.fn(), findMany: jest.fn() },
    invoiceStatusHistory: { create: jest.fn() },
  };
  // `getListItem` roda FORA da transacao, relendo a fatura recem-criada.
  const prisma = {
    $transaction: jest.fn(),
    invoice: { findUnique: jest.fn(), findMany: jest.fn() },
    companyTeamMember: { findFirst: jest.fn() },
  };
  const clock = { now: jest.fn() };
  const service = new InvoiceService(prisma as never, clock as FinancialClock);
  const admin = { id: 'admin-1' } as User;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation((callback: (client: typeof tx) => unknown) =>
      callback(tx),
    );
    tx.delivery.findMany.mockResolvedValue([]);
    tx.delivery.updateMany.mockResolvedValue({ count: 1 });
    tx.invoice.create.mockResolvedValue({ id: 'fatura-1' });
    tx.invoice.findMany.mockResolvedValue([]);
    tx.invoiceStatusHistory.create.mockResolvedValue({});
    prisma.invoice.findMany.mockResolvedValue([]);
    prisma.companyTeamMember.findFirst.mockResolvedValue({ companyId: 'empresa-1' });
    prisma.invoice.findUnique.mockResolvedValue({
      id: 'fatura-1',
      companyId: 'empresa-1',
      number: 'FAT-20260824-TESTE',
      status: 'PENDING',
      issueDate: new Date('2026-08-24T00:00:00.000Z'),
      dueDate: new Date('2026-08-24T00:00:00.000Z'),
      paymentDate: null,
      paymentMethod: null,
      totalValue: 12.5,
      driverValueSum: 9.2,
      platformValueSum: 3.3,
      company: { tradeName: 'Loja Teste' },
      _count: { deliveries: 1 },
    });
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


  it('emite a fatura vencendo NO MESMO DIA, de propósito', async () => {
    /**
     * Regra do negócio confirmada pelo dono, não descuido: o ciclo inteiro cabe
     * na segunda-feira. O corte roda 00:05, a fatura nasce vencendo no mesmo
     * dia, e como o `refreshOverdueInvoices` compara com `dueDate < hoje`, ela
     * só vira OVERDUE na terça — um dia útil cheio para pagar.
     *
     * Este teste existe para que ninguém "conserte" o `dueDate = issueDate`
     * achando que faltou somar um prazo.
     */
    tx.delivery.findMany.mockResolvedValue([
      {
        id: 'entrega-1',
        companyId: 'empresa-1',
        totalValue: 12.5,
        driverValue: 9.2,
        platformValue: 3.3,
      },
    ]);

    await service.closeScheduledInvoices(new Date('2026-08-24T12:00:00.000Z'));

    const criada = tx.invoice.create.mock.calls[0]?.[0].data;
    expect(criada.issueDate.toISOString().slice(0, 10)).toBe('2026-08-24');
    expect(criada.dueDate.getTime()).toBe(criada.issueDate.getTime());
  });

  it('filtra a data civil da fatura sem deslocar o dia pelo fuso', async () => {
    await service.listForAdmin({ from: '2026-08-24', to: '2026-08-24' });

    expect(prisma.invoice.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({
          issueDate: {
            gte: new Date('2026-08-24T00:00:00.000Z'),
            lte: new Date('2026-08-24T00:00:00.000Z'),
          },
        }),
      }),
    );
  });

  it('fecha os totais monetarios em centavos inteiros', async () => {
    tx.delivery.updateMany.mockResolvedValue({ count: 2 });
    tx.delivery.findMany.mockResolvedValue([
      {
        id: 'entrega-1',
        companyId: 'empresa-1',
        totalValue: 0.1,
        driverValue: 0.03,
        platformValue: 0.07,
      },
      {
        id: 'entrega-2',
        companyId: 'empresa-1',
        totalValue: 0.2,
        driverValue: 0.06,
        platformValue: 0.14,
      },
    ]);

    await service.closeScheduledInvoices(new Date('2026-08-24T12:00:00.000Z'));

    expect(tx.invoice.create.mock.calls[0]?.[0].data).toEqual(
      expect.objectContaining({ totalValue: 0.3, driverValueSum: 0.09, platformValueSum: 0.21 }),
    );
  });

  describe('contrato visivel pela empresa', () => {
    const companyUser = { id: 'company-user-1', type: 'COMPANY_MEMBER' } as User;

    function detailedInvoice() {
      return {
        id: 'fatura-1',
        companyId: 'empresa-1',
        number: 'FAT-20260824-TESTE',
        status: 'PENDING',
        issueDate: new Date('2026-08-24T00:00:00.000Z'),
        dueDate: new Date('2026-08-24T00:00:00.000Z'),
        paymentDate: null,
        paymentMethod: null,
        totalValue: 12.5,
        driverValueSum: 9.2,
        platformValueSum: 3.3,
        company: { tradeName: 'Loja Teste' },
        deliveries: [
          {
            id: 'entrega-1',
            displayNumber: 1170,
            totalValue: 12.5,
            driverValue: 9.2,
            platformValue: 3.3,
            statusChangedAt: new Date('2026-08-23T18:00:00.000Z'),
          },
        ],
        statusHistory: [],
      };
    }

    it('remove repasse e margem do detalhe da empresa', async () => {
      prisma.invoice.findUnique.mockResolvedValue(detailedInvoice());

      const detail = await service.detailForCompany(companyUser, 'fatura-1');
      const serialized = JSON.stringify(detail);

      expect(serialized).not.toContain('driverValue');
      expect(serialized).not.toContain('platformValue');
      expect(detail.totalValue).toBe(12.5);
      expect(detail.deliveries[0]).toEqual({
        id: 'entrega-1',
        displayNumber: 1170,
        totalValue: 12.5,
        completedAt: '2026-08-23T18:00:00.000Z',
      });
    });

    it('remove os totais internos tambem da listagem da empresa', async () => {
      const invoice = detailedInvoice();
      prisma.invoice.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ ...invoice, _count: { deliveries: 1 } }]);

      const [item] = await service.listForCompany(companyUser, {});

      expect(item).not.toHaveProperty('driverValueSum');
      expect(item).not.toHaveProperty('platformValueSum');
      expect(item?.totalValue).toBe(12.5);
    });

    it('mantem os valores internos no detalhe administrativo', async () => {
      prisma.invoice.findUnique.mockResolvedValue(detailedInvoice());

      const detail = await service.detailForAdmin('fatura-1');

      expect(detail.driverValueSum).toBe(9.2);
      expect(detail.platformValueSum).toBe(3.3);
      expect(detail.deliveries[0]).toEqual(
        expect.objectContaining({ driverValue: 9.2, platformValue: 3.3 }),
      );
    });
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
      const serviceInternals = service as unknown as {
        getDetail(invoiceId: string): Promise<unknown>;
      };
      jest.spyOn(serviceInternals, 'getDetail').mockResolvedValue({});
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
