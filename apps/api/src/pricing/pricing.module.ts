import { Module } from '@nestjs/common';
import { AdminPlatformSettingsModule } from '../admin/platform-settings/admin-platform-settings.module';
import { PricingService } from './pricing.service';

@Module({
  imports: [AdminPlatformSettingsModule],
  providers: [PricingService],
  exports: [PricingService],
})
export class PricingModule {}
