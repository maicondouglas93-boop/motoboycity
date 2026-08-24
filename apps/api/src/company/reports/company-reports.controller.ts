import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import type { User } from '@prisma/client';
import type { CompanyOperationsReport } from '@motoboycity/types';
import {
  companyOperationsReportQuerySchema,
  type CompanyOperationsReportQuery,
} from '@motoboycity/validation';
import { CompanyOnlyGuard } from '../../auth/company-only.guard';
import { CurrentUser } from '../../auth/current-user.decorator';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { CompanyReportsService } from './company-reports.service';

@Controller('company/reports')
@UseGuards(JwtAuthGuard, CompanyOnlyGuard)
export class CompanyReportsController {
  constructor(private readonly companyReportsService: CompanyReportsService) {}

  @Get('operations')
  operations(
    @CurrentUser() companyUser: User,
    @Query(new ZodValidationPipe(companyOperationsReportQuerySchema))
    query: CompanyOperationsReportQuery,
  ): Promise<CompanyOperationsReport> {
    return this.companyReportsService.operations(companyUser, query);
  }
}
