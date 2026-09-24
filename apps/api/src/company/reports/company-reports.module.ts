import { Module } from '@nestjs/common';
import { PageProtectionModule } from '../page-protection/page-protection.module';
import { CompanyReportsController } from './company-reports.controller';
import { CompanyReportsService } from './company-reports.service';

@Module({
  imports: [PageProtectionModule],
  controllers: [CompanyReportsController],
  providers: [CompanyReportsService],
})
export class CompanyReportsModule {}
