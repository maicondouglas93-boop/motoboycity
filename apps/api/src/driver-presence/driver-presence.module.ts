import { Module } from '@nestjs/common';
import { DispatchModule } from '../dispatch/dispatch.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { LivePresenceModule } from '../live-presence/live-presence.module';
import { DriverPunishmentModule } from '../driver-punishment/driver-punishment.module';
import { DriverPresenceController } from './driver-presence.controller';
import { DriverPresenceService } from './driver-presence.service';

@Module({
  imports: [DispatchModule, RealtimeModule, LivePresenceModule, DriverPunishmentModule],
  controllers: [DriverPresenceController],
  providers: [DriverPresenceService],
})
export class DriverPresenceModule {}
