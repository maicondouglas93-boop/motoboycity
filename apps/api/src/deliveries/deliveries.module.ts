import { Module } from '@nestjs/common';
import { AdminPlatformSettingsModule } from '../admin/platform-settings/admin-platform-settings.module';
import { DispatchModule } from '../dispatch/dispatch.module';
import { FinanceModule } from '../finance/finance.module';
import { GoogleMapsModule } from '../maps/google-maps.module';
import { PricingModule } from '../pricing/pricing.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { DeliveriesController } from './deliveries.controller';
import { DeliveriesService } from './deliveries.service';
import { IntegrationEventsModule } from '../integrations/integration-events.module';

@Module({
  imports: [
    PricingModule,
    GoogleMapsModule,
    DispatchModule,
    FinanceModule,
    AdminPlatformSettingsModule,
    RealtimeModule,
    IntegrationEventsModule,
  ],
  controllers: [DeliveriesController],
  providers: [DeliveriesService],
  exports: [DeliveriesService],
})
export class DeliveriesModule {}
