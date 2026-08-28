import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { buildRedisConnectionOptions } from '../../common/redis-connection';
import { AiqfomeClient } from './aiqfome-client';
import { AiqfomeCredentialsService } from './aiqfome-credentials.service';
import { CompanyAiqfomeController, PublicAiqfomeController } from './aiqfome.controller';
import { AIQFOME_REDIS, AiqfomeOAuthStateService } from './aiqfome-oauth-state.service';
import { AiqfomeService } from './aiqfome.service';
import { AiqfomeTokenService } from './aiqfome-token.service';

@Module({
  controllers: [CompanyAiqfomeController, PublicAiqfomeController],
  providers: [
    ConfigService,
    AiqfomeClient,
    AiqfomeCredentialsService,
    AiqfomeOAuthStateService,
    AiqfomeService,
    AiqfomeTokenService,
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
