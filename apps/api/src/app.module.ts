import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AdminCompaniesModule } from './admin/companies/admin-companies.module';
import { AdminDriversModule } from './admin/drivers/admin-drivers.module';
import { AdminPlatformSettingsModule } from './admin/platform-settings/admin-platform-settings.module';
import { AdminPricingTablesModule } from './admin/pricing-tables/admin-pricing-tables.module';
import { AdminServiceTypesModule } from './admin/service-types/admin-service-types.module';
import { AuthModule } from './auth/auth.module';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { PricingModule } from './pricing/pricing.module';
import { QueueModule } from './queue/queue.module';
import { RealtimeModule } from './realtime/realtime.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 30 }]),
    PrismaModule,
    QueueModule,
    RealtimeModule,
    HealthModule,
    AuthModule,
    AdminCompaniesModule,
    AdminDriversModule,
    AdminServiceTypesModule,
    AdminPricingTablesModule,
    AdminPlatformSettingsModule,
    PricingModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
