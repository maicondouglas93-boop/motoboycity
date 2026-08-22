import { Module } from '@nestjs/common';
import { DeliveriesModule } from '../../deliveries/deliveries.module';
import { FinanceModule } from '../../finance/finance.module';
import { AdminDeliveriesController } from './admin-deliveries.controller';
import { AdminDeliveriesService } from './admin-deliveries.service';

@Module({
  imports: [DeliveriesModule, FinanceModule],
  controllers: [AdminDeliveriesController],
  providers: [AdminDeliveriesService],
})
export class AdminDeliveriesModule {}
