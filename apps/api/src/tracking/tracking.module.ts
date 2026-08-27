import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { AdminPlatformSettingsModule } from '../admin/platform-settings/admin-platform-settings.module';
import { PushModule } from '../push/push.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { LocationSilenceService } from './location-silence.service';
import { DeliveryTrackingController } from './delivery-tracking.controller';
import { DeliveryTrackingService } from './delivery-tracking.service';
import { PublicDeliveryTrackingController } from './public-delivery-tracking.controller';
import { TRACKING_QUEUE, TrackingRetentionProcessor } from './tracking-retention.processor';
import { TrackingRetentionScheduler } from './tracking-retention.scheduler';

@Module({
  imports: [
    RealtimeModule,
    AdminPlatformSettingsModule,
    PushModule,
    BullModule.registerQueue({ name: TRACKING_QUEUE }),
  ],
  controllers: [DeliveryTrackingController, PublicDeliveryTrackingController],
  providers: [
    DeliveryTrackingService,
    LocationSilenceService,
    TrackingRetentionProcessor,
    TrackingRetentionScheduler,
  ],
  exports: [DeliveryTrackingService, LocationSilenceService],
})
export class TrackingModule {}
