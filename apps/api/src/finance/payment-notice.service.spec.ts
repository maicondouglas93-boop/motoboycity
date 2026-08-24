import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { FinancialClock } from './financial-clock.service';
import { InvoiceService } from './invoice.service';
import { PaymentNoticeService } from './payment-notice.service';

const AGORA = new Date('2026-08-31T15:00:00Z');

function linhaDoAviso(extra: Record<string, unknown> = {}) {
  return {
    id: 'aviso-1',
    invoiceId: 'fatura-1',
    amount: 340,
    paidAt: new Date('2026-08-31T00:00:00.000Z'),
    note: 'PIX',
    status: 'PENDING',
    createdAt: new Date('2026-08-31T14:00:00Z'),
    reviewedAt: null,
    reviewNote: null,
    createdByUser: { id: 'user-1', name: 'Lojista' },
    reviewedByUser: null,
    ...extra,
  };
}

describe('PaymentNoticeService', () => {
  let service: PaymentNoticeService;
  let prisma: {
    $transaction: jest.Mock;
    companyTeamMember: { findFirst: jest.Mock };
    invoice: { findUnique: jest.Mock };
    invoicePaymentNotice: {
      create: jest.Mock;
      findFirst: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
      updateMany: jest.Mock;
    };
  };
  let invoiceService: { markPaidWithinTransaction: jest.Mock };

  const lojista = { id: 'user-1', type: 'COMPANY_MEMBER' } as User;
  const admin = { id: 'admin-1', type: 'ADMIN' } as User;

  beforeEach(async () => {
    prisma = {
      $transaction: jest.fn(),
      companyTeamMember: { findFirst: jest.fn().mockResolvedValue({ companyId: 'empresa-1' }) },
      invoice: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: 'fatura-1', companyId: 'empresa-1', status: 'PENDING' }),
      },
      invoicePaymentNotice: {
        create: jest.fn().mockResolvedValue(linhaDoAviso()),
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest
          .fn()
          .mockImplementation((args: { select?: Record<string, unknown> }) =>
            Promise.resolve(
              args.select?.['createdByUser']
                ? linhaDoAviso({ status: 'CONFIRMED' })
                : { id: 'aviso-1', invoiceId: 'fatura-1', status: 'PENDING' },
            ),
          ),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    prisma.$transaction.mockImplementation((callback: (tx: typeof prisma) => unknown) =>
      callback(prisma),
    );
    invoiceService = { markPaidWithinTransaction: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentNoticeService,
        { provide: PrismaService, useValue: prisma },
        { provide: InvoiceService, useValue: invoiceService },
        { provide: FinancialClock, useValue: { now: () => AGORA } },
      ],
    }).compile();

    service = module.get(PaymentNoticeService);
  });

  describe('a loja avisa', () => {
    it('NÃO toca no status da fatura', async () => {
      /**
       * A regra que justifica esta funcionalidade existir da forma que existe.
       * Se avisar desse baixa, o devedor estaria quitando a própria dívida.
       */
      await service.create(lojista, 'fatura-1', { amount: 340, paidAt: '2026-08-31' });

      expect(invoiceService.markPaidWithinTransaction).not.toHaveBeenCalled();
      const dadosCriados = prisma.invoicePaymentNotice.create.mock.calls[0]?.[0].data;
      expect(dadosCriados).not.toHaveProperty('status');
    });

    it('guarda o dia informado sem escorregar de fuso', async () => {
      await service.create(lojista, 'fatura-1', { amount: 340, paidAt: '2026-08-31' });

      const dados = prisma.invoicePaymentNotice.create.mock.calls[0]?.[0].data;
      expect(dados.paidAt.toISOString()).toBe('2026-08-31T00:00:00.000Z');
    });

    it('recusa avisar fatura de outra loja', async () => {
      prisma.invoice.findUnique.mockResolvedValue({
        id: 'fatura-9',
        companyId: 'empresa-2',
        status: 'PENDING',
      });

      await expect(
        service.create(lojista, 'fatura-9', { amount: 10, paidAt: '2026-08-31' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.invoicePaymentNotice.create).not.toHaveBeenCalled();
    });

    it('recusa avisar fatura já paga', async () => {
      prisma.invoice.findUnique.mockResolvedValue({
        id: 'fatura-1',
        companyId: 'empresa-1',
        status: 'PAID',
      });

      await expect(
        service.create(lojista, 'fatura-1', { amount: 340, paidAt: '2026-08-31' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('recusa avisar fatura cancelada', async () => {
      prisma.invoice.findUnique.mockResolvedValue({
        id: 'fatura-1',
        companyId: 'empresa-1',
        status: 'CANCELLED',
      });

      await expect(
        service.create(lojista, 'fatura-1', { amount: 340, paidAt: '2026-08-31' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('recusa o segundo aviso enquanto o primeiro espera', async () => {
      // Clique duplo encheria a fila do admin com o mesmo pagamento, e a fila
      // só serve enquanto cada linha significa uma decisão.
      prisma.invoicePaymentNotice.findFirst.mockResolvedValue({ id: 'aviso-1' });

      await expect(
        service.create(lojista, 'fatura-1', { amount: 340, paidAt: '2026-08-31' }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.invoicePaymentNotice.create).not.toHaveBeenCalled();
    });

    it('traduz a corrida protegida pelo indice unico para conflito', async () => {
      prisma.invoicePaymentNotice.create.mockRejectedValue(
        Object.assign(new Error('unique'), { code: 'P2002' }),
      );

      await expect(
        service.create(lojista, 'fatura-1', { amount: 340, paidAt: '2026-08-31' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('recusa motoboy', async () => {
      const motoboy = { id: 'user-9', type: 'DRIVER' } as User;

      await expect(
        service.create(motoboy, 'fatura-1', { amount: 10, paidAt: '2026-08-31' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('o admin confirma', () => {
    it('dá a baixa pela markPaid, e não escrevendo status', async () => {
      /**
       * Um segundo caminho de baixa significaria duas trilhas de auditoria
       * discordando sobre a mesma fatura.
       */
      await service.confirm(admin, 'aviso-1', {
        paymentDate: '2026-08-31',
        paymentMethod: 'BILLED',
      });

      expect(invoiceService.markPaidWithinTransaction).toHaveBeenCalledWith(
        prisma,
        admin,
        'fatura-1',
        {
          paymentDate: '2026-08-31',
          paymentMethod: 'BILLED',
        },
      );
      const atualizacao = prisma.invoicePaymentNotice.updateMany.mock.calls[0]?.[0].data;
      expect(atualizacao.status).toBe('CONFIRMED');
      expect(atualizacao.reviewedByUserId).toBe('admin-1');
    });

    it('usa a data que o ADMIN informou, não a que a loja disse', async () => {
      // A loja diz o dia do PIX; o admin confirma com o extrato na frente, e é
      // o extrato que vira a data de pagamento da fatura.
      await service.confirm(admin, 'aviso-1', {
        paymentDate: '2026-09-01',
        paymentMethod: 'BILLED',
      });

      expect(invoiceService.markPaidWithinTransaction).toHaveBeenCalledWith(
        prisma,
        admin,
        'fatura-1',
        expect.objectContaining({ paymentDate: '2026-09-01' }),
      );
    });

    it('se a markPaid recusar, o aviso NÃO vira confirmado', async () => {
      // Fatura já paga por fora: alguém precisa olhar, então o aviso continua
      // na fila em vez de sumir marcado como resolvido.
      invoiceService.markPaidWithinTransaction.mockRejectedValue(new ConflictException('já paga'));

      await expect(
        service.confirm(admin, 'aviso-1', {
          paymentDate: '2026-08-31',
          paymentMethod: 'BILLED',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.invoicePaymentNotice.findUnique).toHaveBeenCalledTimes(1);
    });

    it('recusa conferir duas vezes', async () => {
      prisma.invoicePaymentNotice.findUnique.mockResolvedValue({
        id: 'aviso-1',
        invoiceId: 'fatura-1',
        status: 'CONFIRMED',
      });

      await expect(
        service.confirm(admin, 'aviso-1', {
          paymentDate: '2026-08-31',
          paymentMethod: 'BILLED',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(invoiceService.markPaidWithinTransaction).not.toHaveBeenCalled();
    });

    it('para quando outra conferencia reservou o aviso primeiro', async () => {
      prisma.invoicePaymentNotice.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.confirm(admin, 'aviso-1', {
          paymentDate: '2026-08-31',
          paymentMethod: 'BILLED',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(invoiceService.markPaidWithinTransaction).not.toHaveBeenCalled();
    });

    it('erra claro quando o aviso não existe', async () => {
      prisma.invoicePaymentNotice.findUnique.mockResolvedValue(null);

      await expect(
        service.confirm(admin, 'sumiu', { paymentDate: '2026-08-31', paymentMethod: 'BILLED' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('o admin recusa', () => {
    it('não toca na fatura: ela continua devendo', async () => {
      await service.reject(admin, 'aviso-1', { reviewNote: 'Não localizei o PIX.' });

      expect(invoiceService.markPaidWithinTransaction).not.toHaveBeenCalled();
      const atualizacao = prisma.invoicePaymentNotice.updateMany.mock.calls[0]?.[0].data;
      expect(atualizacao.status).toBe('REJECTED');
      expect(atualizacao.reviewNote).toBe('Não localizei o PIX.');
    });

    it('para quando outra decisao reservou o aviso primeiro', async () => {
      prisma.invoicePaymentNotice.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.reject(admin, 'aviso-1', { reviewNote: 'Não localizei o PIX.' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('a fila do admin', () => {
    it('calcula a diferença em centavos, sem sobra de float', async () => {
      prisma.invoicePaymentNotice.findMany.mockResolvedValue([
        {
          ...linhaDoAviso({ amount: 10.1 }),
          invoice: {
            number: 'FAT-1',
            totalValue: 20.2,
            status: 'PENDING',
            companyId: 'empresa-1',
            company: { tradeName: 'Loja Teste' },
          },
        },
      ]);

      const fila = await service.queue();

      // 10.1 - 20.2 em float dá -10.099999999999998.
      expect(fila[0]?.difference).toBe(-10.1);
      expect(fila[0]?.companyName).toBe('Loja Teste');
      expect(fila[0]?.invoiceTotalValue).toBe(20.2);
    });

    it('mostra o dia do pagamento como dia civil', async () => {
      prisma.invoicePaymentNotice.findMany.mockResolvedValue([
        {
          ...linhaDoAviso(),
          invoice: {
            number: 'FAT-1',
            totalValue: 340,
            status: 'PENDING',
            companyId: 'empresa-1',
            company: { tradeName: 'Loja Teste' },
          },
        },
      ]);

      const fila = await service.queue();

      expect(fila[0]?.paidAt).toBe('2026-08-31');
    });

    it('por padrão traz só o que espera decisão', async () => {
      await service.queue();

      expect(prisma.invoicePaymentNotice.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { status: 'PENDING' } }),
      );
    });
  });
});
