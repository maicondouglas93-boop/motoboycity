import { Module } from '@nestjs/common';
import { StoreCatalogModule } from '../store-catalog/store-catalog.module';
import { PublicStoreController } from './public-store.controller';
import { StoreSettingsController } from './store-settings.controller';
import { StoreSettingsService } from './store-settings.service';

@Module({
  imports: [StoreCatalogModule],
  controllers: [StoreSettingsController, PublicStoreController],
  providers: [StoreSettingsService],
})
export class StoreSettingsModule {}
