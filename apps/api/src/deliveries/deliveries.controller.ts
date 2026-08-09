import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import {
  createDeliverySchema,
  listDeliveriesQuerySchema,
  type CreateDeliveryPayload,
  type ListDeliveriesQuery,
} from '@motoboycity/validation';
import type { User } from '@prisma/client';
import { CompanyOnlyGuard } from '../auth/company-only.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { DeliveriesService, type DeliveryDetail, type DeliveryListItem } from './deliveries.service';

@Controller('deliveries')
@UseGuards(JwtAuthGuard)
export class DeliveriesController {
  constructor(private readonly deliveriesService: DeliveriesService) {}

  @Post()
  @UseGuards(CompanyOnlyGuard)
  create(
    @Body(new ZodValidationPipe(createDeliverySchema)) body: CreateDeliveryPayload,
    @CurrentUser() user: User,
  ): Promise<DeliveryDetail> {
    return this.deliveriesService.create(user, body);
  }

  @Get()
  list(
    @Query(new ZodValidationPipe(listDeliveriesQuerySchema)) query: ListDeliveriesQuery,
    @CurrentUser() user: User,
  ): Promise<DeliveryListItem[]> {
    return this.deliveriesService.list(user, query);
  }

  @Get(':id')
  detail(@Param('id') id: string, @CurrentUser() user: User): Promise<DeliveryDetail> {
    return this.deliveriesService.detail(user, id);
  }

  @Patch(':id/cancel')
  cancel(@Param('id') id: string, @CurrentUser() user: User): Promise<DeliveryDetail> {
    return this.deliveriesService.cancel(user, id);
  }
}
