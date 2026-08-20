import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  CloseInvoicesPayload,
  ListInvoicesQuery,
  MarkInvoicePaidPayload,
} from '@motoboycity/validation';
import type { User } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { FinancialClock } from './financial-clock.service';
import {
  dateInSaoPaulo,
  invoiceClosingCutoff,
  latestInvoiceClosingDateInSaoPaulo,
} from './finance-release.utils';

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

function numberOrZero(value: { toString(): string } | null): number {
  return value === null ? 0 : Number(value);
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
            totalValue: companyDeliveries.reduce(
              (sum, delivery) => sum + numberOrZero(delivery.totalValue),
              0,
            ),
            driverValueSum: companyDeliveries.reduce(
              (sum, delivery) => sum + numberOrZero(delivery.driverValue),
              0,
            ),
            platformValueSum: companyDeliveries.reduce(
              (sum, delivery) => sum + numberOrZero(delivery.platformValue),
              0,
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
    await this.prisma.$transaction(async (tx) => {
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
    });

    return this.getDetail(invoiceId);
  }

  async listForAdmin(query: ListInvoicesQuery): Promise<InvoiceListItem[]> {
    await this.refreshOverdueInvoices();
    return this.list(query, query.companyId);
  }

  async listForCompany(user: User, query: ListInvoicesQuery): Promise<InvoiceListItem[]> {
    await this.refreshOverdueInvoices();
    return this.list(query, await this.resolveCompanyId(user));
  }

  async detailForAdmin(invoiceId: string): Promise<InvoiceDetail> {
    await this.refreshOverdueInvoices();
    return this.getDetail(invoiceId);
  }

  async detailForCompany(user: User, invoiceId: string): Promise<InvoiceDetail> {
    await this.refreshOverdueInvoices();
    const companyId = await this.resolveCompanyId(user);
    const invoice = await this.prisma.invoice.findUnique({ where: { id: invoiceId } });
    if (!invoice) throw new NotFoundException('Fatura não encontrada.');
    if (invoice.companyId !== companyId)
      throw new ForbiddenException('Você não tem acesso a esta fatura.');
    return this.getDetail(invoiceId);
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
                ...(query.to && { lte: this.endOfDay(query.to) }),
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
      issueDate: invoice.issueDate.toISOString(),
      dueDate: invoice.dueDate.toISOString(),
      paymentDate: invoice.paymentDate?.toISOString() ?? null,
      paymentMethod: invoice.paymentMethod,
      status: invoice.status,
      totalValue: Number(invoice.totalValue),
      driverValueSum: Number(invoice.driverValueSum),
      platformValueSum: Number(invoice.platformValueSum),
      deliveryCount: invoice._count.deliveries,
    };
  }

  private async refreshOverdueInvoices(): Promise<void> {
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
      where: { userId: user.id },
    });
    if (!membership) throw new ForbiddenException('Usuário não está vinculado a uma empresa.');
    return membership.companyId;
  }

  private invoiceNumber(issueDate: string): string {
    return `FAT-${issueDate.replaceAll('-', '')}-${randomUUID().slice(0, 8).toUpperCase()}`;
  }

  private dateOnly(value: string): Date {
    return new Date(`${value}T00:00:00.000Z`);
  }

  private endOfDay(value: string): Date {
    return new Date(`${value}T23:59:59.999Z`);
  }
}
