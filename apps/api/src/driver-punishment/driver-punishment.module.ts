import { Module } from '@nestjs/common';
import { AdminPlatformSettingsModule } from '../admin/platform-settings/admin-platform-settings.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { DriverPunishmentService } from './driver-punishment.service';

@Module({
  imports: [AdminPlatformSettingsModule, RealtimeModule],
  providers: [DriverPunishmentService],
  exports: [DriverPunishmentService],
})
export class DriverPunishmentModule {}
