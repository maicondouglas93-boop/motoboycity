import { Module } from '@nestjs/common';
import { ImageKitModule } from '../../media/imagekit.module';
import { StoreCatalogController } from './store-catalog.controller';
import { StoreCatalogService } from './store-catalog.service';

@Module({
  imports: [ImageKitModule],
  controllers: [StoreCatalogController],
  providers: [StoreCatalogService],
  exports: [StoreCatalogService],
})
export class StoreCatalogModule {}
