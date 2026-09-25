import { Module } from '@nestjs/common';
import { StoreCatalogController } from './store-catalog.controller';
import { StoreCatalogService } from './store-catalog.service';

@Module({
  controllers: [StoreCatalogController],
  providers: [StoreCatalogService],
})
export class StoreCatalogModule {}
