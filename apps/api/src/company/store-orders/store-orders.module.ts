import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { DeliveriesModule } from '../../deliveries/deliveries.module';
import { WebPushModule } from '../../web-push/web-push.module';
import { StoreCatalogModule } from '../store-catalog/store-catalog.module';
import { StoreOperationModule } from '../store-operation/store-operation.module';
import { ClienteDaLojaGuard, VerificadorDoCliente } from './cliente-da-loja.guard';
import { PublicStoreOrdersController } from './public-store-orders.controller';
import { StoreOrderNotificationsService } from './store-order-notifications.service';
import { StoreOrdersController } from './store-orders.controller';
import { StoreOrdersProcessor } from './store-orders.processor';
import { STORE_ORDERS_QUEUE } from './store-orders.queue';
import { StoreOrdersScheduler } from './store-orders.scheduler';
import { StoreOrdersService } from './store-orders.service';

@Module({
  imports: [
    StoreCatalogModule,
    StoreOperationModule,
    DeliveriesModule,
    WebPushModule,
    BullModule.registerQueue({ name: STORE_ORDERS_QUEUE }),
  ],
  controllers: [PublicStoreOrdersController, StoreOrdersController],
  providers: [
    StoreOrdersService,
    StoreOrderNotificationsService,
    StoreOrdersProcessor,
    StoreOrdersScheduler,
    VerificadorDoCliente,
    ClienteDaLojaGuard,
  ],
  exports: [StoreOrdersService],
})
export class StoreOrdersModule {}
