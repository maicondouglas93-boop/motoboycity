import { Module } from '@nestjs/common';
import { DeliveriesModule } from '../../deliveries/deliveries.module';
import { DispatchModule } from '../../dispatch/dispatch.module';
import { FinanceModule } from '../../finance/finance.module';
import { AdminDeliveriesController } from './admin-deliveries.controller';
import { AdminDeliveriesService } from './admin-deliveries.service';
import { IntegrationEventsModule } from '../../integrations/integration-events.module';
import { PricingModule } from '../../pricing/pricing.module';

@Module({
  imports: [
    DeliveriesModule,
    DispatchModule,
    FinanceModule,
    IntegrationEventsModule,
    PricingModule,
  ],
  controllers: [AdminDeliveriesController],
  providers: [AdminDeliveriesService],
})
export class AdminDeliveriesModule {}
