import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { AdminPlatformSettingsModule } from '../admin/platform-settings/admin-platform-settings.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { LivePresenceModule } from '../live-presence/live-presence.module';
import { DISPATCH_QUEUE, DispatchService } from './dispatch.service';
import { DispatchProcessor } from './dispatch.processor';

@Module({
  imports: [
    BullModule.registerQueue({ name: DISPATCH_QUEUE }),
    AdminPlatformSettingsModule,
    RealtimeModule,
    LivePresenceModule,
  ],
  providers: [DispatchService, DispatchProcessor],
  exports: [DispatchService],
})
export class DispatchModule {}
