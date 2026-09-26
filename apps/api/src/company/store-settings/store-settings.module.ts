import { Module } from '@nestjs/common';
import { ImageKitModule } from '../../media/imagekit.module';
import { StoreCatalogModule } from '../store-catalog/store-catalog.module';
import { StoreOperationModule } from '../store-operation/store-operation.module';
import { PublicStoreController } from './public-store.controller';
import { StoreSettingsController } from './store-settings.controller';
import { StoreSettingsService } from './store-settings.service';

@Module({
  imports: [ImageKitModule, StoreCatalogModule, StoreOperationModule],
  controllers: [StoreSettingsController, PublicStoreController],
  providers: [StoreSettingsService],
})
export class StoreSettingsModule {}
