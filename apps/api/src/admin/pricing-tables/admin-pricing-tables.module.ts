import { Module } from '@nestjs/common';
import { AdminPricingTablesController } from './admin-pricing-tables.controller';
import { AdminPricingTablesService } from './admin-pricing-tables.service';

@Module({
  controllers: [AdminPricingTablesController],
  providers: [AdminPricingTablesService],
})
export class AdminPricingTablesModule {}
