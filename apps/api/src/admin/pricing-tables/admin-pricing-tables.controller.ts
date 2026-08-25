import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import {
  createPricingTableSchema,
  listPricingTablesQuerySchema,
  type CreatePricingTablePayload,
  type ListPricingTablesQuery,
} from '@motoboycity/validation';
import type { PricingTableItem } from '@motoboycity/types';
import type { User } from '@prisma/client';
import { AdminOnlyGuard } from '../../auth/admin-only.guard';
import { CurrentUser } from '../../auth/current-user.decorator';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AdminPricingTablesService } from './admin-pricing-tables.service';

@Controller('admin/pricing-tables')
@UseGuards(JwtAuthGuard, AdminOnlyGuard)
export class AdminPricingTablesController {
  constructor(private readonly adminPricingTablesService: AdminPricingTablesService) {}

  @Get()
  list(
    @Query(new ZodValidationPipe(listPricingTablesQuerySchema)) query: ListPricingTablesQuery,
  ): Promise<PricingTableItem[]> {
    return this.adminPricingTablesService.list(query);
  }

  @Post()
  create(
    @Body(new ZodValidationPipe(createPricingTableSchema)) body: CreatePricingTablePayload,
    @CurrentUser() admin: User,
  ): Promise<PricingTableItem> {
    return this.adminPricingTablesService.create(body, admin.id);
  }

  @Patch(':id/deactivate')
  deactivate(@Param('id') id: string, @CurrentUser() admin: User): Promise<PricingTableItem> {
    return this.adminPricingTablesService.deactivate(id, admin.id);
  }

  /** Sem esta rota, desativar era um caminho sem volta. */
  @Patch(':id/reactivate')
  reactivate(@Param('id') id: string, @CurrentUser() admin: User): Promise<PricingTableItem> {
    return this.adminPricingTablesService.reactivate(id, admin.id);
  }
}
