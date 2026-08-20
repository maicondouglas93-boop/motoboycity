import { Injectable } from '@nestjs/common';
import type { OperationsReportQuery } from '@motoboycity/validation';
import type { DeliveryStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

const deliveryStatuses: DeliveryStatus[] = [
  'SCHEDULED',
  'AWAITING_DRIVER',
  'ACCEPTED',
  'COLLECTED',
  'DELIVERED',
  'COMPLETED',
  'CANCELLED',
  'AWAITING_PAYMENT',
];

export interface OperationsReportCompanyItem {
  companyId: string;
  companyName: string;
  createdCount: number;
  completedCount: number;
  cancelledCount: number;
  completedTotalValue: number;
  platformValue: number;
}

export interface OperationsReportDriverItem {
  driverId: string;
  driverName: string;
  driverEmail: string;
  completedCount: number;
  driverValue: number;
}

export interface OperationsReportServiceTypeItem {
  serviceTypeName: string;
  createdCount: number;
  completedCount: number;
  completedTotalValue: number;
}

export interface AdminOperationsReport {
  period: { from: string; to: string };
  ordersCreated: {
    count: number;
    byCurrentStatus: Record<DeliveryStatus, number>;
  };
  deliveriesCompleted: {
    count: number;
    totalValue: number;
    driverValue: number;
    platformValue: number;
    averageTicket: number;
  };
  companies: OperationsReportCompanyItem[];
  drivers: OperationsReportDriverItem[];
  serviceTypes: OperationsReportServiceTypeItem[];
}

function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

@Injectable()
export class AdminReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async operations(query: OperationsReportQuery): Promise<AdminOperationsReport> {
    const period = this.resolvePeriod(query);
    const [createdDeliveries, completedDeliveries] = await Promise.all([
      this.prisma.delivery.findMany({
        where: { createdAt: { gte: period.from, lte: period.to } },
        select: {
          status: true,
          company: { select: { id: true, tradeName: true } },
          serviceType: { select: { name: true } },
        },
      }),
      this.prisma.delivery.findMany({
        where: { status: 'COMPLETED', statusChangedAt: { gte: period.from, lte: period.to } },
        select: {
          totalValue: true,
          driverValue: true,
          platformValue: true,
          company: { select: { id: true, tradeName: true } },
          serviceType: { select: { name: true } },
          driver: { include: { user: { select: { name: true, email: true } } } },
        },
      }),
    ]);

    const byCurrentStatus = Object.fromEntries(
      deliveryStatuses.map((status) => [status, 0]),
    ) as Record<DeliveryStatus, number>;
    const companies = new Map<string, OperationsReportCompanyItem>();
    const drivers = new Map<string, OperationsReportDriverItem>();
    const serviceTypes = new Map<string, OperationsReportServiceTypeItem>();

    const companyItem = (company: { id: string; tradeName: string }) => {
      const current = companies.get(company.id);
      if (current) return current;
      const next: OperationsReportCompanyItem = {
        companyId: company.id,
        companyName: company.tradeName,
        createdCount: 0,
        completedCount: 0,
        cancelledCount: 0,
        completedTotalValue: 0,
        platformValue: 0,
      };
      companies.set(company.id, next);
      return next;
    };

    const serviceTypeItem = (serviceTypeName: string) => {
      const current = serviceTypes.get(serviceTypeName);
      if (current) return current;
      const next: OperationsReportServiceTypeItem = {
        serviceTypeName,
        createdCount: 0,
        completedCount: 0,
        completedTotalValue: 0,
      };
      serviceTypes.set(serviceTypeName, next);
      return next;
    };

    for (const delivery of createdDeliveries) {
      byCurrentStatus[delivery.status] += 1;
      const company = companyItem(delivery.company);
      company.createdCount += 1;
      if (delivery.status === 'CANCELLED') company.cancelledCount += 1;
      serviceTypeItem(delivery.serviceType.name).createdCount += 1;
    }

    let totalValue = 0;
    let driverValue = 0;
    let platformValue = 0;
    for (const delivery of completedDeliveries) {
      const deliveryTotalValue = Number(delivery.totalValue ?? 0);
      const deliveryDriverValue = Number(delivery.driverValue ?? 0);
      const deliveryPlatformValue = Number(delivery.platformValue ?? 0);
      totalValue += deliveryTotalValue;
      driverValue += deliveryDriverValue;
      platformValue += deliveryPlatformValue;

      const company = companyItem(delivery.company);
      company.completedCount += 1;
      company.completedTotalValue += deliveryTotalValue;
      company.platformValue += deliveryPlatformValue;

      const serviceType = serviceTypeItem(delivery.serviceType.name);
      serviceType.completedCount += 1;
      serviceType.completedTotalValue += deliveryTotalValue;

      if (delivery.driver) {
        const current = drivers.get(delivery.driver.id) ?? {
          driverId: delivery.driver.id,
          driverName: delivery.driver.user.name,
          driverEmail: delivery.driver.user.email,
          completedCount: 0,
          driverValue: 0,
        };
        current.completedCount += 1;
        current.driverValue += deliveryDriverValue;
        drivers.set(delivery.driver.id, current);
      }
    }

    return {
      period: {
        from: this.dateOnly(period.from),
        to: this.dateOnly(period.to),
      },
      ordersCreated: {
        count: createdDeliveries.length,
        byCurrentStatus,
      },
      deliveriesCompleted: {
        count: completedDeliveries.length,
        totalValue: roundCurrency(totalValue),
        driverValue: roundCurrency(driverValue),
        platformValue: roundCurrency(platformValue),
        averageTicket: completedDeliveries.length
          ? roundCurrency(totalValue / completedDeliveries.length)
          : 0,
      },
      companies: [...companies.values()]
        .map((item) => ({
          ...item,
          completedTotalValue: roundCurrency(item.completedTotalValue),
          platformValue: roundCurrency(item.platformValue),
        }))
        .sort(
          (left, right) =>
            right.completedTotalValue - left.completedTotalValue ||
            right.createdCount - left.createdCount ||
            left.companyName.localeCompare(right.companyName),
        ),
      drivers: [...drivers.values()]
        .map((item) => ({ ...item, driverValue: roundCurrency(item.driverValue) }))
        .sort(
          (left, right) =>
            right.driverValue - left.driverValue || left.driverName.localeCompare(right.driverName),
        ),
      serviceTypes: [...serviceTypes.values()]
        .map((item) => ({
          ...item,
          completedTotalValue: roundCurrency(item.completedTotalValue),
        }))
        .sort(
          (left, right) =>
            right.completedTotalValue - left.completedTotalValue ||
            right.createdCount - left.createdCount ||
            left.serviceTypeName.localeCompare(right.serviceTypeName),
        ),
    };
  }

  private resolvePeriod(query: OperationsReportQuery): { from: Date; to: Date } {
    const to = query.to ? this.endOfDay(query.to) : new Date();
    if (query.from) return { from: this.startOfDay(query.from), to };

    const from = new Date(to);
    from.setUTCDate(from.getUTCDate() - 29);
    from.setUTCHours(0, 0, 0, 0);
    return { from, to };
  }

  private startOfDay(date: string): Date {
    return new Date(`${date}T00:00:00.000Z`);
  }

  private endOfDay(date: string): Date {
    return new Date(`${date}T23:59:59.999Z`);
  }

  private dateOnly(date: Date): string {
    return date.toISOString().slice(0, 10);
  }
}
