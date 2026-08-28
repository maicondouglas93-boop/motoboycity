import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { buildRedisConnectionOptions } from '../../common/redis-connection';
import { AiqfomeClient } from './aiqfome-client';
import { AiqfomeCredentialsService } from './aiqfome-credentials.service';
import { CompanyAiqfomeController, PublicAiqfomeController } from './aiqfome.controller';
import { AIQFOME_REDIS, AiqfomeOAuthStateService } from './aiqfome-oauth-state.service';
import { AiqfomeService } from './aiqfome.service';
import { AiqfomeTokenService } from './aiqfome-token.service';
import { DeliveriesModule } from '../../deliveries/deliveries.module';
import { AiqfomeInboundProcessor } from './aiqfome-inbound.processor';
import { AIQFOME_INBOUND_QUEUE, AiqfomeWebhookService } from './aiqfome-webhook.service';
import { IntegrationEventsModule } from '../integration-events.module';
import { AiqfomeOutboundService } from './aiqfome-outbound.service';
import { AiqfomeOutboundProcessor } from './aiqfome-outbound.processor';

@Module({
  imports: [
    DeliveriesModule,
    IntegrationEventsModule,
    BullModule.registerQueue({ name: AIQFOME_INBOUND_QUEUE }),
  ],
  controllers: [CompanyAiqfomeController, PublicAiqfomeController],
  providers: [
    ConfigService,
    AiqfomeClient,
    AiqfomeCredentialsService,
    AiqfomeOAuthStateService,
    AiqfomeService,
    AiqfomeTokenService,
    AiqfomeWebhookService,
    AiqfomeInboundProcessor,
    AiqfomeOutboundService,
    AiqfomeOutboundProcessor,
    {
      provide: AIQFOME_REDIS,
      useFactory: () =>
        new Redis({
          ...buildRedisConnectionOptions(),
          maxRetriesPerRequest: 1,
        }),
    },
  ],
})
export class AiqfomeModule {}
