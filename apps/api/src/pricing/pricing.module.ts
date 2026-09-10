import { Module } from '@nestjs/common';
import { AdminPlatformSettingsModule } from '../admin/platform-settings/admin-platform-settings.module';
import { PricingService } from './pricing.service';
import { WeatherModule } from '../weather/weather.module';

@Module({
  imports: [AdminPlatformSettingsModule, WeatherModule],
  providers: [PricingService],
  exports: [PricingService],
})
export class PricingModule {}
