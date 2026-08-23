import { Module } from '@nestjs/common';
import { DeliveriesModule } from '../../deliveries/deliveries.module';
import { LivePresenceModule } from '../../live-presence/live-presence.module';
import { TrackingModule } from '../../tracking/tracking.module';
import { AdminOperationsController } from './admin-operations.controller';
import { AdminOperationsService } from './admin-operations.service';

@Module({
  imports: [DeliveriesModule, LivePresenceModule, TrackingModule],
  controllers: [AdminOperationsController],
  providers: [AdminOperationsService],
})
export class AdminOperationsModule {}
