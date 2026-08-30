import { Module } from '@nestjs/common';
import { AdminPlatformSettingsModule } from '../../admin/platform-settings/admin-platform-settings.module';
import { CompanyBusinessHoursController } from './company-business-hours.controller';
import { CompanyBusinessHoursService } from './company-business-hours.service';

@Module({
  imports: [AdminPlatformSettingsModule],
  controllers: [CompanyBusinessHoursController],
  providers: [CompanyBusinessHoursService],
})
export class CompanyBusinessHoursModule {}
