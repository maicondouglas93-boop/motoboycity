import { Module } from '@nestjs/common';
import { StoreCatalogModule } from '../store-catalog/store-catalog.module';
import { StoreCouponsController } from './store-coupons.controller';
import { StoreCouponsService } from './store-coupons.service';
import { StoreHighlightsController } from './store-highlights.controller';
import { StoreHighlightsService } from './store-highlights.service';
import { StoreMarketingController } from './store-marketing.controller';
import { StoreMarketingService } from './store-marketing.service';

@Module({
  imports: [StoreCatalogModule],
  controllers: [StoreMarketingController, StoreCouponsController, StoreHighlightsController],
  providers: [StoreMarketingService, StoreCouponsService, StoreHighlightsService],
  exports: [StoreMarketingService, StoreCouponsService, StoreHighlightsService],
})
export class StoreMarketingModule {}
