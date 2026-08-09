import { Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { listCompaniesQuerySchema, type ListCompaniesQuery } from '@motoboycity/validation';
import type { User } from '@prisma/client';
import { AdminOnlyGuard } from '../../auth/admin-only.guard';
import { CurrentUser } from '../../auth/current-user.decorator';
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
  approve(@Param('id') id: string, @CurrentUser() admin: User): Promise<ApproveCompanyResult> {
    return this.adminCompaniesService.approve(id, admin.id);
  }
}
