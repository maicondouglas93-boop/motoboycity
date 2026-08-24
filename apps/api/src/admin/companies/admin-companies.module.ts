import { Module } from '@nestjs/common';
import { AdminCompaniesController } from './admin-companies.controller';
import { AdminCompaniesService } from './admin-companies.service';

@Module({
  controllers: [AdminCompaniesController],
  providers: [AdminCompaniesService],
  exports: [AdminCompaniesService],
})
export class AdminCompaniesModule {}
