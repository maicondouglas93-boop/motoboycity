import { Injectable, Logger } from '@nestjs/common';
import type { DeliveryStatus } from '@prisma/client';
import type { SilentDriverItem } from '@motoboycity/types';
import { AdminPlatformSettingsService } from '../admin/platform-settings/admin-platform-settings.service';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { shouldAlertSilence, silentMinutes } from './location-silence';

/**
 * Status em que o motoboy esta NA RUA e a posicao dele deveria estar chegando.
 *
 * E mais amplo que "aceito ou coletado": um pedido parado em DELIVERED so
 * existe porque exige retorno — ele esta voltando para a loja. E FAILED e o
 * insucesso, em que ele esta na rua devolvendo a mercadoria. Nos dois casos a
 * loja ainda espera alguma coisa, e perder a posicao dele importa igual.
 */
const ON_STREET_STATUSES: DeliveryStatus[] = ['ACCEPTED', 'COLLECTED', 'DELIVERED', 'FAILED'];

@Injectable()
export class LocationSilenceService {
  private readonly logger = new Logger(LocationSilenceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly platformSettingsService: AdminPlatformSettingsService,
    private readonly realtimeGateway: RealtimeGateway,
  ) {}

  /**
   * Quem esta sem posicao agora — tenha sido avisado ou nao.
   *
   * O painel quer o ESTADO atual, nao o log de avisos: e este o numero que
   * responde a ligacao da loja perguntando por que o pedido nao anda.
   */
  async listSilentDrivers(now: Date = new Date()): Promise<SilentDriverItem[]> {
    const { threshold, drivers } = await this.collect(now);
    if (threshold === null) {
      return [];
    }

    return drivers
      .filter((driver) => driver.silentMinutes >= threshold)
      .sort((left, right) => right.silentMinutes - left.silentMinutes)
      .map(({ alertedAt: _alertedAt, ...item }) => item);
  }

  /** O detector propriamente dito. Devolve quantos avisos sairam. */
  async alertSilentDrivers(now: Date = new Date()): Promise<number> {
    const { threshold, drivers } = await this.collect(now);
    if (threshold === null) {
      return 0;
    }

    let avisados = 0;
    for (const driver of drivers) {
      const precisa = shouldAlertSilence({
        lastContactAt: new Date(driver.lastContactAt),
        alertedAt: driver.alertedAt,
        now,
        thresholdMinutes: threshold,
      });
      if (!precisa) {
        continue;
      }

      const pedidos = driver.deliveryNumbers.map((numero) => `#${numero}`).join(', ');

      /**
       * O aviso ao motoboy vai por socket, que so chega se o app estiver VIVO.
       *
       * Isso cobre o caso comum de app aberto com rastreamento quebrado —
       * permissao revogada, GPS desligado, economia de bateria matando o
       * servico de localizacao. Nao cobre app encerrado de vez: para isso
       * seria preciso push ou WhatsApp, e nenhum dos dois existe neste sistema.
       * Por isso o aviso ao ADMIN abaixo e a parte que sempre funciona.
       */
      this.realtimeGateway.emitToDriver(driver.driverId, 'driver:location-lost', {
        activeDeliveryCount: driver.activeDeliveryCount,
        silentMinutes: driver.silentMinutes,
      });

      this.realtimeGateway.emitAdminActivity({
        type: 'DRIVER_LOCATION_LOST',
        message:
          `${driver.driverName} está com ${driver.activeDeliveryCount} pedido(s) ` +
          `(${pedidos}) e sem posição há ${driver.silentMinutes} min.`,
      });

      await this.prisma.driver.update({
        where: { id: driver.driverId },
        data: { locationSilenceAlertedAt: now },
      });
      avisados += 1;
    }

    if (avisados > 0) {
      this.logger.warn(`${avisados} motoboy(s) com pedido em andamento e sem posição.`);
    }
    return avisados;
  }

  private async collect(now: Date): Promise<{
    threshold: number | null;
    drivers: (SilentDriverItem & { alertedAt: Date | null })[];
  }> {
    const settings = await this.platformSettingsService.get();
    const threshold = settings.locationSilenceAlertMinutes;
    if (threshold === null) {
      return { threshold, drivers: [] };
    }

    const deliveries = await this.prisma.delivery.findMany({
      where: { status: { in: ON_STREET_STATUSES }, driverId: { not: null } },
      select: {
        id: true,
        displayNumber: true,
        driverId: true,
        statusChangedAt: true,
        driver: {
          select: { locationSilenceAlertedAt: true, user: { select: { name: true } } },
        },
      },
    });
    if (deliveries.length === 0) {
      return { threshold, drivers: [] };
    }

    /**
     * Uma consulta agrupada para todos, e nao uma por motoboy: a frota e
     * pequena hoje, mas isto roda de dois em dois minutos para sempre.
     */
    const pontos = await this.prisma.deliveryLocationPoint.groupBy({
      by: ['driverId'],
      where: { deliveryId: { in: deliveries.map((delivery) => delivery.id) } },
      _max: { capturedAt: true },
    });
    const ultimaPosicao = new Map(
      pontos.map((ponto) => [ponto.driverId, ponto._max.capturedAt] as const),
    );

    const porMotoboy = new Map<string, SilentDriverItem & { alertedAt: Date | null }>();
    for (const delivery of deliveries) {
      const driverId = delivery.driverId;
      if (!driverId) {
        continue;
      }

      /**
       * Sem nenhuma posicao registrada, o relogio comeca quando ele assumiu o
       * trabalho. Nunca termos ouvido nada desde que pegou a corrida e o caso
       * MAIS grave, nao um caso a ignorar.
       */
      const posicao = ultimaPosicao.get(driverId) ?? null;
      const contato = posicao ?? delivery.statusChangedAt;

      const existente = porMotoboy.get(driverId);
      if (existente) {
        existente.activeDeliveryCount += 1;
        existente.deliveryNumbers.push(delivery.displayNumber);
        // O contato mais recente entre os pedidos dele e o que vale.
        if (contato.getTime() > new Date(existente.lastContactAt).getTime()) {
          existente.lastContactAt = contato.toISOString();
          existente.silentMinutes = silentMinutes(contato, now);
        }
        continue;
      }

      porMotoboy.set(driverId, {
        driverId,
        driverName: delivery.driver?.user.name ?? 'Motoboy',
        activeDeliveryCount: 1,
        deliveryNumbers: [delivery.displayNumber],
        lastContactAt: contato.toISOString(),
        silentMinutes: silentMinutes(contato, now),
        alertedAt: delivery.driver?.locationSilenceAlertedAt ?? null,
      });
    }

    return { threshold, drivers: [...porMotoboy.values()] };
  }
}
