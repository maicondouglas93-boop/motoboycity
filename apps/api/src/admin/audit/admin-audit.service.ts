import { Injectable } from '@nestjs/common';
import type { AdministrativeAuditEvent } from '@motoboycity/types';
import type { AdministrativeAuditQuery } from '@motoboycity/validation';
import { Prisma } from '@prisma/client';
import { endOfDayInSaoPaulo, startOfDayInSaoPaulo } from '../../common/sao-paulo-time';
import { PrismaService } from '../../prisma/prisma.service';

export interface RecordAdministrativeAuditInput {
  actorUserId: string;
  action: string;
  entityType: string;
  entityId: string;
  summary: string;
  metadata?: Prisma.InputJsonValue;
}

@Injectable()
export class AdminAuditService {
  constructor(private readonly prisma: PrismaService) {}

  record(input: RecordAdministrativeAuditInput, tx: Prisma.TransactionClient = this.prisma) {
    return tx.administrativeAudit.create({ data: input });
  }

  async list(query: AdministrativeAuditQuery): Promise<AdministrativeAuditEvent[]> {
    const createdAt = {
      ...(query.from && { gte: startOfDayInSaoPaulo(query.from) }),
      ...(query.to && { lte: endOfDayInSaoPaulo(query.to) }),
      ...(query.before && { lt: new Date(query.before) }),
    };
    const sourceLimit = query.limit * 2;
    const includeGeneric = !query.entityType || !['DELIVERY', 'INVOICE'].includes(query.entityType);
    const includeDeliveries = !query.entityType || query.entityType === 'DELIVERY';
    const includeInvoices = !query.entityType || query.entityType === 'INVOICE';

    const [generic, deliveries, invoices] = await Promise.all([
      includeGeneric
        ? this.prisma.administrativeAudit.findMany({
            where: {
              createdAt,
              ...(query.entityType && { entityType: query.entityType }),
            },
            orderBy: { createdAt: 'desc' },
            take: sourceLimit,
            include: { actor: { select: { id: true, name: true } } },
          })
        : Promise.resolve([]),
      includeDeliveries
        ? this.prisma.deliveryStatusHistory.findMany({
            where: { changedAt: createdAt, changedByUser: { type: 'ADMIN' } },
            orderBy: { changedAt: 'desc' },
            take: sourceLimit,
            include: {
              changedByUser: { select: { id: true, name: true } },
              delivery: {
                select: {
                  id: true,
                  displayNumber: true,
                  company: { select: { tradeName: true } },
                },
              },
            },
          })
        : Promise.resolve([]),
      includeInvoices
        ? this.prisma.invoiceStatusHistory.findMany({
            where: { changedAt: createdAt, changedByUser: { type: 'ADMIN' } },
            orderBy: { changedAt: 'desc' },
            take: sourceLimit,
            include: {
              changedByUser: { select: { id: true, name: true } },
              invoice: {
                select: { id: true, company: { select: { tradeName: true } } },
              },
            },
          })
        : Promise.resolve([]),
    ]);

    const events: AdministrativeAuditEvent[] = [
      ...generic.map((item) => ({
        id: `admin:${item.id}`,
        source: 'ADMIN' as const,
        action: item.action,
        entityType: item.entityType,
        entityId: item.entityId,
        summary: item.summary,
        actor: item.actor,
        createdAt: item.createdAt.toISOString(),
      })),
      ...deliveries.flatMap((item) =>
        item.changedByUser
          ? [
              {
                id: `delivery:${item.id}`,
                source: 'DELIVERY_HISTORY' as const,
                action: 'DELIVERY_STATUS_CHANGED',
                entityType: 'DELIVERY',
                entityId: item.deliveryId,
                summary:
                  item.note ??
                  `Pedido #${item.delivery.displayNumber} da empresa ${item.delivery.company.tradeName}: ${item.fromStatus ?? 'CRIADO'} -> ${item.toStatus}.`,
                actor: item.changedByUser,
                createdAt: item.changedAt.toISOString(),
              },
            ]
          : [],
      ),
      ...invoices.flatMap((item) =>
        item.changedByUser
          ? [
              {
                id: `invoice:${item.id}`,
                source: 'INVOICE_HISTORY' as const,
                action: 'INVOICE_STATUS_CHANGED',
                entityType: 'INVOICE',
                entityId: item.invoiceId,
                summary:
                  item.note ??
                  `Fatura da empresa ${item.invoice.company.tradeName}: ${item.fromStatus ?? 'CRIADA'} -> ${item.toStatus}.`,
                actor: item.changedByUser,
                createdAt: item.changedAt.toISOString(),
              },
            ]
          : [],
      ),
    ];

    const search = query.search?.toLocaleLowerCase('pt-BR');
    return events
      .filter((event) =>
        search
          ? `${event.summary} ${event.actor.name} ${event.action} ${event.entityId}`
              .toLocaleLowerCase('pt-BR')
              .includes(search)
          : true,
      )
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, query.limit);
  }
}
