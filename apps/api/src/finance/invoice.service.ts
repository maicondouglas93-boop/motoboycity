import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type {
  CloseInvoicesPayload,
  ListInvoicesQuery,
  CancelInvoicePayload,
  ManualInvoiceEligibleQuery,
  ManualInvoicePayload,
  MarkInvoicePaidPayload,
  UpdateInvoiceDueDatePayload,
} from '@motoboycity/validation';
import { Prisma, type User } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { FinancialClock } from './financial-clock.service';
import {
  dateInSaoPaulo,
  invoiceClosingCutoff,
  latestInvoiceClosingDateForPolicyInSaoPaulo,
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

export interface ManualInvoiceCandidate {
  id: string;
  displayNumber: number;
  externalOrderNumber: string | null;
  completedAt: string;
  serviceTypeName: string;
  totalValue: number;
  driverValue: number;
  platformValue: number;
}

export interface ManualInvoicePreview {
  company: { id: string; tradeName: string; document: string };
  issueDate: string;
  dueDate: string;
  deliveryCount: number;
  totalValue: number;
  driverValueSum: number;
  platformValueSum: number;
  deliveries: ManualInvoiceCandidate[];
}

interface ManualInvoiceDeliveryRow {
  id: string;
  displayNumber: number;
  externalOrderNumber: string | null;
  statusChangedAt: Date;
  totalValue: { toString(): string } | null;
  driverValue: { toString(): string } | null;
  platformValue: { toString(): string } | null;
  serviceType: { name: string };
}

interface CompanyInvoicePolicy {
  id: string;
  invoiceClosingMode: 'AUTOMATIC' | 'MANUAL';
  invoiceClosingFrequency: 'WEEKLY' | 'MONTHLY' | null;
  invoiceClosingWeekday: number | null;
  invoiceClosingMonthDay: number | null;
  lastAutomaticInvoiceClosingDate: Date | null;
}

export interface BillingAutomationResult {
  invoices: InvoiceListItem[];
  blockedCompanyIds: string[];
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

export type CompanyInvoiceListItem = Omit<InvoiceListItem, 'driverValueSum' | 'platformValueSum'>;

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
    ) / 100
  );
}

@Injectable()
export class InvoiceService {
  private readonly logger = new Logger(InvoiceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: FinancialClock,
    private readonly realtimeGateway: RealtimeGateway,
  ) {}

  async closeOpenInvoices(admin: User, payload: CloseInvoicesPayload): Promise<InvoiceListItem> {
    const now = this.clock.now();
    const invoice = await this.closeCompanyInvoice({
      companyId: payload.companyId,
      issueDate: dateInSaoPaulo(now),
      cutoff: now,
      changedByUserId: admin.id,
      automatic: false,
    });
    if (!invoice) {
      throw new ConflictException(
        'A empresa nao possui pedidos concluidos e faturaveis para fechar agora.',
      );
    }
    return invoice;
  }

  async closeScheduledInvoices(now = this.clock.now()): Promise<InvoiceListItem[]> {
    const companies = await this.prisma.company.findMany({
      where: { invoiceClosingMode: 'AUTOMATIC' },
      select: {
        id: true,
        invoiceClosingMode: true,
        invoiceClosingFrequency: true,
        invoiceClosingWeekday: true,
        invoiceClosingMonthDay: true,
        lastAutomaticInvoiceClosingDate: true,
      },
    });

    const invoices: InvoiceListItem[] = [];
    for (const company of companies) {
      const issueDate = latestInvoiceClosingDateForPolicyInSaoPaulo(now, company);
      if (!issueDate) continue;
      const lastClosingDate = company.lastAutomaticInvoiceClosingDate
        ? civilDateFromDbDate(company.lastAutomaticInvoiceClosingDate)
        : null;
      if (lastClosingDate && lastClosingDate >= issueDate) continue;

      const invoice = await this.closeCompanyInvoice({
        companyId: company.id,
        issueDate,
        cutoff: invoiceClosingCutoff(issueDate),
        changedByUserId: null,
        automatic: true,
        policy: company,
      });
      if (invoice) invoices.push(invoice);
    }
    return invoices;
  }

