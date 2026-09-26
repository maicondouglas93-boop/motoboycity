import { Module } from '@nestjs/common';
import { StoreCatalogModule } from '../store-catalog/store-catalog.module';
import { StoreOperationController } from './store-operation.controller';
import { StoreOperationService } from './store-operation.service';

@Module({
  imports: [StoreCatalogModule],
  controllers: [StoreOperationController],
  providers: [StoreOperationService],
  exports: [StoreOperationService],
})
export class StoreOperationModule {}
