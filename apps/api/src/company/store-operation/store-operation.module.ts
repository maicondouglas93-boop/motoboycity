import { Module } from '@nestjs/common';
import { StoreAsaasModule } from '../store-asaas/store-asaas.module';
import { StoreCatalogModule } from '../store-catalog/store-catalog.module';
import { StoreOperationController } from './store-operation.controller';
import { StoreOperationService } from './store-operation.service';

@Module({
  imports: [StoreCatalogModule, StoreAsaasModule],
  controllers: [StoreOperationController],
  providers: [StoreOperationService],
  exports: [StoreOperationService],
})
export class StoreOperationModule {}
