import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import {
  createServiceTypeSchema,
  listServiceTypesQuerySchema,
  updateServiceTypeSchema,
  type CreateServiceTypePayload,
  type ListServiceTypesQuery,
  type UpdateServiceTypePayload,
} from '@motoboycity/validation';
import { AdminOnlyGuard } from '../../auth/admin-only.guard';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AdminServiceTypesService, type ServiceTypeItem } from './admin-service-types.service';

@Controller('admin/service-types')
@UseGuards(JwtAuthGuard, AdminOnlyGuard)
export class AdminServiceTypesController {
  constructor(private readonly adminServiceTypesService: AdminServiceTypesService) {}

  @Get()
  list(
    @Query(new ZodValidationPipe(listServiceTypesQuerySchema)) query: ListServiceTypesQuery,
  ): Promise<ServiceTypeItem[]> {
    return this.adminServiceTypesService.list(query);
  }

  @Post()
  create(
    @Body(new ZodValidationPipe(createServiceTypeSchema)) body: CreateServiceTypePayload,
  ): Promise<ServiceTypeItem> {
    return this.adminServiceTypesService.create(body);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateServiceTypeSchema)) body: UpdateServiceTypePayload,
  ): Promise<ServiceTypeItem> {
    return this.adminServiceTypesService.update(id, body);
  }
}
