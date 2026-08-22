import { Module } from '@nestjs/common';
import { AdminPlatformSettingsModule } from '../platform-settings/admin-platform-settings.module';
import { AdminBusinessHoursController } from './admin-business-hours.controller';
import { AdminBusinessHoursService } from './admin-business-hours.service';

@Module({
  imports: [AdminPlatformSettingsModule],
  controllers: [AdminBusinessHoursController],
  providers: [AdminBusinessHoursService],
})
export class AdminBusinessHoursModule {}
