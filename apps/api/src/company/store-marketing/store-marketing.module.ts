import { Module } from '@nestjs/common';
import { StoreCatalogModule } from '../store-catalog/store-catalog.module';
import { StoreCouponsController } from './store-coupons.controller';
import { StoreCouponsService } from './store-coupons.service';
import { StoreMarketingController } from './store-marketing.controller';
import { StoreMarketingService } from './store-marketing.service';

@Module({
  imports: [StoreCatalogModule],
  controllers: [StoreMarketingController, StoreCouponsController],
  providers: [StoreMarketingService, StoreCouponsService],
  exports: [StoreMarketingService, StoreCouponsService],
})
export class StoreMarketingModule {}
