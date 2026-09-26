import { Module } from '@nestjs/common';
import { DeliveriesModule } from '../../deliveries/deliveries.module';
import { StoreCatalogModule } from '../store-catalog/store-catalog.module';
import { StoreOperationModule } from '../store-operation/store-operation.module';
import { ClienteDaLojaGuard, VerificadorDoCliente } from './cliente-da-loja.guard';
import { PublicStoreOrdersController } from './public-store-orders.controller';
import { StoreOrdersController } from './store-orders.controller';
import { StoreOrdersService } from './store-orders.service';

@Module({
  imports: [StoreCatalogModule, StoreOperationModule, DeliveriesModule],
  controllers: [PublicStoreOrdersController, StoreOrdersController],
  providers: [StoreOrdersService, VerificadorDoCliente, ClienteDaLojaGuard],
  exports: [StoreOrdersService],
})
export class StoreOrdersModule {}
