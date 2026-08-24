import { Module } from '@nestjs/common';
import { CompanyReportsController } from './company-reports.controller';
import { CompanyReportsService } from './company-reports.service';

@Module({
  controllers: [CompanyReportsController],
  providers: [CompanyReportsService],
})
export class CompanyReportsModule {}
