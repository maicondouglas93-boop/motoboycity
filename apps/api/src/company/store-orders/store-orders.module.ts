import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { DeliveriesModule } from '../../deliveries/deliveries.module';
import { WebPushModule } from '../../web-push/web-push.module';
import { StoreAsaasModule } from '../store-asaas/store-asaas.module';
import { StoreCatalogModule } from '../store-catalog/store-catalog.module';
import { StoreOperationModule } from '../store-operation/store-operation.module';
import { ClienteDaLojaGuard, VerificadorDoCliente } from './cliente-da-loja.guard';
import { PublicStoreOrdersController } from './public-store-orders.controller';
import { StoreAsaasWebhookController } from './store-asaas-webhook.controller';
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
    StoreAsaasModule,
    BullModule.registerQueue({ name: STORE_ORDERS_QUEUE }),
  ],
  controllers: [PublicStoreOrdersController, StoreOrdersController, StoreAsaasWebhookController],
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
