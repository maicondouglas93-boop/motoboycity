import { Injectable } from '@nestjs/common';
import type {
  AdminOperationsReport,
  OperationsReportCompanyItem,
  OperationsReportDriverItem,
  OperationsReportServiceTypeItem,
} from '@motoboycity/types';
import type { OperationsReportQuery } from '@motoboycity/validation';
import type { DeliveryStatus } from '@prisma/client';
import {
  dateInSaoPaulo,
  endOfDayInSaoPaulo,
  startOfDayInSaoPaulo,
} from '../../common/sao-paulo-time';
import { PrismaService } from '../../prisma/prisma.service';
import { computePeakHours } from './delivery-peak-hours';
import { isLiveWindow, percentChange, previousComparableWindow } from './report-window';
import { computeDriverPerformance } from './driver-performance';

/**
 * As formas do relatorio vivem em `@motoboycity/types` e sao apenas
 * reexportadas: a copia local que existia aqui era a mesma armadilha que ja
 * deixou o contrato de configuracoes divergir entre a API e o painel.
 */
export type {
  AdminOperationsReport,
  OperationsReportCompanyItem,
  OperationsReportDriverItem,
  OperationsReportServiceTypeItem,
};

const deliveryStatuses: DeliveryStatus[] = [
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

/** Entregador sem nada medido no periodo — zeros e nulos, nunca inventado. */
function emptyPerformance() {
  return {
    failedCount: 0,
    cancelledAfterAcceptCount: 0,
    completionRate: null,
    offersReceived: 0,
    offersAccepted: 0,
    acceptanceRate: null,
    averageMinutesToComplete: null,
    timedSamples: 0,
  };
}

function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

@Injectable()
export class AdminReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async operations(query: OperationsReportQuery): Promise<AdminOperationsReport> {
    const period = this.resolvePeriod(query);
    const agora = new Date();
    const anterior = previousComparableWindow(period);
    const [createdDeliveries, completedDeliveries, driverDeliveries, driverOffers] =
      await Promise.all([
        this.prisma.delivery.findMany({
          where: { createdAt: { gte: period.from, lte: period.to } },
          select: {
            status: true,
            createdAt: true,
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
        /**
         * Tudo que teve entregador e ENCERROU no periodo — inclui insucesso e
         * cancelamento, que a consulta de concluidas nao ve. Sem eles, a taxa de
         * conclusao seria sempre 100%.
         */
        this.prisma.delivery.findMany({
          where: {
            driverId: { not: null },
            statusChangedAt: { gte: period.from, lte: period.to },
          },
          select: {
            driverId: true,
            status: true,
            statusHistory: {
              where: { toStatus: { in: ['ACCEPTED', 'COMPLETED'] } },
              select: { toStatus: true, changedAt: true },
              orderBy: { changedAt: 'asc' },
            },
          },
        }),
        this.prisma.deliveryOffer.findMany({
          where: { offeredAt: { gte: period.from, lte: period.to } },
          select: { driverId: true, response: true },
        }),
      ]);

    /**
     * A janela anterior sai de AGREGADOS, e nao das linhas.
     *
     * O periodo atual precisa das linhas porque monta ranking por empresa, por
     * motoboy e horario de pico. A comparacao precisa de quatro numeros — puxar
     * mais um mes inteiro de linhas so para soma-los dobraria o custo da tela
     * sem nada em troca.
     */
    const [criadasAntes, concluidasAntes] = await Promise.all([
      this.prisma.delivery.count({
        where: { createdAt: { gte: anterior.from, lte: anterior.to } },
      }),
      this.prisma.delivery.aggregate({
        where: {
          status: 'COMPLETED',
          statusChangedAt: { gte: anterior.from, lte: anterior.to },
        },
        _count: { _all: true },
        _sum: { totalValue: true },
      }),
    ]);
    const totalAntes = roundCurrency(Number(concluidasAntes._sum.totalValue ?? 0));
    const comparacao = {
      ordersCreatedCount: criadasAntes,
      deliveriesCompletedCount: concluidasAntes._count._all,
      totalValue: totalAntes,
      averageTicket: concluidasAntes._count._all
        ? roundCurrency(totalAntes / concluidasAntes._count._all)
        : 0,
    };

    /**
     * Do aceite ate a conclusao. Usa a PRIMEIRA ocorrencia de cada status: uma
     * entrega reofertada teria varios ACCEPTED, e pegar o ultimo encolheria o
     * tempo medido.
     */
    const performance = computeDriverPerformance(
      driverDeliveries
        .filter((delivery): delivery is typeof delivery & { driverId: string } =>
          Boolean(delivery.driverId),
        )
        .map((delivery) => {
          const aceite = delivery.statusHistory.find((item) => item.toStatus === 'ACCEPTED');
          const conclusao = delivery.statusHistory.find((item) => item.toStatus === 'COMPLETED');
          const minutos =
            aceite && conclusao
              ? Math.round(
                  ((conclusao.changedAt.getTime() - aceite.changedAt.getTime()) / 60_000) * 10,
                ) / 10
              : null;
          return {
            driverId: delivery.driverId,
            status: delivery.status,
            // Duracao negativa nao existe: descarta em vez de poluir a media.
            minutesToComplete: minutos !== null && minutos >= 0 ? minutos : null,
          };
        }),
      driverOffers,
    );
    const performanceById = new Map(performance.map((item) => [item.driverId, item]));

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
          ...emptyPerformance(),
        };
        current.completedCount += 1;
        current.driverValue += deliveryDriverValue;
        drivers.set(delivery.driver.id, current);
      }
    }

    const ticketMedio = completedDeliveries.length
      ? roundCurrency(totalValue / completedDeliveries.length)
      : 0;

    return {
      period: {
        from: dateInSaoPaulo(period.from),
        to: dateInSaoPaulo(period.to),
      },
      live: isLiveWindow(period, agora),
      comparison: {
        period: {
          from: dateInSaoPaulo(anterior.from),
          to: dateInSaoPaulo(anterior.to),
        },
        ordersCreatedCount: comparacao.ordersCreatedCount,
        deliveriesCompletedCount: comparacao.deliveriesCompletedCount,
        totalValue: comparacao.totalValue,
        averageTicket: comparacao.averageTicket,
        changePercent: {
          ordersCreated: percentChange(createdDeliveries.length, comparacao.ordersCreatedCount),
          deliveriesCompleted: percentChange(
            completedDeliveries.length,
            comparacao.deliveriesCompletedCount,
          ),
          totalValue: percentChange(roundCurrency(totalValue), comparacao.totalValue),
          averageTicket: percentChange(ticketMedio, comparacao.averageTicket),
        },
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
        averageTicket: ticketMedio,
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
        .map((item) => ({
          ...item,
          driverValue: roundCurrency(item.driverValue),
          // O desempenho vem da consulta propria: a de concluidas nao enxerga
          // insucesso, cancelamento nem oferta recusada.
          ...(performanceById.get(item.driverId) ?? emptyPerformance()),
        }))
        .sort(
          (left, right) =>
            right.driverValue - left.driverValue || left.driverName.localeCompare(right.driverName),
        ),
      peakHours: computePeakHours(
        createdDeliveries.map((delivery) => delivery.createdAt),
        period,
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

  /**
   * O periodo e recortado no relogio de Sao Paulo, nao em UTC.
   *
   * Antes as pontas eram `T00:00:00Z` e `T23:59:59Z`, o que fazia um pedido
   * das 22h de terca cair no relatorio de quarta — tres horas de todo dia
   * lançadas no dia errado. Com os horarios de pico isso deixaria de ser um
   * detalhe contabil e viraria um pico deslocado no grafico.
   */
  private resolvePeriod(query: OperationsReportQuery): { from: Date; to: Date } {
    const to = query.to ? endOfDayInSaoPaulo(query.to) : new Date();
    if (query.from) return { from: startOfDayInSaoPaulo(query.from), to };

    // 30 dias contando o de hoje, andando por dias civis locais.
    const [ano, mes, dia] = dateInSaoPaulo(to).split('-').map(Number);
    const primeiroDia = new Date(Date.UTC(ano!, mes! - 1, dia! - 29));
    return {
      from: startOfDayInSaoPaulo(this.dateOnly(primeiroDia)),
      to,
    };
  }

  /** Data civil de um instante ja expresso como UTC puro. */
  private dateOnly(date: Date): string {
    return date.toISOString().slice(0, 10);
  }
}
