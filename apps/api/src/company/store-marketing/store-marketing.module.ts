import { Module } from '@nestjs/common';
import { StoreCatalogModule } from '../store-catalog/store-catalog.module';
import { StoreMarketingController } from './store-marketing.controller';
import { StoreMarketingService } from './store-marketing.service';

@Module({
  imports: [StoreCatalogModule],
  controllers: [StoreMarketingController],
  providers: [StoreMarketingService],
  exports: [StoreMarketingService],
})
export class StoreMarketingModule {}
