import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module';
import { RealtimeModule } from '../../realtime/realtime.module';
import { AdminCompaniesController } from './admin-companies.controller';
import { AdminCompaniesService } from './admin-companies.service';

@Module({
  imports: [AuthModule, RealtimeModule],
  controllers: [AdminCompaniesController],
  providers: [AdminCompaniesService],
  exports: [AdminCompaniesService],
})
export class AdminCompaniesModule {}
