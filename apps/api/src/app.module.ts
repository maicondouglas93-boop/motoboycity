import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AdminCompaniesModule } from './admin/companies/admin-companies.module';
import { AuthModule } from './auth/auth.module';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { QueueModule } from './queue/queue.module';
import { RealtimeModule } from './realtime/realtime.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    QueueModule,
    RealtimeModule,
    HealthModule,
    AuthModule,
    AdminCompaniesModule,
  ],
})
export class AppModule {}
