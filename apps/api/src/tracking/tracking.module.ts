import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { RealtimeModule } from '../realtime/realtime.module';
import { DeliveryTrackingController } from './delivery-tracking.controller';
import { DeliveryTrackingService } from './delivery-tracking.service';
import { TRACKING_QUEUE, TrackingRetentionProcessor } from './tracking-retention.processor';
import { TrackingRetentionScheduler } from './tracking-retention.scheduler';

@Module({
  imports: [RealtimeModule, BullModule.registerQueue({ name: TRACKING_QUEUE })],
  controllers: [DeliveryTrackingController],
  providers: [DeliveryTrackingService, TrackingRetentionProcessor, TrackingRetentionScheduler],
  exports: [DeliveryTrackingService],
})
export class TrackingModule {}
