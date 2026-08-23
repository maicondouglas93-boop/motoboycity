import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { DeliveryTrackingService } from './delivery-tracking.service';
import { LocationSilenceService } from './location-silence.service';

export const TRACKING_QUEUE = 'tracking';
export const PURGE_EXPIRED_LOCATION_POINTS_JOB = 'purge-expired-location-points';
export const ALERT_LOCATION_SILENCE_JOB = 'alert-location-silence';

@Processor(TRACKING_QUEUE)
export class TrackingRetentionProcessor extends WorkerHost {
  private readonly logger = new Logger(TrackingRetentionProcessor.name);

  constructor(
    private readonly deliveryTrackingService: DeliveryTrackingService,
    private readonly locationSilenceService: LocationSilenceService,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name === ALERT_LOCATION_SILENCE_JOB) {
      await this.locationSilenceService.alertSilentDrivers();
      return;
    }
    if (job.name !== PURGE_EXPIRED_LOCATION_POINTS_JOB) {
      this.logger.warn(`Job de rastreamento desconhecido: ${job.name}`);
      return;
    }
    const deleted = await this.deliveryTrackingService.purgeExpiredPoints();
    if (deleted > 0) this.logger.log(`${deleted} ponto(s) de GPS fora da retenção removido(s).`);
  }
}
