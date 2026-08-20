import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AdminCompaniesModule } from './admin/companies/admin-companies.module';
import { AdminDriversModule } from './admin/drivers/admin-drivers.module';
import { AdminPlatformSettingsModule } from './admin/platform-settings/admin-platform-settings.module';
import { AdminPricingTablesModule } from './admin/pricing-tables/admin-pricing-tables.module';
import { AdminReportsModule } from './admin/reports/admin-reports.module';
import { AdminOperationsModule } from './admin/operations/admin-operations.module';
import { AdminServiceTypesModule } from './admin/service-types/admin-service-types.module';
import { AuthModule } from './auth/auth.module';
import { CompanyAddressModule } from './company/company-address.module';
import { DeliveriesModule } from './deliveries/deliveries.module';
import { DeliveryOffersModule } from './delivery-offers/delivery-offers.module';
import { FinanceModule } from './finance/finance.module';
import { DispatchModule } from './dispatch/dispatch.module';
import { DriverPresenceModule } from './driver-presence/driver-presence.module';
import { HealthModule } from './health/health.module';
import { GoogleMapsModule } from './maps/google-maps.module';
import { PrismaModule } from './prisma/prisma.module';
import { PricingModule } from './pricing/pricing.module';
import { QueueModule } from './queue/queue.module';
import { RealtimeModule } from './realtime/realtime.module';
import { ServiceTypesModule } from './service-types/service-types.module';
import { TrackingModule } from './tracking/tracking.module';
import { LivePresenceModule } from './live-presence/live-presence.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 30 }]),
    PrismaModule,
    QueueModule,
    RealtimeModule,
    LivePresenceModule,
    HealthModule,
    AuthModule,
    AdminCompaniesModule,
    AdminDriversModule,
    AdminServiceTypesModule,
    AdminPricingTablesModule,
    AdminReportsModule,
    AdminOperationsModule,
    AdminPlatformSettingsModule,
    PricingModule,
    GoogleMapsModule,
    CompanyAddressModule,
    DispatchModule,
    DriverPresenceModule,
    DeliveriesModule,
    DeliveryOffersModule,
    FinanceModule,
    ServiceTypesModule,
    TrackingModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
