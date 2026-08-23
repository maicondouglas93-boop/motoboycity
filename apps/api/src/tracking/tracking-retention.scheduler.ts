import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, OnModuleInit } from '@nestjs/common';
import type { Queue } from 'bullmq';
import {
  ALERT_LOCATION_SILENCE_JOB,
  PURGE_EXPIRED_LOCATION_POINTS_JOB,
  TRACKING_QUEUE,
} from './tracking-retention.processor';
import { DeliveryTrackingService } from './delivery-tracking.service';
import { LocationSilenceService } from './location-silence.service';

/** Mantém apenas os últimos 30 dias de pontos brutos de GPS. */
@Injectable()
export class TrackingRetentionScheduler implements OnModuleInit {
  constructor(
    @InjectQueue(TRACKING_QUEUE) private readonly trackingQueue: Queue,
    private readonly deliveryTrackingService: DeliveryTrackingService,
    private readonly locationSilenceService: LocationSilenceService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.trackingQueue.upsertJobScheduler(
      'daily-location-history-retention',
      { pattern: '0 3 * * *', tz: 'America/Sao_Paulo' },
      { name: PURGE_EXPIRED_LOCATION_POINTS_JOB, data: {} },
    );
    /**
     * De dois em dois minutos: e o intervalo que ainda avisa a tempo de alguem
     * fazer alguma coisa sem transformar o detector numa varredura constante.
     * A trava de um aviso por episodio vive no proprio detector, entao rodar
     * com frequencia nao vira spam.
     */
    await this.trackingQueue.upsertJobScheduler(
      'location-silence-detector',
      { pattern: '*/2 * * * *', tz: 'America/Sao_Paulo' },
      { name: ALERT_LOCATION_SILENCE_JOB, data: {} },
    );

    await this.deliveryTrackingService.purgeExpiredPoints();
    // Recupera o que ficou para tras enquanto o servidor esteve fora — mesmo
    // padrao da liberacao financeira.
    await this.locationSilenceService.alertSilentDrivers();
  }
}
