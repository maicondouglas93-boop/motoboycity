import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma, User } from '@prisma/client';
import type { PaymentNotice, PaymentNoticeQueueItem } from '@motoboycity/types';
import type {
  ConfirmPaymentNoticePayload,
  CreatePaymentNoticePayload,
  RejectPaymentNoticePayload,
} from '@motoboycity/validation';
import { PrismaService } from '../prisma/prisma.service';
import { FinancialClock } from './financial-clock.service';
import { InvoiceService } from './invoice.service';
import { civilDateFromDbDate } from '../common/sao-paulo-time';

/** O que o `select` do Prisma precisa trazer para montar um `PaymentNotice`. */
const SELECAO = {
  id: true,
  invoiceId: true,
  amount: true,
  paidAt: true,
  note: true,
  status: true,
  createdAt: true,
  reviewedAt: true,
  reviewNote: true,
  createdByUser: { select: { id: true, name: true } },
  reviewedByUser: { select: { id: true, name: true } },
} satisfies Prisma.InvoicePaymentNoticeSelect;

type LinhaDoAviso = Prisma.InvoicePaymentNoticeGetPayload<{ select: typeof SELECAO }>;

/**
 * Avisos de pagamento: a loja sinaliza, o admin decide.
 *
 * A regra que organiza este arquivo inteiro: **nenhum metodo daqui escreve em
 * `Invoice.status`**. Confirmar um aviso delega para `InvoiceService.markPaid`,
 * que ja e o unico caminho de baixa e o unico que grava o historico da fatura.
 * Ter um segundo jeito de marcar como paga significaria duas trilhas de
 * auditoria discordando sobre a mesma fatura.
 */
