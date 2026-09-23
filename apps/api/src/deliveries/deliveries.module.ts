import { Module } from '@nestjs/common';
import Redis from 'ioredis';
import { buildRedisConnectionOptions } from '../common/redis-connection';
import { AdminPlatformSettingsModule } from '../admin/platform-settings/admin-platform-settings.module';
import { DispatchModule } from '../dispatch/dispatch.module';
import { FinanceModule } from '../finance/finance.module';
import { GoogleMapsModule } from '../maps/google-maps.module';
import { PricingModule } from '../pricing/pricing.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { DeliveriesController } from './deliveries.controller';
import { DeliveriesService } from './deliveries.service';
import {
  DELIVERY_QUOTE_REDIS,
  DeliveryCompletionQuoteStore,
} from './delivery-completion-quote.store';
import { IntegrationEventsModule } from '../integrations/integration-events.module';

@Module({
  imports: [
    PricingModule,
    GoogleMapsModule,
    DispatchModule,
    FinanceModule,
    AdminPlatformSettingsModule,
    RealtimeModule,
    IntegrationEventsModule,
  ],
  controllers: [DeliveriesController],
  providers: [
    DeliveriesService,
    DeliveryCompletionQuoteStore,
    {
      provide: DELIVERY_QUOTE_REDIS,
      // Mesmo padrao do estado OAuth do aiqfome: conexao propria, e uma unica
      // tentativa por comando. O valor reservado e conforto — esperar o Redis
      // voltar nao pode segurar a entrega do motoboy.
      useFactory: () =>
        new Redis({
          ...buildRedisConnectionOptions(),
          maxRetriesPerRequest: 1,
        }),
    },
  ],
  exports: [DeliveriesService],
})
export class DeliveriesModule {}
