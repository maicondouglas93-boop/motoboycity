import { ForbiddenException, Injectable } from '@nestjs/common';
import type { DeliveryStatus, User } from '@prisma/client';
import type {
  CompanyOperationsReport,
  CompanyOperationsReportDayItem,
  CompanyOperationsReportServiceTypeItem,
} from '@motoboycity/types';
import type { CompanyOperationsReportQuery } from '@motoboycity/validation';
import {
  dateInSaoPaulo,
  endOfDayInSaoPaulo,
  saoPauloDateParts,
  startOfDayInSaoPaulo,
} from '../../common/sao-paulo-time';
import { PrismaService } from '../../prisma/prisma.service';
import { computePeakHoursFromCounts } from '../../admin/reports/delivery-peak-hours';
import { isLiveWindow, percentChange } from '../../admin/reports/report-window';

const DELIVERY_STATUSES: DeliveryStatus[] = [
  'SCHEDULED',
  'AWAITING_DRIVER',
  'ACCEPTED',
  'COLLECTED',
  'DELIVERED',
  'FAILED',
  'COMPLETED',
  'CANCELLED',
  'AWAITING_PAYMENT',
];

function toCents(value: unknown): number {
  return Math.round(Number(value ?? 0) * 100);
}

function fromCents(value: number): number {
  return value / 100;
}

function averageMoney(totalCents: number, count: number): number {
  return count > 0 ? Math.round(totalCents / count) / 100 : 0;
}

