import { Module } from '@nestjs/common';
import { DeliveriesModule } from '../../deliveries/deliveries.module';
import { FinanceModule } from '../../finance/finance.module';
import { AdminDeliveriesController } from './admin-deliveries.controller';
import { AdminDeliveriesService } from './admin-deliveries.service';
import { IntegrationEventsModule } from '../../integrations/integration-events.module';

@Module({
  imports: [DeliveriesModule, FinanceModule, IntegrationEventsModule],
  controllers: [AdminDeliveriesController],
  providers: [AdminDeliveriesService],
})
export class AdminDeliveriesModule {}
