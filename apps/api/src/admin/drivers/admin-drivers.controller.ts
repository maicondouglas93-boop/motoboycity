import { Body, Controller, Get, Param, Patch, Put, Query, UseGuards } from '@nestjs/common';
import {
  listDriversQuerySchema,
  replaceDriverServiceTypesSchema,
  type ListDriversQuery,
  type ReplaceDriverServiceTypesPayload,
} from '@motoboycity/validation';
import type { User } from '@prisma/client';
import { AdminOnlyGuard } from '../../auth/admin-only.guard';
import { CurrentUser } from '../../auth/current-user.decorator';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import {
  AdminDriversService,
  type AdminDriverListItem,
  type DriverAccountStatusResult,
  type DriverReviewResult,
  type DriverServiceTypesResult,
} from './admin-drivers.service';

@Controller('admin/drivers')
@UseGuards(JwtAuthGuard, AdminOnlyGuard)
export class AdminDriversController {
  constructor(private readonly adminDriversService: AdminDriversService) {}

  @Get()
  list(
    @Query(new ZodValidationPipe(listDriversQuerySchema)) query: ListDriversQuery,
  ): Promise<AdminDriverListItem[]> {
    return this.adminDriversService.list(query);
  }

  @Get(':id')
  detail(@Param('id') id: string): Promise<AdminDriverListItem> {
    return this.adminDriversService.detail(id);
  }

  @Patch(':id/approve')
  approve(@Param('id') id: string, @CurrentUser() admin: User): Promise<DriverReviewResult> {
    return this.adminDriversService.approve(id, admin.id);
  }

  @Patch(':id/reject')
  reject(@Param('id') id: string, @CurrentUser() admin: User): Promise<DriverReviewResult> {
    return this.adminDriversService.reject(id, admin.id);
  }

  @Patch(':id/suspend')
  suspend(@Param('id') id: string): Promise<DriverAccountStatusResult> {
    return this.adminDriversService.suspend(id);
  }

  @Patch(':id/block')
  block(@Param('id') id: string): Promise<DriverAccountStatusResult> {
    return this.adminDriversService.block(id);
  }

  @Patch(':id/reactivate')
  reactivate(@Param('id') id: string): Promise<DriverAccountStatusResult> {
    return this.adminDriversService.reactivate(id);
  }

  @Put(':id/service-types')
  replaceServiceTypes(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(replaceDriverServiceTypesSchema))
    body: ReplaceDriverServiceTypesPayload,
  ): Promise<DriverServiceTypesResult> {
    return this.adminDriversService.replaceServiceTypes(id, body);
  }
}