function dateRange(from: string, to: string): string[] {
  const [fromYear, fromMonth, fromDay] = from.split('-').map(Number);
  const cursor = new Date(Date.UTC(fromYear!, fromMonth! - 1, fromDay!));
  const last = Date.parse(`${to}T00:00:00.000Z`);
  const dates: string[] = [];
  while (cursor.getTime() <= last) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

@Injectable()
export class CompanyReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async operations(
    user: User,
    query: CompanyOperationsReportQuery,
  ): Promise<CompanyOperationsReport> {
    const companyId = await this.resolveCompanyId(user);
    const period = this.period(query.from, query.to);
    const duration = period.toExclusive.getTime() - period.from.getTime();
    const previous = {
      from: new Date(period.from.getTime() - duration),
      toExclusive: period.from,
    };

    const [previousCreatedCount, previousCompleted] = await Promise.all([
      this.prisma.delivery.count({
        where: {
          companyId,
          createdAt: { gte: previous.from, lt: previous.toExclusive },
        },
      }),
      this.prisma.delivery.aggregate({
        where: {
          companyId,
          status: 'COMPLETED',
          statusChangedAt: { gte: previous.from, lt: previous.toExclusive },
        },
        _count: { _all: true, totalValue: true },
        _sum: { totalValue: true },
      }),
    ]);

    const byCurrentStatus = Object.fromEntries(
      DELIVERY_STATUSES.map((status) => [status, 0]),
    ) as Record<DeliveryStatus, number>;
    const daily = new Map<string, CompanyOperationsReportDayItem>(
      dateRange(query.from, query.to).map((date) => [
        date,
        { date, createdCount: 0, completedCount: 0, completedTotalValue: 0 },
      ]),
    );
    const serviceTypes = new Map<string, CompanyOperationsReportServiceTypeItem>();

    const serviceTypeItem = (name: string): CompanyOperationsReportServiceTypeItem => {
      const current = serviceTypes.get(name);
      if (current) return current;
      const item: CompanyOperationsReportServiceTypeItem = {
        serviceTypeName: name,
        createdCount: 0,
        completedCount: 0,
        pricedCompletedCount: 0,
        unpricedCompletedCount: 0,
        completedTotalValue: 0,
        averageTicket: 0,
        createdWithReturnCount: 0,
        completedReturnValue: 0,
      };
      serviceTypes.set(name, item);
      return item;
    };

    let createdUnpricedCount = 0;
    let createdCount = 0;
    let createdWithReturnCount = 0;
    let batchDeliveryCount = 0;
    const batchIds = new Set<string>();
    const hourCounts = new Array<number>(24).fill(0);
    const weekdayCounts = new Array<number>(7).fill(0);

    for await (const created of this.createdDeliveryPages(companyId, period)) {
      for (const delivery of created) {
        createdCount += 1;
        byCurrentStatus[delivery.status] += 1;
        if (delivery.totalValue === null) createdUnpricedCount += 1;
        if (delivery.requiresReturn) createdWithReturnCount += 1;
        if (delivery.batchId) {
          batchDeliveryCount += 1;
          batchIds.add(delivery.batchId);
        }
        const parts = saoPauloDateParts(delivery.createdAt);
        hourCounts[parts.hour]! += 1;
        weekdayCounts[parts.weekday]! += 1;
        const day = daily.get(dateInSaoPaulo(delivery.createdAt));
        if (day) day.createdCount += 1;
        const serviceType = serviceTypeItem(delivery.serviceType.name);
        serviceType.createdCount += 1;
        if (delivery.requiresReturn) serviceType.createdWithReturnCount += 1;
      }
    }

    let completedTotalCents = 0;
    let completedCount = 0;
    let completedPricedCount = 0;
    let completedWithReturnCount = 0;
    let completedReturnCents = 0;

    for await (const completed of this.completedDeliveryPages(companyId, period)) {
      for (const delivery of completed) {
        completedCount += 1;
        const priced = delivery.totalValue !== null;
        const totalCents = toCents(delivery.totalValue);
        const returnCents = toCents(delivery.returnValue);
        completedTotalCents += totalCents;
        if (priced) completedPricedCount += 1;
        if (delivery.requiresReturn) completedWithReturnCount += 1;
        completedReturnCents += returnCents;

        const day = daily.get(dateInSaoPaulo(delivery.statusChangedAt));
        if (day) {
          day.completedCount += 1;
          day.completedTotalValue = fromCents(toCents(day.completedTotalValue) + totalCents);
        }

        const serviceType = serviceTypeItem(delivery.serviceType.name);
        serviceType.completedCount += 1;
        serviceType.completedTotalValue = fromCents(
          toCents(serviceType.completedTotalValue) + totalCents,
        );
        serviceType.completedReturnValue = fromCents(
          toCents(serviceType.completedReturnValue) + returnCents,
        );
        if (priced) serviceType.pricedCompletedCount += 1;
        else serviceType.unpricedCompletedCount += 1;
      }
    }

    const completedTotalValue = fromCents(completedTotalCents);
    const averageTicket = averageMoney(completedTotalCents, completedPricedCount);
    const previousTotalCents = toCents(previousCompleted._sum.totalValue);
    const previousPricedCount = previousCompleted._count.totalValue;
    const previousTotalValue = fromCents(previousTotalCents);
    const previousAverageTicket = averageMoney(previousTotalCents, previousPricedCount);
    const inclusiveTo = new Date(period.toExclusive.getTime() - 1);

    return {
      period: { from: query.from, to: query.to },
      live: isLiveWindow({ from: period.from, to: inclusiveTo }, new Date()),
      comparison: {
        period: {
          from: dateInSaoPaulo(previous.from),
          to: dateInSaoPaulo(new Date(previous.toExclusive.getTime() - 1)),
        },
        ordersCreatedCount: previousCreatedCount,
        deliveriesCompletedCount: previousCompleted._count._all,
        completedTotalValue: previousTotalValue,
        averageTicket: previousAverageTicket,
        changePercent: {
          ordersCreated: percentChange(createdCount, previousCreatedCount),
          deliveriesCompleted: percentChange(
            completedCount,
            previousCompleted._count._all,
          ),
          completedTotalValue: percentChange(completedTotalValue, previousTotalValue),
          averageTicket: percentChange(averageTicket, previousAverageTicket),
        },
      },
      ordersCreated: {
        count: createdCount,
        unpricedCount: createdUnpricedCount,
        byCurrentStatus,
      },
      deliveriesCompleted: {
        count: completedCount,
        pricedCount: completedPricedCount,
        unpricedCount: completedCount - completedPricedCount,
        totalValue: completedTotalValue,
        averageTicket,
      },
      daily: [...daily.values()],
      peakHours: computePeakHoursFromCounts(
        hourCounts,
        weekdayCounts,
        { from: period.from, to: inclusiveTo },
      ),
      serviceTypes: [...serviceTypes.values()]
        .map((item) => ({
          ...item,
          averageTicket: averageMoney(
            toCents(item.completedTotalValue),
            item.pricedCompletedCount,
          ),
        }))
        .sort(
          (left, right) =>
            right.completedTotalValue - left.completedTotalValue ||
            right.createdCount - left.createdCount ||
            left.serviceTypeName.localeCompare(right.serviceTypeName),
        ),
      returns: {
        createdCount: createdWithReturnCount,
        completedCount: completedWithReturnCount,
        completedReturnValue: fromCents(completedReturnCents),
      },
      batches: {
        batchCount: batchIds.size,
        deliveryCount: batchDeliveryCount,
      },
    };
  }

  private async *createdDeliveryPages(
    companyId: string,
    period: { from: Date; toExclusive: Date },
  ) {
    let cursor: string | undefined;
    do {
      const deliveries = await this.prisma.delivery.findMany({
        where: {
          companyId,
          createdAt: { gte: period.from, lt: period.toExclusive },
        },
        select: {
          id: true,
          status: true,
          createdAt: true,
          totalValue: true,
          requiresReturn: true,
          batchId: true,
          serviceType: { select: { name: true } },
        },
        orderBy: { id: 'asc' },
        take: 500,
        ...(cursor && { cursor: { id: cursor }, skip: 1 }),
      });
      yield deliveries;
      if (deliveries.length < 500) break;
      cursor = deliveries.at(-1)?.id;
    } while (cursor);
  }

  private async *completedDeliveryPages(
    companyId: string,
    period: { from: Date; toExclusive: Date },
  ) {
    let cursor: string | undefined;
    do {
      const deliveries = await this.prisma.delivery.findMany({
        where: {
          companyId,
          status: 'COMPLETED',
          statusChangedAt: { gte: period.from, lt: period.toExclusive },
        },
        select: {
          id: true,
          statusChangedAt: true,
          totalValue: true,
          requiresReturn: true,
          returnValue: true,
          serviceType: { select: { name: true } },
        },
        orderBy: { id: 'asc' },
        take: 500,
        ...(cursor && { cursor: { id: cursor }, skip: 1 }),
      });
      yield deliveries;
      if (deliveries.length < 500) break;
      cursor = deliveries.at(-1)?.id;
    } while (cursor);
  }

  private period(from: string, to: string): { from: Date; toExclusive: Date } {
    return {
      from: startOfDayInSaoPaulo(from),
      toExclusive: new Date(endOfDayInSaoPaulo(to).getTime() + 1),
    };
  }

  private async resolveCompanyId(user: User): Promise<string> {
    if (user.type !== 'COMPANY_MEMBER') {
      throw new ForbiddenException('Acesso restrito a empresas.');
    }
    const membership = await this.prisma.companyTeamMember.findFirst({
      where: { userId: user.id, active: true },
      select: { companyId: true },
    });
    if (!membership) {
      throw new ForbiddenException('Usuário não está vinculado a uma empresa.');
    }
    return membership.companyId;
  }
}