@Injectable()
export class PaymentNoticeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly invoiceService: InvoiceService,
    private readonly clock: FinancialClock,
  ) {}

  /**
   * A loja avisa que pagou.
   *
   * Nao muda nada na fatura, de proposito: cria uma linha na fila do admin.
   */
  async create(
    user: User,
    invoiceId: string,
    payload: CreatePaymentNoticePayload,
  ): Promise<PaymentNotice> {
    const companyId = await this.resolverEmpresa(user);

    const fatura = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      select: { id: true, companyId: true, status: true },
    });
    if (!fatura) throw new NotFoundException('Fatura não encontrada.');
    if (fatura.companyId !== companyId) {
      throw new ForbiddenException('Você não tem acesso a esta fatura.');
    }
    if (fatura.status === 'PAID') {
      throw new ConflictException('Esta fatura já consta como paga.');
    }
    if (fatura.status === 'CANCELLED') {
      throw new ConflictException('Esta fatura foi cancelada e não deve ser paga.');
    }

    /**
     * Um aviso em aberto por vez.
     *
     * Sem isto, a loja que clica duas vezes enche a fila do admin com o mesmo
     * pagamento — e a fila so serve enquanto cada linha significa uma decisao.
     */
    const jaExiste = await this.prisma.invoicePaymentNotice.findFirst({
      where: { invoiceId, status: 'PENDING' },
      select: { id: true },
    });
    if (jaExiste) {
      throw new ConflictException(
        'Já existe um aviso desta fatura aguardando conferência do administrador.',
      );
    }

    let criado: LinhaDoAviso;
    try {
      criado = await this.prisma.invoicePaymentNotice.create({
        data: {
          invoiceId,
          amount: payload.amount,
          paidAt: new Date(`${payload.paidAt}T00:00:00.000Z`),
          note: payload.note ?? null,
          createdByUserId: user.id,
        },
        select: SELECAO,
      });
    } catch (error) {
      // A consulta acima melhora a mensagem no caminho comum; o indice unico
      // parcial e este tratamento fecham a corrida entre duas requisicoes.
      if ((error as { code?: string }).code === 'P2002') {
        throw new ConflictException(
          'Já existe um aviso desta fatura aguardando conferência do administrador.',
        );
      }
      throw error;
    }

    return this.montar(criado);
  }

  /** Os avisos de uma fatura, para a loja acompanhar o que ela mesma mandou. */
  async listForInvoice(user: User, invoiceId: string): Promise<PaymentNotice[]> {
    const companyId = await this.resolverEmpresa(user);

    const fatura = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      select: { companyId: true },
    });
    if (!fatura) throw new NotFoundException('Fatura não encontrada.');
    if (fatura.companyId !== companyId) {
      throw new ForbiddenException('Você não tem acesso a esta fatura.');
    }

    const avisos = await this.prisma.invoicePaymentNotice.findMany({
      where: { invoiceId },
      orderBy: { createdAt: 'desc' },
      select: SELECAO,
    });

    return avisos.map((aviso) => this.montar(aviso));
  }

  /** A fila do admin: o que espera decisao, mais recente primeiro. */
  async queue(
    status: 'PENDING' | 'CONFIRMED' | 'REJECTED' = 'PENDING',
  ): Promise<PaymentNoticeQueueItem[]> {
    const avisos = await this.prisma.invoicePaymentNotice.findMany({
      where: { status },
      orderBy: { createdAt: 'desc' },
      select: {
        ...SELECAO,
        invoice: {
          select: {
            number: true,
            totalValue: true,
            status: true,
            companyId: true,
            company: { select: { tradeName: true } },
          },
        },
      },
    });

    return avisos.map((aviso) => {
      const total = Number(aviso.invoice.totalValue);
      const informado = Number(aviso.amount);
      return {
        ...this.montar(aviso),
        invoiceNumber: aviso.invoice.number,
        invoiceTotalValue: total,
        invoiceStatus: aviso.invoice.status,
        companyId: aviso.invoice.companyId,
        companyName: aviso.invoice.company.tradeName,
        // Em centavos inteiros: a diferenca e o numero que decide se o admin
        // confirma ou recusa, e ela nao pode carregar sobra de float.
        difference: (Math.round(informado * 100) - Math.round(total * 100)) / 100,
      };
    });
  }

  /**
   * O admin confirma o recebimento.
   *
   * Marca o aviso como conferido E da a baixa na fatura na mesma transacao.
   * A baixa usa o mesmo nucleo da `markPaid`; se qualquer passo falhar, tudo
   * volta e o aviso continua pendente para alguem olhar.
   */
  async confirm(
    admin: User,
    noticeId: string,
    payload: ConfirmPaymentNoticePayload,
  ): Promise<PaymentNotice> {
    const atualizado = await this.prisma.$transaction(async (tx) => {
      const aviso = await this.exigirPendente(noticeId, tx);
      const reservado = await tx.invoicePaymentNotice.updateMany({
        where: { id: noticeId, status: 'PENDING' },
        data: {
          status: 'CONFIRMED',
          reviewedByUserId: admin.id,
          reviewedAt: this.clock.now(),
          reviewNote: payload.reviewNote ?? null,
        },
      });
      if (reservado.count !== 1) {
        throw new ConflictException('O aviso mudou de situação durante a conferência.');
      }

      await this.invoiceService.markPaidWithinTransaction(tx, admin, aviso.invoiceId, {
        paymentDate: payload.paymentDate,
        paymentMethod: payload.paymentMethod,
      });

      const linha = await tx.invoicePaymentNotice.findUnique({
        where: { id: noticeId },
        select: SELECAO,
      });
      if (!linha) throw new NotFoundException('Aviso de pagamento não encontrado.');
      return linha;
    });

    return this.montar(atualizado);
  }

  /**
   * O admin recusa o aviso.
   *
   * A fatura nao e tocada: continua devendo. O motivo e obrigatorio para a
   * loja saber o que corrigir antes de avisar de novo.
   */
  async reject(
    admin: User,
    noticeId: string,
    payload: RejectPaymentNoticePayload,
  ): Promise<PaymentNotice> {
    const atualizado = await this.prisma.$transaction(async (tx) => {
      await this.exigirPendente(noticeId, tx);
      const recusado = await tx.invoicePaymentNotice.updateMany({
        where: { id: noticeId, status: 'PENDING' },
        data: {
          status: 'REJECTED',
          reviewedByUserId: admin.id,
          reviewedAt: this.clock.now(),
          reviewNote: payload.reviewNote,
        },
      });
      if (recusado.count !== 1) {
        throw new ConflictException('O aviso mudou de situação durante a conferência.');
      }

      const linha = await tx.invoicePaymentNotice.findUnique({
        where: { id: noticeId },
        select: SELECAO,
      });
      if (!linha) throw new NotFoundException('Aviso de pagamento não encontrado.');
      return linha;
    });

    return this.montar(atualizado);
  }

  /** Um aviso que ainda espera decisao, ou o erro que diz por que nao. */
  private async exigirPendente(
    noticeId: string,
    db: PrismaService | Prisma.TransactionClient = this.prisma,
  ) {
    const aviso = await db.invoicePaymentNotice.findUnique({
      where: { id: noticeId },
      select: { id: true, invoiceId: true, status: true },
    });
    if (!aviso) throw new NotFoundException('Aviso de pagamento não encontrado.');
    if (aviso.status !== 'PENDING') {
      throw new ConflictException(
        `Este aviso já foi conferido (situação: ${aviso.status === 'CONFIRMED' ? 'confirmado' : 'recusado'}).`,
      );
    }
    return aviso;
  }

  /** A empresa do usuário logado, do TOKEN e nunca de parâmetro. */
  private async resolverEmpresa(user: User): Promise<string> {
    if (user.type !== 'COMPANY_MEMBER') {
      throw new ForbiddenException('Acesso restrito a empresas.');
    }
    const vinculo = await this.prisma.companyTeamMember.findFirst({
      where: { userId: user.id },
      select: { companyId: true },
    });
    if (!vinculo) {
      throw new ForbiddenException('Usuário não está vinculado a uma empresa.');
    }
    return vinculo.companyId;
  }

  private montar(linha: LinhaDoAviso): PaymentNotice {
    return {
      id: linha.id,
      invoiceId: linha.invoiceId,
      amount: Number(linha.amount),
      // Coluna `@db.Date`: dia civil, sem hora. Serializar como instante faria
      // a tela mostrar o dia anterior.
      paidAt: civilDateFromDbDate(linha.paidAt),
      note: linha.note,
      status: linha.status,
      createdAt: linha.createdAt.toISOString(),
      createdBy: linha.createdByUser,
      reviewedBy: linha.reviewedByUser,
      reviewedAt: linha.reviewedAt?.toISOString() ?? null,
      reviewNote: linha.reviewNote,
    };
  }
}
