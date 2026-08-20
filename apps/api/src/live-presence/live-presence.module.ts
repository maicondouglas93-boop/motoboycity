import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { RealtimeModule } from '../realtime/realtime.module';
import { LiveDriverPresenceService } from './live-driver-presence.service';
import { LIVE_PRESENCE_QUEUE, LivePresenceProcessor } from './live-presence.processor';
import { LivePresenceScheduler } from './live-presence.scheduler';

@Module({
  imports: [RealtimeModule, BullModule.registerQueue({ name: LIVE_PRESENCE_QUEUE })],
  providers: [LiveDriverPresenceService, LivePresenceProcessor, LivePresenceScheduler],
  exports: [LiveDriverPresenceService],
})
export class LivePresenceModule {}
