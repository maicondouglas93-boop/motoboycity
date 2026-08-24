import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  CloseInvoicesPayload,
  ListInvoicesQuery,
  CancelInvoicePayload,
  MarkInvoicePaidPayload,
} from '@motoboycity/validation';
import type { Prisma, User } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { FinancialClock } from './financial-clock.service';
import {
  dateInSaoPaulo,
  invoiceClosingCutoff,
  latestInvoiceClosingDateInSaoPaulo,
} from './finance-release.utils';
import { civilDateFromDbDate } from '../common/sao-paulo-time';

export interface InvoiceListItem {
  id: string;
  number: string;
  companyId: string;
  companyName: string;
  issueDate: string;
  dueDate: string;
  paymentDate: string | null;
  paymentMethod: 'BILLED' | 'ONLINE' | null;
  status: 'PENDING' | 'PAID' | 'OVERDUE' | 'CANCELLED';
  totalValue: number;
  driverValueSum: number;
  platformValueSum: number;
  deliveryCount: number;
}

export interface InvoiceDetail extends InvoiceListItem {
  deliveries: Array<{
    id: string;
    displayNumber: number;
    totalValue: number;
    driverValue: number;
    platformValue: number;
    completedAt: string;
  }>;
  statusHistory: Array<{
    fromStatus: InvoiceListItem['status'] | null;
    toStatus: InvoiceListItem['status'];
    changedAt: string;
    changedBy: { id: string; name: string } | null;
    note: string | null;
  }>;
}

export type CompanyInvoiceListItem = Omit<
  InvoiceListItem,
  'driverValueSum' | 'platformValueSum'
>;

export interface CompanyInvoiceDetail extends CompanyInvoiceListItem {
  deliveries: Array<{
    id: string;
    displayNumber: number;
    totalValue: number;
    completedAt: string;
  }>;
  statusHistory: InvoiceDetail['statusHistory'];
}

function numberOrZero(value: { toString(): string } | null): number {
  return value === null ? 0 : Number(value);
}

function sumMoney(values: ReadonlyArray<{ toString(): string } | null>): number {
  return (
    values.reduce<number>(
      (totalCents, value) => totalCents + Math.round(numberOrZero(value) * 100),
      0,
    ) /
    100
  );
}

