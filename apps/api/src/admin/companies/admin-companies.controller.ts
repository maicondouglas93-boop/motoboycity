import { Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { listCompaniesQuerySchema, type ListCompaniesQuery } from '@motoboycity/validation';
import { AdminOnlyGuard } from '../../auth/admin-only.guard';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import {
  AdminCompaniesService,
  type AdminCompanyListItem,
  type ApproveCompanyResult,
} from './admin-companies.service';

@Controller('admin/companies')
@UseGuards(JwtAuthGuard, AdminOnlyGuard)
export class AdminCompaniesController {
  constructor(private readonly adminCompaniesService: AdminCompaniesService) {}

  @Get()
  list(
    @Query(new ZodValidationPipe(listCompaniesQuerySchema)) query: ListCompaniesQuery,
  ): Promise<AdminCompanyListItem[]> {
    return this.adminCompaniesService.list(query.status);
  }

  @Patch(':id/approve')
  approve(@Param('id') id: string): Promise<ApproveCompanyResult> {
    return this.adminCompaniesService.approve(id);
  }
}
