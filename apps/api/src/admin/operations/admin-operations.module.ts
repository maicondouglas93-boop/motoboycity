import { Module } from '@nestjs/common';
import { DeliveriesModule } from '../../deliveries/deliveries.module';
import { LivePresenceModule } from '../../live-presence/live-presence.module';
import { RealtimeModule } from '../../realtime/realtime.module';
import { TrackingModule } from '../../tracking/tracking.module';
import { DispatchModule } from '../../dispatch/dispatch.module';
import { AdminOperationsController } from './admin-operations.controller';
import { AdminOperationsService } from './admin-operations.service';

@Module({
  imports: [DeliveriesModule, DispatchModule, LivePresenceModule, RealtimeModule, TrackingModule],
  controllers: [AdminOperationsController],
  providers: [AdminOperationsService],
  exports: [AdminOperationsService],
})
export class AdminOperationsModule {}
