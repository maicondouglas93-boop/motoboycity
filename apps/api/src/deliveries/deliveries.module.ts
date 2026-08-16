import { Module } from '@nestjs/common';
import { AdminPlatformSettingsModule } from '../admin/platform-settings/admin-platform-settings.module';
import { DispatchModule } from '../dispatch/dispatch.module';
import { GoogleMapsModule } from '../maps/google-maps.module';
import { PricingModule } from '../pricing/pricing.module';
import { DeliveriesController } from './deliveries.controller';
import { DeliveriesService } from './deliveries.service';

@Module({
  imports: [PricingModule, GoogleMapsModule, DispatchModule, AdminPlatformSettingsModule],
  controllers: [DeliveriesController],
  providers: [DeliveriesService],
})
export class DeliveriesModule {}
