import { ConflictException } from '@nestjs/common';
import type { User } from '@prisma/client';
import { FinancialClock } from './financial-clock.service';
import { InvoiceService } from './invoice.service';

describe('InvoiceService', () => {
  const tx = {
    company: { findUnique: jest.fn(), findFirst: jest.fn(), updateMany: jest.fn() },
    delivery: { findMany: jest.fn(), updateMany: jest.fn() },
    invoice: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      updateMany: jest.fn(),
    },
    invoiceStatusHistory: { create: jest.fn() },
    companyStatusHistory: { create: jest.fn() },
  };
  // `getListItem` roda FORA da transacao, relendo a fatura recem-criada.
  const prisma = {
    $transaction: jest.fn(),
    company: { findUnique: jest.fn(), findMany: jest.fn() },
    delivery: { findMany: jest.fn() },
    invoice: { findUnique: jest.fn(), findMany: jest.fn() },
    companyTeamMember: { findFirst: jest.fn() },
  };
  const clock = { now: jest.fn() };
  const realtimeGateway = { disconnectUser: jest.fn() };
  const service = new InvoiceService(
    prisma as never,
    clock as FinancialClock,
    realtimeGateway as never,
  );
  const admin = { id: 'admin-1' } as User;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation((callback: (client: typeof tx) => unknown) =>
      callback(tx),
    );
    tx.delivery.findMany.mockResolvedValue([]);
    tx.delivery.updateMany.mockResolvedValue({ count: 1 });
    tx.company.findFirst.mockResolvedValue({ id: 'empresa-1' });
    tx.company.updateMany.mockResolvedValue({ count: 1 });
    tx.invoice.create.mockResolvedValue({ id: 'fatura-1' });
    tx.invoice.findMany.mockResolvedValue([]);
    tx.invoice.findUnique.mockResolvedValue({
      status: 'PENDING',
      issueDate: new Date('2026-08-24T00:00:00.000Z'),
      dueDate: new Date('2026-08-25T00:00:00.000Z'),
    });
    tx.invoice.updateMany.mockResolvedValue({ count: 1 });
    tx.invoiceStatusHistory.create.mockResolvedValue({});
    prisma.invoice.findMany.mockResolvedValue([]);
    prisma.company.findUnique.mockResolvedValue({
      id: 'empresa-1',
      tradeName: 'Loja Teste',
      document: '12345678000199',
    });
    prisma.company.findMany.mockResolvedValue([
      {
        id: 'empresa-1',
        invoiceClosingMode: 'AUTOMATIC',
        invoiceClosingFrequency: 'WEEKLY',
        invoiceClosingWeekday: 1,
        invoiceClosingMonthDay: null,
        lastAutomaticInvoiceClosingDate: null,
      },
    ]);
    prisma.delivery.findMany.mockResolvedValue([]);
    tx.company.findUnique.mockResolvedValue({
      id: 'empresa-1',
      tradeName: 'Loja Teste',
      document: '12345678000199',
    });
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

  it('recusa o fechamento avulso de uma empresa configurada como automatica', async () => {
    clock.now.mockReturnValue(new Date('2026-08-26T15:00:00.000Z'));
    tx.company.findFirst.mockResolvedValue(null);

    await expect(
      service.closeOpenInvoices(admin, { companyId: 'empresa-1' }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.invoice.create).not.toHaveBeenCalled();
  });

  it('fecha uma empresa manual em qualquer dia e sem alcancar outras empresas', async () => {
    const now = new Date('2026-08-26T15:00:00.000Z');
    clock.now.mockReturnValue(now);
    tx.delivery.findMany.mockResolvedValue([
      {
        id: 'entrega-1',
        totalValue: 12.5,
        driverValue: 9.2,
        platformValue: 3.3,
      },
    ]);

    await service.closeOpenInvoices(admin, { companyId: 'empresa-1' });

    expect(tx.delivery.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          companyId: 'empresa-1',
          statusChangedAt: { lte: now },
        }),
      }),
    );
    expect(tx.invoice.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        companyId: 'empresa-1',
        issueDate: new Date('2026-08-26T00:00:00.000Z'),
        dueDate: new Date('2026-08-26T00:00:00.000Z'),
      }),
    });
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

  it('nao processa novamente o mesmo ciclo automatico', async () => {
    prisma.company.findMany.mockResolvedValue([
      {
        id: 'empresa-1',
        invoiceClosingMode: 'AUTOMATIC',
        invoiceClosingFrequency: 'WEEKLY',
        invoiceClosingWeekday: 1,
        invoiceClosingMonthDay: null,
        lastAutomaticInvoiceClosingDate: new Date('2026-08-24T00:00:00.000Z'),
      },
    ]);

    await expect(
      service.closeScheduledInvoices(new Date('2026-08-26T12:00:00.000Z')),
    ).resolves.toEqual([]);

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('bloqueia e desconecta a empresa exatamente no prazo configurado', async () => {
    prisma.company.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([
      {
        id: 'empresa-1',
        invoiceOverdueBlockAfterDays: 3,
        teamMembers: [{ userId: 'owner-1' }, { userId: 'operator-1' }],
      },
    ]);
    prisma.invoice.findMany.mockResolvedValue([]);
    tx.company.updateMany.mockResolvedValue({ count: 1 });

    const result = await service.processScheduledBilling(new Date('2026-08-26T12:00:00.000Z'));

    expect(tx.company.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'empresa-1',
        status: 'ACTIVE',
        invoiceOverdueBlockAfterDays: 3,
        invoices: {
          some: {
            status: 'OVERDUE',
            dueDate: { lte: new Date('2026-08-23T00:00:00.000Z') },
          },
        },
      },
      data: {
        status: 'SUSPENDED',
        invoiceOverdueBlockedAt: new Date('2026-08-26T12:00:00.000Z'),
      },
    });
    expect(tx.companyStatusHistory.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        companyId: 'empresa-1',
        fromStatus: 'ACTIVE',
        toStatus: 'SUSPENDED',
        changedByUserId: null,
      }),
    });
    expect(realtimeGateway.disconnectUser).toHaveBeenCalledWith('owner-1');
    expect(realtimeGateway.disconnectUser).toHaveBeenCalledWith('operator-1');
    expect(result.blockedCompanyIds).toEqual(['empresa-1']);
  });

  describe('fatura personalizada', () => {
    const payload = {
      companyId: 'empresa-1',
      deliveryIds: ['entrega-1', 'entrega-2'],
      issueDate: '2026-08-25',
      dueDate: '2026-08-30',
    };
    const deliveries = [
      {
        id: 'entrega-1',
        displayNumber: 11,
        externalOrderNumber: null,
        statusChangedAt: new Date('2026-08-24T12:00:00.000Z'),
        totalValue: 0.1,
        driverValue: 0.03,
        platformValue: 0.07,
        serviceType: { name: 'Motoboy' },
      },
      {
        id: 'entrega-2',
        displayNumber: 12,
        externalOrderNumber: 'LOJA-22',
        statusChangedAt: new Date('2026-08-24T13:00:00.000Z'),
        totalValue: 0.2,
        driverValue: 0.06,
        platformValue: 0.14,
        serviceType: { name: 'Motoboy' },
      },
    ];

    beforeEach(() => {
      clock.now.mockReturnValue(new Date('2026-08-25T15:00:00.000Z'));
      prisma.delivery.findMany.mockResolvedValue(deliveries);
      tx.delivery.findMany.mockResolvedValue(deliveries);
      tx.delivery.updateMany.mockResolvedValue({ count: 2 });
    });

    it('mostra uma previa calculada com os valores congelados', async () => {
      const preview = await service.previewManualInvoice(payload);

      expect(preview).toEqual(
        expect.objectContaining({
          issueDate: '2026-08-25',
          dueDate: '2026-08-30',
          deliveryCount: 2,
          totalValue: 0.3,
          driverValueSum: 0.09,
          platformValueSum: 0.21,
        }),
      );
      expect(preview.deliveries.map((delivery) => delivery.displayNumber)).toEqual([11, 12]);
    });

    it('emite apenas os pedidos selecionados e registra autor e motivo', async () => {
      const internals = service as unknown as {
        getDetail(invoiceId: string): Promise<unknown>;
      };
      const detailSpy = jest
        .spyOn(internals, 'getDetail')
        .mockResolvedValueOnce({ id: 'fatura-1' });

      await service.createManualInvoice(admin, payload);

      expect(tx.invoice.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          companyId: 'empresa-1',
          issueDate: new Date('2026-08-25T00:00:00.000Z'),
          dueDate: new Date('2026-08-30T00:00:00.000Z'),
          totalValue: 0.3,
          driverValueSum: 0.09,
          platformValueSum: 0.21,
        }),
      });
      expect(tx.delivery.updateMany).toHaveBeenCalledWith({
        where: expect.objectContaining({
          companyId: 'empresa-1',
          id: { in: ['entrega-1', 'entrega-2'] },
          status: 'COMPLETED',
          paymentMethod: 'BILLED',
          invoiceId: null,
        }),
        data: { invoiceId: 'fatura-1' },
      });
      expect(tx.invoiceStatusHistory.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          changedByUserId: 'admin-1',
          note: expect.stringMatching(/selecionados pelo administrador/i),
        }),
      });
      expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
        isolationLevel: 'Serializable',
      });
      detailSpy.mockRestore();
    });

    it('recusa quando outro fechamento vinculou um pedido durante a emissao', async () => {
      tx.delivery.updateMany.mockResolvedValue({ count: 1 });

      await expect(service.createManualInvoice(admin, payload)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('recusa emissao futura', async () => {
      await expect(
        service.previewManualInvoice({
          ...payload,
          issueDate: '2026-08-26',
          dueDate: '2026-08-30',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.delivery.findMany).not.toHaveBeenCalled();
    });
  });

  describe('alteracao de vencimento', () => {
    const payload = {
      dueDate: '2026-08-30',
      reason: 'Prazo renegociado com a empresa.',
    };

    beforeEach(() => {
      clock.now.mockReturnValue(new Date('2026-08-25T15:00:00.000Z'));
    });

    it('altera a data e registra o motivo com o administrador', async () => {
      const internals = service as unknown as {
        getDetail(invoiceId: string): Promise<unknown>;
      };
      const detailSpy = jest
        .spyOn(internals, 'getDetail')
        .mockResolvedValueOnce({ id: 'fatura-1' });

      await service.updateDueDate(admin, 'fatura-1', payload);

      expect(tx.invoice.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'fatura-1',
          status: 'PENDING',
          dueDate: new Date('2026-08-25T00:00:00.000Z'),
        },
        data: {
          dueDate: new Date('2026-08-30T00:00:00.000Z'),
          status: 'PENDING',
        },
      });
      expect(tx.invoiceStatusHistory.create).toHaveBeenCalledWith({
        data: {
          invoiceId: 'fatura-1',
          fromStatus: 'PENDING',
          toStatus: 'PENDING',
          changedByUserId: 'admin-1',
          note: 'Vencimento alterado de 2026-08-25 para 2026-08-30. Motivo: Prazo renegociado com a empresa.',
        },
      });
      detailSpy.mockRestore();
    });

    it('devolve uma fatura vencida para pendente ao prorrogar o prazo', async () => {
      tx.invoice.findUnique.mockResolvedValue({
        status: 'OVERDUE',
        issueDate: new Date('2026-08-20T00:00:00.000Z'),
        dueDate: new Date('2026-08-24T00:00:00.000Z'),
      });
      const internals = service as unknown as {
        getDetail(invoiceId: string): Promise<unknown>;
      };
      const detailSpy = jest
        .spyOn(internals, 'getDetail')
        .mockResolvedValueOnce({ id: 'fatura-1' });

      await service.updateDueDate(admin, 'fatura-1', payload);

      expect(tx.invoice.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'PENDING' }) }),
      );
      expect(tx.invoiceStatusHistory.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ fromStatus: 'OVERDUE', toStatus: 'PENDING' }),
      });
      detailSpy.mockRestore();
    });

    it('marca como vencida imediatamente quando a nova data ja passou', async () => {
      tx.invoice.findUnique.mockResolvedValue({
        status: 'PENDING',
        issueDate: new Date('2026-08-20T00:00:00.000Z'),
        dueDate: new Date('2026-08-25T00:00:00.000Z'),
      });
      const internals = service as unknown as {
        getDetail(invoiceId: string): Promise<unknown>;
      };
      const detailSpy = jest
        .spyOn(internals, 'getDetail')
        .mockResolvedValueOnce({ id: 'fatura-1' });

      await service.updateDueDate(admin, 'fatura-1', {
        ...payload,
        dueDate: '2026-08-24',
      });

      expect(tx.invoice.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'OVERDUE' }) }),
      );
      detailSpy.mockRestore();
    });

    it('recusa vencimento anterior a emissao', async () => {
      await expect(
        service.updateDueDate(admin, 'fatura-1', { ...payload, dueDate: '2026-08-23' }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(tx.invoice.updateMany).not.toHaveBeenCalled();
    });

    it.each(['PAID', 'CANCELLED'] as const)('recusa fatura em status %s', async (status) => {
      tx.invoice.findUnique.mockResolvedValue({
        status,
        issueDate: new Date('2026-08-24T00:00:00.000Z'),
        dueDate: new Date('2026-08-25T00:00:00.000Z'),
      });

      await expect(service.updateDueDate(admin, 'fatura-1', payload)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(tx.invoice.updateMany).not.toHaveBeenCalled();
    });

    it('recusa quando outra tela alterou a mesma fatura primeiro', async () => {
      tx.invoice.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.updateDueDate(admin, 'fatura-1', payload)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(tx.invoiceStatusHistory.create).not.toHaveBeenCalled();
    });
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