  async processScheduledBilling(now = this.clock.now()): Promise<BillingAutomationResult> {
    const invoices = await this.closeScheduledInvoices(now);
    await this.refreshOverdueInvoices(now);
    const blockedCompanyIds = await this.blockOverdueCompanies(now);
    return { invoices, blockedCompanyIds };
  }

  async listManualCandidates(query: ManualInvoiceEligibleQuery): Promise<ManualInvoiceCandidate[]> {
    const company = await this.prisma.company.findUnique({
      where: { id: query.companyId },
      select: { id: true },
    });
    if (!company) throw new NotFoundException('Empresa nao encontrada.');

    const deliveries = await this.prisma.delivery.findMany({
      where: this.manualInvoiceEligibility(query.companyId),
      select: this.manualInvoiceDeliverySelect(),
      orderBy: [{ statusChangedAt: 'asc' }, { displayNumber: 'asc' }],
    });

    return deliveries.map((delivery) => this.toManualInvoiceCandidate(delivery));
  }

  async previewManualInvoice(payload: ManualInvoicePayload): Promise<ManualInvoicePreview> {
    this.assertManualInvoiceDates(payload);
    const selection = await this.loadManualInvoiceSelection(this.prisma, payload);
    return this.toManualInvoicePreview(payload, selection.company, selection.deliveries);
  }

