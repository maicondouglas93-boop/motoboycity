import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AdminCompaniesModule } from './admin/companies/admin-companies.module';
import { AdminDriversModule } from './admin/drivers/admin-drivers.module';
import { AdminPlatformSettingsModule } from './admin/platform-settings/admin-platform-settings.module';
import { AdminPricingTablesModule } from './admin/pricing-tables/admin-pricing-tables.module';
import { AdminBusinessHoursModule } from './admin/business-hours/admin-business-hours.module';
import { AdminDeliveriesModule } from './admin/deliveries/admin-deliveries.module';
import { AdminSurchargesModule } from './admin/surcharges/admin-surcharges.module';
import { AdminReportsModule } from './admin/reports/admin-reports.module';
import { AdminOperationsModule } from './admin/operations/admin-operations.module';
import { AdminServiceTypesModule } from './admin/service-types/admin-service-types.module';
import { AuthModule } from './auth/auth.module';
import { CompanyAddressModule } from './company/company-address.module';
import { CompanyProfileModule } from './company/profile/company-profile.module';
import { CompanyReportsModule } from './company/reports/company-reports.module';
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
import { PushModule } from './push/push.module';
import { LivePresenceModule } from './live-presence/live-presence.module';
import { VirtualSecretaryModule } from './admin/virtual-secretary/virtual-secretary.module';
import { ProfileModule } from './profile/profile.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    /**
     * Limite configuravel por ambiente.
     *
     * O padrao de 30/min protege a API em producao, mas em E2E todas as
     * requisicoes saem do mesmo IP: a suite inteira conta como um cliente so,
     * e cada teste novo aproxima o limite. Quando estoura, o 429 aparece como
     * falha em um teste QUALQUER mais adiante — foi exatamente assim que a
     * suite quebrou ao ganhar dois testes, com o erro surgindo tres testes
     * depois da causa.
     */
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: Number(process.env['THROTTLE_TTL_MS'] ?? 60_000),
        limit: Number(process.env['THROTTLE_LIMIT'] ?? 30),
      },
    ]),
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
    AdminBusinessHoursModule,
    AdminDeliveriesModule,
    AdminSurchargesModule,
    AdminReportsModule,
    AdminOperationsModule,
    AdminPlatformSettingsModule,
    VirtualSecretaryModule,
    PricingModule,
    GoogleMapsModule,
    CompanyAddressModule,
    CompanyProfileModule,
    CompanyReportsModule,
    DispatchModule,
    DriverPresenceModule,
    DeliveriesModule,
    DeliveryOffersModule,
    FinanceModule,
    ServiceTypesModule,
    TrackingModule,
    PushModule,
    ProfileModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
