import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { operationsReportQuerySchema, type OperationsReportQuery } from '@motoboycity/validation';
import { AdminOnlyGuard } from '../../auth/admin-only.guard';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AdminReportsService, type AdminOperationsReport } from './admin-reports.service';

@Controller('admin/reports')
@UseGuards(JwtAuthGuard, AdminOnlyGuard)
export class AdminReportsController {
  constructor(private readonly adminReportsService: AdminReportsService) {}

  @Get('operations')
  operations(
    @Query(new ZodValidationPipe(operationsReportQuerySchema)) query: OperationsReportQuery,
  ): Promise<AdminOperationsReport> {
    return this.adminReportsService.operations(query);
  }
}