  async createManualInvoice(admin: User, payload: ManualInvoicePayload): Promise<InvoiceDetail> {
    this.assertManualInvoiceDates(payload);

    const invoiceId = await this.prisma.$transaction(
      async (tx) => {
        const selection = await this.loadManualInvoiceSelection(tx, payload);
        const totals = this.manualInvoiceTotals(selection.deliveries);
        const invoice = await tx.invoice.create({
          data: {
            companyId: payload.companyId,
            number: this.invoiceNumber(payload.issueDate),
            issueDate: this.dateOnly(payload.issueDate),
            dueDate: this.dateOnly(payload.dueDate),
            totalValue: totals.totalValue,
            driverValueSum: totals.driverValueSum,
            platformValueSum: totals.platformValueSum,
          },
        });

        const linked = await tx.delivery.updateMany({
          where: {
            ...this.manualInvoiceEligibility(payload.companyId),
            id: { in: payload.deliveryIds },
          },
          data: { invoiceId: invoice.id },
        });
        if (linked.count !== payload.deliveryIds.length) {
          throw new ConflictException(
            'Um ou mais pedidos deixaram de estar disponiveis para faturamento. Atualize a selecao e tente novamente.',
          );
        }

        await tx.invoiceStatusHistory.create({
          data: {
            invoiceId: invoice.id,
            fromStatus: null,
            toStatus: 'PENDING',
            changedByUserId: admin.id,
            note: `Fatura personalizada de ${payload.deliveryIds.length} pedido(s), selecionados pelo administrador.`,
          },
        });
        return invoice.id;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    return this.getDetail(invoiceId);
  }

  private async closeCompanyInvoice(input: {
    companyId: string;
    issueDate: string;
    cutoff: Date;
    changedByUserId: string | null;
    automatic: boolean;
    policy?: CompanyInvoicePolicy;
  }): Promise<InvoiceListItem | null> {
    const issueDate = this.dateOnly(input.issueDate);

    /**
     * A fatura vence NO DIA em que e emitida. E regra do negocio, nao descuido.
     *
     * O ciclo cabe no dia configurado: o corte roda 00:05, a fatura nasce com
     * vencimento no mesmo dia, e a loja paga ao longo do expediente. Como o
     * `refreshOverdueInvoices` compara com `dueDate < hoje`, ela so vira
     * OVERDUE no dia seguinte — ou seja, um dia civil cheio para pagar.
     *
     * Se algum dia existir prazo, ele vira configuracao e passa por aqui. Ate
     * la, isto NAO e um `dueDate` esquecido esperando conserto.
     */
    const dueDate = issueDate;
    const invoiceId = await this.serializableTransaction(async (tx) => {
      if (input.automatic) {
        const policy = input.policy;
        if (!policy) throw new Error('Politica automatica ausente no fechamento.');
        const reserved = await tx.company.updateMany({
          where: {
            id: input.companyId,
            invoiceClosingMode: 'AUTOMATIC',
            invoiceClosingFrequency: policy.invoiceClosingFrequency,
            invoiceClosingWeekday: policy.invoiceClosingWeekday,
            invoiceClosingMonthDay: policy.invoiceClosingMonthDay,
            OR: [
              { lastAutomaticInvoiceClosingDate: null },
              { lastAutomaticInvoiceClosingDate: { lt: issueDate } },
            ],
          },
          data: { lastAutomaticInvoiceClosingDate: issueDate },
        });
        if (reserved.count !== 1) return null;
      } else {
        const manualCompany = await tx.company.findFirst({
          where: { id: input.companyId, invoiceClosingMode: 'MANUAL' },
          select: { id: true },
        });
        if (!manualCompany) {
          throw new ConflictException(
            'O fechamento avulso so pode ser usado em uma empresa configurada como manual.',
          );
        }
      }

      const deliveries = await tx.delivery.findMany({
        where: {
          companyId: input.companyId,
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
          totalValue: true,
          driverValue: true,
          platformValue: true,
        },
      });

      if (deliveries.length === 0) return null;

      const invoice = await tx.invoice.create({
        data: {
          companyId: input.companyId,
          number: this.invoiceNumber(input.issueDate),
          issueDate,
          dueDate,
          totalValue: sumMoney(deliveries.map((delivery) => delivery.totalValue)),
          driverValueSum: sumMoney(deliveries.map((delivery) => delivery.driverValue)),
          platformValueSum: sumMoney(deliveries.map((delivery) => delivery.platformValue)),
        },
      });

      const linked = await tx.delivery.updateMany({
        where: {
          id: { in: deliveries.map((delivery) => delivery.id) },
          companyId: input.companyId,
          status: 'COMPLETED',
          paymentMethod: 'BILLED',
          invoiceId: null,
        },
        data: { invoiceId: invoice.id },
      });
      if (linked.count !== deliveries.length) {
        throw new ConflictException(
          'Um ou mais pedidos ja foram faturados em outra solicitacao. Atualize a lista e tente novamente.',
        );
      }

      const periodicity =
        input.policy?.invoiceClosingFrequency === 'MONTHLY' ? 'mensal' : 'semanal';
      await tx.invoiceStatusHistory.create({
        data: {
          invoiceId: invoice.id,
          fromStatus: null,
          toStatus: 'PENDING',
          changedByUserId: input.changedByUserId,
          note: input.automatic
            ? `Fechamento automatico ${periodicity} de ${deliveries.length} pedido(s).`
            : `Fechamento financeiro manual de ${deliveries.length} pedido(s).`,
        },
      });
      return invoice.id;
    });

    return invoiceId ? this.getListItem(invoiceId) : null;
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

  async updateDueDate(
    admin: User,
    invoiceId: string,
    payload: UpdateInvoiceDueDatePayload,
  ): Promise<InvoiceDetail> {
    await this.prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.findUnique({
        where: { id: invoiceId },
        select: { status: true, issueDate: true, dueDate: true },
      });
      if (!invoice) throw new NotFoundException('Fatura nao encontrada.');
      if (invoice.status === 'PAID') {
        throw new ConflictException('O vencimento de uma fatura paga nao pode ser alterado.');
      }
      if (invoice.status === 'CANCELLED') {
        throw new ConflictException('O vencimento de uma fatura cancelada nao pode ser alterado.');
      }

      const dueDate = this.dateOnly(payload.dueDate);
      if (dueDate.getTime() < invoice.issueDate.getTime()) {
        throw new ConflictException('O vencimento nao pode ser anterior a emissao.');
      }
      if (dueDate.getTime() === invoice.dueDate.getTime()) {
        throw new ConflictException('Informe uma data diferente do vencimento atual.');
      }

      const today = this.dateOnly(dateInSaoPaulo(this.clock.now()));
      const nextStatus: 'PENDING' | 'OVERDUE' =
        dueDate.getTime() < today.getTime() ? 'OVERDUE' : 'PENDING';
      const updated = await tx.invoice.updateMany({
        where: {
          id: invoiceId,
          status: invoice.status,
          dueDate: invoice.dueDate,
        },
        data: { dueDate, status: nextStatus },
      });
      if (updated.count !== 1) {
        throw new ConflictException(
          'A fatura foi alterada por outra tela. Atualize os dados e tente novamente.',
        );
      }

      await tx.invoiceStatusHistory.create({
        data: {
          invoiceId,
          fromStatus: invoice.status,
          toStatus: nextStatus,
          changedByUserId: admin.id,
          note: `Vencimento alterado de ${civilDateFromDbDate(invoice.dueDate)} para ${payload.dueDate}. Motivo: ${payload.reason.trim()}`,
        },
      });
    });

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
  async refreshOverdueInvoices(referenceTime = this.clock.now()): Promise<void> {
    const now = this.dateOnly(dateInSaoPaulo(referenceTime));
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
              note: 'Vencimento ultrapassado; atualização automática da rotina financeira.',
            },
          });
        }
      }
    });
  }

  private async blockOverdueCompanies(now: Date): Promise<string[]> {
    const candidates = await this.prisma.company.findMany({
      where: { status: 'ACTIVE', invoiceOverdueBlockAfterDays: { not: null } },
      select: {
        id: true,
        invoiceOverdueBlockAfterDays: true,
        teamMembers: { where: { active: true }, select: { userId: true } },
      },
    });

    const blockedCompanyIds: string[] = [];
    const today = dateInSaoPaulo(now);
    for (const company of candidates) {
      const blockAfterDays = company.invoiceOverdueBlockAfterDays;
      if (blockAfterDays === null) continue;
      const overdueCutoff = this.shiftCivilDate(today, -blockAfterDays);

      const blocked = await this.serializableTransaction(async (tx) => {
        const updated = await tx.company.updateMany({
          where: {
            id: company.id,
            status: 'ACTIVE',
            invoiceOverdueBlockAfterDays: blockAfterDays,
            invoices: {
              some: {
                status: 'OVERDUE',
                dueDate: { lte: overdueCutoff },
              },
            },
          },
          data: { status: 'SUSPENDED', invoiceOverdueBlockedAt: now },
        });
        if (updated.count !== 1) return false;

        await tx.companyStatusHistory.create({
          data: {
            companyId: company.id,
            fromStatus: 'ACTIVE',
            toStatus: 'SUSPENDED',
            changedByUserId: null,
            note: `Bloqueio automatico por fatura vencida ha pelo menos ${blockAfterDays} dia(s).`,
          },
        });
        return true;
      });

      if (!blocked) continue;
      blockedCompanyIds.push(company.id);
      for (const member of company.teamMembers) {
        this.realtimeGateway.disconnectUser(member.userId);
      }
      this.logger.warn(`Empresa ${company.id} suspensa automaticamente por inadimplencia.`);
    }

    return blockedCompanyIds;
  }

  private async serializableTransaction<T>(
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        return await this.prisma.$transaction(operation, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error) {
        const code =
          typeof error === 'object' && error !== null && 'code' in error
            ? String((error as { code: unknown }).code)
            : null;
        if (code !== 'P2034' || attempt === 3) throw error;
      }
    }
    throw new Error('Transacao serializavel esgotou as tentativas.');
  }

  private shiftCivilDate(value: string, days: number): Date {
    const [year = 0, month = 1, day = 1] = value.split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, day + days));
  }

  private async resolveCompanyId(user: User): Promise<string> {
    if (user.type !== 'COMPANY_MEMBER') throw new ForbiddenException('Acesso restrito a empresas.');
    const membership = await this.prisma.companyTeamMember.findFirst({
      where: { userId: user.id, active: true },
    });
    if (!membership) throw new ForbiddenException('Usuário não está vinculado a uma empresa.');
    return membership.companyId;
  }

  private manualInvoiceEligibility(companyId: string): Prisma.DeliveryWhereInput {
    return {
      companyId,
      status: 'COMPLETED',
      paymentMethod: 'BILLED',
      invoiceId: null,
      totalValue: { not: null },
      driverValue: { not: null },
      platformValue: { not: null },
    };
  }

  private manualInvoiceDeliverySelect() {
    return {
      id: true,
      displayNumber: true,
      externalOrderNumber: true,
      statusChangedAt: true,
      totalValue: true,
      driverValue: true,
      platformValue: true,
      serviceType: { select: { name: true } },
    } as const;
  }

  private async loadManualInvoiceSelection(
    client: Pick<Prisma.TransactionClient, 'company' | 'delivery'>,
    payload: ManualInvoicePayload,
  ) {
    const company = await client.company.findUnique({
      where: { id: payload.companyId },
      select: { id: true, tradeName: true, document: true },
    });
    if (!company) throw new NotFoundException('Empresa nao encontrada.');

    const deliveries = await client.delivery.findMany({
      where: {
        ...this.manualInvoiceEligibility(payload.companyId),
        id: { in: payload.deliveryIds },
      },
      select: this.manualInvoiceDeliverySelect(),
      orderBy: [{ statusChangedAt: 'asc' }, { displayNumber: 'asc' }],
    });
    if (deliveries.length !== payload.deliveryIds.length) {
      throw new ConflictException(
        'Um ou mais pedidos selecionados nao estao concluidos, sao cobrados online ou ja pertencem a outra fatura.',
      );
    }

    return { company, deliveries };
  }

  private toManualInvoiceCandidate(delivery: ManualInvoiceDeliveryRow): ManualInvoiceCandidate {
    return {
      id: delivery.id,
      displayNumber: delivery.displayNumber,
      externalOrderNumber: delivery.externalOrderNumber,
      completedAt: delivery.statusChangedAt.toISOString(),
      serviceTypeName: delivery.serviceType.name,
      totalValue: numberOrZero(delivery.totalValue),
      driverValue: numberOrZero(delivery.driverValue),
      platformValue: numberOrZero(delivery.platformValue),
    };
  }

  private manualInvoiceTotals(
    deliveries: ReadonlyArray<{
      totalValue: { toString(): string } | null;
      driverValue: { toString(): string } | null;
      platformValue: { toString(): string } | null;
    }>,
  ) {
    return {
      totalValue: sumMoney(deliveries.map((delivery) => delivery.totalValue)),
      driverValueSum: sumMoney(deliveries.map((delivery) => delivery.driverValue)),
      platformValueSum: sumMoney(deliveries.map((delivery) => delivery.platformValue)),
    };
  }

  private toManualInvoicePreview(
    payload: ManualInvoicePayload,
    company: { id: string; tradeName: string; document: string },
    deliveries: ReadonlyArray<ManualInvoiceDeliveryRow>,
  ): ManualInvoicePreview {
    const totals = this.manualInvoiceTotals(deliveries);
    return {
      company,
      issueDate: payload.issueDate,
      dueDate: payload.dueDate,
      deliveryCount: deliveries.length,
      ...totals,
      deliveries: deliveries.map((delivery) => this.toManualInvoiceCandidate(delivery)),
    };
  }

  private assertManualInvoiceDates(payload: ManualInvoicePayload): void {
    if (payload.deliveryIds.length === 0) {
      throw new ConflictException('Selecione pelo menos um pedido para faturar.');
    }
    if (new Set(payload.deliveryIds).size !== payload.deliveryIds.length) {
      throw new ConflictException('A selecao possui pedidos repetidos.');
    }
    if (payload.dueDate < payload.issueDate) {
      throw new ConflictException('O vencimento nao pode ser anterior a emissao.');
    }
    const today = dateInSaoPaulo(this.clock.now());
    if (payload.issueDate > today) {
      throw new ConflictException('A data de emissao nao pode estar no futuro.');
    }
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
