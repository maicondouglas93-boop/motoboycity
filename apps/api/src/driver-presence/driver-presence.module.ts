import { Module } from '@nestjs/common';
import { DispatchModule } from '../dispatch/dispatch.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { DriverPresenceController } from './driver-presence.controller';
import { DriverPresenceService } from './driver-presence.service';

@Module({
  imports: [DispatchModule, RealtimeModule],
  controllers: [DriverPresenceController],
  providers: [DriverPresenceService],
})
export class DriverPresenceModule {}