@Injectable()
export class InvoiceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: FinancialClock,
  ) {}

  async closeOpenInvoices(admin: User, payload: CloseInvoicesPayload): Promise<InvoiceListItem[]> {
    const issueDate = this.dateOnly(payload.issueDate);
    if (issueDate.getUTCDay() !== 1) {
      throw new ConflictException(
        'O fechamento de faturas só pode ser realizado em uma segunda-feira.',
      );
    }
    const cutoff = invoiceClosingCutoff(payload.issueDate);
    if (cutoff.getTime() > this.clock.now().getTime()) {
      throw new ConflictException(
        'O fechamento não pode ser antecipado; aguarde segunda-feira às 00:05.',
      );
    }

    return this.closeInvoices({
      issueDate: payload.issueDate,
      cutoff,
      changedByUserId: admin.id,
      automatic: false,
    });
  }

  async closeScheduledInvoices(now = this.clock.now()): Promise<InvoiceListItem[]> {
    const issueDate = latestInvoiceClosingDateInSaoPaulo(now);
    return this.closeInvoices({
      issueDate,
      cutoff: invoiceClosingCutoff(issueDate),
      changedByUserId: null,
      automatic: true,
    });
  }

  private async closeInvoices(input: {
    issueDate: string;
    cutoff: Date;
    changedByUserId: string | null;
    automatic: boolean;
  }): Promise<InvoiceListItem[]> {
    const issueDate = this.dateOnly(input.issueDate);

    /**
     * A fatura vence NO DIA em que e emitida. E regra do negocio, nao descuido.
     *
     * O ciclo inteiro cabe na segunda-feira: o corte roda 00:05, a fatura nasce
     * com vencimento no mesmo dia, e a loja paga ao longo do expediente. Como o
     * `refreshOverdueInvoices` compara com `dueDate < hoje`, ela so vira
     * OVERDUE na terca de madrugada — ou seja, um dia util cheio para pagar.
     *
     * Se algum dia existir prazo, ele vira configuracao e passa por aqui. Ate
     * la, isto NAO e um `dueDate` esquecido esperando conserto.
     */
    const dueDate = issueDate;
    const invoiceIds = await this.prisma.$transaction(async (tx) => {
      const deliveries = await tx.delivery.findMany({
        where: {
          status: 'COMPLETED',
          paymentMethod: 'BILLED',
          invoiceId: null,
          statusChangedAt: { lte: input.cutoff },
          totalValue: { not: null },
          driverValue: { not: null },
          platformValue: { not: null },
        },
        select: {
          id: true,
          companyId: true,
          totalValue: true,
          driverValue: true,
          platformValue: true,
        },
      });

      const byCompany = new Map<string, typeof deliveries>();
      for (const delivery of deliveries) {
        const group = byCompany.get(delivery.companyId) ?? [];
        group.push(delivery);
        byCompany.set(delivery.companyId, group);
      }

      const ids: string[] = [];
      for (const [companyId, companyDeliveries] of byCompany) {
        const invoice = await tx.invoice.create({
          data: {
            companyId,
            number: this.invoiceNumber(input.issueDate),
            issueDate,
            dueDate,
            totalValue: sumMoney(companyDeliveries.map((delivery) => delivery.totalValue)),
            driverValueSum: sumMoney(
              companyDeliveries.map((delivery) => delivery.driverValue),
            ),
            platformValueSum: sumMoney(
              companyDeliveries.map((delivery) => delivery.platformValue),
            ),
          },
        });

        const linked = await tx.delivery.updateMany({
          where: {
            id: { in: companyDeliveries.map((delivery) => delivery.id) },
            status: 'COMPLETED',
            paymentMethod: 'BILLED',
            invoiceId: null,
          },
          data: { invoiceId: invoice.id },
        });
        if (linked.count !== companyDeliveries.length) {
          throw new ConflictException(
            'Um ou mais pedidos já foram faturados em outra solicitação. Atualize a lista e tente novamente.',
          );
        }

        await tx.invoiceStatusHistory.create({
          data: {
            invoiceId: invoice.id,
            fromStatus: null,
            toStatus: 'PENDING',
            changedByUserId: input.changedByUserId,
            note: input.automatic
              ? `Fechamento automático semanal de ${companyDeliveries.length} pedido(s).`
              : `Fechamento financeiro manual de ${companyDeliveries.length} pedido(s).`,
          },
        });
        ids.push(invoice.id);
      }
      return ids;
    });

    return Promise.all(invoiceIds.map((invoiceId) => this.getListItem(invoiceId)));
  }

  async markPaid(
    admin: User,
    invoiceId: string,
    payload: MarkInvoicePaidPayload,
  ): Promise<InvoiceDetail> {
    await this.prisma.$transaction((tx) =>
      this.markPaidWithinTransaction(tx, admin, invoiceId, payload),
    );

    return this.getDetail(invoiceId);
  }

  /**
   * A mesma baixa usada pela rota manual, mas dentro de uma transacao que o
   * chamador ja abriu. O aviso de pagamento usa este ponto para que confirmar
   * o aviso, quitar a fatura e gravar o historico sejam uma unica operacao.
   */
  async markPaidWithinTransaction(
    tx: Prisma.TransactionClient,
    admin: User,
    invoiceId: string,
    payload: MarkInvoicePaidPayload,
  ): Promise<void> {
    let fromStatus: 'PENDING' | 'OVERDUE' | null = null;
    for (const status of ['PENDING', 'OVERDUE'] as const) {
      const updated = await tx.invoice.updateMany({
        where: { id: invoiceId, status },
        data: {
          status: 'PAID',
          paymentDate: this.dateOnly(payload.paymentDate),
          paymentMethod: payload.paymentMethod,
        },
      });
      if (updated.count === 1) {
        fromStatus = status;
        break;
      }
    }

    if (!fromStatus) {
      const invoice = await tx.invoice.findUnique({
        where: { id: invoiceId },
        select: { status: true },
      });
      if (!invoice) throw new NotFoundException('Fatura não encontrada.');
      throw new ConflictException(
        `Esta fatura não pode ser marcada como paga (status: ${invoice.status}).`,
      );
    }

    await tx.invoiceStatusHistory.create({
      data: {
        invoiceId,
        fromStatus,
        toStatus: 'PAID',
        changedByUserId: admin.id,
        note: `Pagamento manual confirmado em ${payload.paymentDate}.`,
      },
    });
  }

  /**
   * Cancela uma fatura emitida errada e DEVOLVE as entregas para cobranca.
   *
   * O passo de soltar as entregas (`invoiceId: null`) e o que separa cancelar
   * de perder dinheiro. Sem ele a fatura some, as entregas continuam marcadas
   * como faturadas, e ninguem nunca mais as cobra — a cobranca seria apagada em
   * vez de reaberta.
   *
   * Fatura PAGA nao se cancela. Dinheiro que entrou se estorna, e estorno e
   * outra operacao, com outro lancamento; deixar cancelar uma fatura paga
   * apagaria a receita e deixaria o recebimento orfao no extrato.
   */
  async cancelInvoice(
    admin: User,
    invoiceId: string,
    payload: CancelInvoicePayload,
  ): Promise<InvoiceDetail> {
    await this.prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.findUnique({
        where: { id: invoiceId },
        select: { status: true },
      });
      if (!invoice) {
        throw new NotFoundException('Fatura não encontrada.');
      }
      if (invoice.status === 'PAID') {
        throw new ConflictException(
          'Esta fatura já foi paga. Pagamento recebido não se cancela: registre um estorno.',
        );
      }
      if (invoice.status === 'CANCELLED') {
        throw new ConflictException('Esta fatura já está cancelada.');
      }

      /**
       * `updateMany` com o status na condicao, e nao `update` pelo id.
       *
       * Duas telas cancelando ao mesmo tempo passariam as duas pela leitura
       * acima; aqui so uma encontra a fatura no estado esperado, e a outra
       * recebe count 0 e para.
       */
      const atualizada = await tx.invoice.updateMany({
        where: { id: invoiceId, status: invoice.status },
        data: { status: 'CANCELLED' },
      });
      if (atualizada.count !== 1) {
        throw new ConflictException('A fatura mudou de estado durante o cancelamento.');
      }

      // As entregas voltam a contar como "sem fatura" e entram no proximo
      // fechamento.
      await tx.delivery.updateMany({
        where: { invoiceId },
        data: { invoiceId: null },
      });

      await tx.invoiceStatusHistory.create({
        data: {
          invoiceId,
          fromStatus: invoice.status,
          toStatus: 'CANCELLED',
          changedByUserId: admin.id,
          note: payload.reason,
        },
      });
    });

    return this.getDetail(invoiceId);
  }

  async listForAdmin(query: ListInvoicesQuery): Promise<InvoiceListItem[]> {
    await this.refreshOverdueInvoices();
    return this.list(query, query.companyId);
  }

  async listForCompany(user: User, query: ListInvoicesQuery): Promise<CompanyInvoiceListItem[]> {
    await this.refreshOverdueInvoices();
    const invoices = await this.list(query, await this.resolveCompanyId(user));
    return invoices.map((invoice) => this.toCompanyListItem(invoice));
  }

  async detailForAdmin(invoiceId: string): Promise<InvoiceDetail> {
    await this.refreshOverdueInvoices();
    return this.getDetail(invoiceId);
  }

  async detailForCompany(user: User, invoiceId: string): Promise<CompanyInvoiceDetail> {
    await this.refreshOverdueInvoices();
    const companyId = await this.resolveCompanyId(user);
    const invoice = await this.prisma.invoice.findUnique({ where: { id: invoiceId } });
    if (!invoice) throw new NotFoundException('Fatura não encontrada.');
    if (invoice.companyId !== companyId)
      throw new ForbiddenException('Você não tem acesso a esta fatura.');
    return this.toCompanyDetail(await this.getDetail(invoiceId));
  }

  private toCompanyListItem(invoice: InvoiceListItem): CompanyInvoiceListItem {
    return {
      id: invoice.id,
      number: invoice.number,
      companyId: invoice.companyId,
      companyName: invoice.companyName,
      issueDate: invoice.issueDate,
      dueDate: invoice.dueDate,
      paymentDate: invoice.paymentDate,
      paymentMethod: invoice.paymentMethod,
      status: invoice.status,
      totalValue: invoice.totalValue,
      deliveryCount: invoice.deliveryCount,
    };
  }

  private toCompanyDetail(invoice: InvoiceDetail): CompanyInvoiceDetail {
    return {
      ...this.toCompanyListItem(invoice),
      deliveries: invoice.deliveries.map((delivery) => ({
        id: delivery.id,
        displayNumber: delivery.displayNumber,
        totalValue: delivery.totalValue,
        completedAt: delivery.completedAt,
      })),
      statusHistory: invoice.statusHistory,
    };
  }

  private async list(query: ListInvoicesQuery, companyId?: string): Promise<InvoiceListItem[]> {
    const invoices = await this.prisma.invoice.findMany({
      where: {
        ...(companyId && { companyId }),
        ...(query.status && { status: query.status }),
        ...(query.from || query.to
          ? {
              issueDate: {
                ...(query.from && { gte: this.dateOnly(query.from) }),
                ...(query.to && { lte: this.dateOnly(query.to) }),
              },
            }
          : {}),
      },
      include: {
        company: { select: { tradeName: true } },
        _count: { select: { deliveries: true } },
      },
      orderBy: [{ issueDate: 'desc' }, { createdAt: 'desc' }],
    });
    return invoices.map((invoice) => this.toListItem(invoice));
  }

  private async getListItem(invoiceId: string): Promise<InvoiceListItem> {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        company: { select: { tradeName: true } },
        _count: { select: { deliveries: true } },
      },
    });
    if (!invoice) throw new NotFoundException('Fatura não encontrada.');
    return this.toListItem(invoice);
  }

  private async getDetail(invoiceId: string): Promise<InvoiceDetail> {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        company: { select: { tradeName: true } },
        deliveries: {
          select: {
            id: true,
            displayNumber: true,
            totalValue: true,
            driverValue: true,
            platformValue: true,
            returnValue: true,
            statusChangedAt: true,
          },
          orderBy: { displayNumber: 'asc' },
        },
        statusHistory: {
          include: { changedByUser: { select: { id: true, name: true } } },
          orderBy: { changedAt: 'asc' },
        },
      },
    });
    if (!invoice) throw new NotFoundException('Fatura não encontrada.');

    return {
      ...this.toListItem({ ...invoice, _count: { deliveries: invoice.deliveries.length } }),
      deliveries: invoice.deliveries.map((delivery) => ({
        id: delivery.id,
        displayNumber: delivery.displayNumber,
        totalValue: numberOrZero(delivery.totalValue),
        driverValue: numberOrZero(delivery.driverValue),
        platformValue: numberOrZero(delivery.platformValue),
        // Nulo quando nao ha retorno: zero e "retorno de R$ 0,00", que nao
        // existe. A tela usa a diferenca para decidir se marca a linha.
        returnValue: delivery.returnValue === null ? null : Number(delivery.returnValue),
        completedAt: delivery.statusChangedAt.toISOString(),
      })),
      statusHistory: invoice.statusHistory.map((history) => ({
        fromStatus: history.fromStatus,
        toStatus: history.toStatus,
        changedAt: history.changedAt.toISOString(),
        changedBy: history.changedByUser,
        note: history.note,
      })),
    };
  }

  private toListItem(invoice: {
    id: string;
    number: string;
    companyId: string;
    company: { tradeName: string };
    issueDate: Date;
    dueDate: Date;
    paymentDate: Date | null;
    paymentMethod: 'BILLED' | 'ONLINE' | null;
    status: InvoiceListItem['status'];
    totalValue: { toString(): string };
    driverValueSum: { toString(): string };
    platformValueSum: { toString(): string };
    _count: { deliveries: number };
  }): InvoiceListItem {
    return {
      id: invoice.id,
      number: invoice.number,
      companyId: invoice.companyId,
      companyName: invoice.company.tradeName,
      issueDate: civilDateFromDbDate(invoice.issueDate),
      dueDate: civilDateFromDbDate(invoice.dueDate),
      paymentDate: invoice.paymentDate ? civilDateFromDbDate(invoice.paymentDate) : null,
      paymentMethod: invoice.paymentMethod,
      status: invoice.status,
      totalValue: Number(invoice.totalValue),
      driverValueSum: Number(invoice.driverValueSum),
      platformValueSum: Number(invoice.platformValueSum),
      deliveryCount: invoice._count.deliveries,
    };
  }

  /**
   * Publico porque a posicao de caixa tambem depende dele.
   *
   * "Vencida" e um status ARMAZENADO, nao derivado na consulta — quem le sem
   * chamar isto antes pode ver uma fatura ja vencida ainda como pendente, e o
   * caixa mostraria zero atrasado com dinheiro atrasado de verdade.
   */
  async refreshOverdueInvoices(): Promise<void> {
    const now = this.dateOnly(dateInSaoPaulo(this.clock.now()));
    const overdue = await this.prisma.invoice.findMany({
      where: { status: 'PENDING', dueDate: { lt: now } },
      select: { id: true },
    });
    if (overdue.length === 0) return;

    await this.prisma.$transaction(async (tx) => {
      for (const invoice of overdue) {
        const updated = await tx.invoice.updateMany({
          where: { id: invoice.id, status: 'PENDING' },
          data: { status: 'OVERDUE' },
        });
        if (updated.count === 1) {
          await tx.invoiceStatusHistory.create({
            data: {
              invoiceId: invoice.id,
              fromStatus: 'PENDING',
              toStatus: 'OVERDUE',
              note: 'Vencimento ultrapassado; atualização automática na consulta financeira.',
            },
          });
        }
      }
    });
  }

  private async resolveCompanyId(user: User): Promise<string> {
    if (user.type !== 'COMPANY_MEMBER') throw new ForbiddenException('Acesso restrito a empresas.');
    const membership = await this.prisma.companyTeamMember.findFirst({
      where: { userId: user.id, active: true },
    });
    if (!membership) throw new ForbiddenException('Usuário não está vinculado a uma empresa.');
    return membership.companyId;
  }

  private invoiceNumber(issueDate: string): string {
    return `FAT-${issueDate.replaceAll('-', '')}-${randomUUID().slice(0, 8).toUpperCase()}`;
  }

  /**
   * Meia-noite UTC, que e como a coluna representa uma data civil guardada.
   *
   * Isto NAO e o fuso da operacao de proposito: `issueDate` e `paymentDate`
   * sao valores armazenados e comparados com linhas ja existentes. Move-los
   * para 03:00 mudaria dado gravado, nao so o recorte de uma consulta.
   */
  private dateOnly(value: string): Date {
    return new Date(`${value}T00:00:00.000Z`);
  }

}
