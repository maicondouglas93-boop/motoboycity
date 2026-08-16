import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import {
  createDeliverySchema,
  createDeliveryBatchSchema,
  completeReturnSchema,
  markDeliveredSchema,
  type CompleteReturnPayload,
  type CreateDeliveryBatchPayload,
  listDeliveriesQuerySchema,
  type CreateDeliveryPayload,
  type ListDeliveriesQuery,
  type MarkDeliveredPayload,
} from '@motoboycity/validation';
import type { User } from '@prisma/client';
import { CompanyOnlyGuard } from '../auth/company-only.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { DriverOnlyGuard } from '../auth/driver-only.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import {
  DeliveriesService,
  type DeliveryBatchDetail,
  type DeliveryDetail,
  type DeliveryGroupResult,
  type DeliveryListItem,
} from './deliveries.service';

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

  @Post('batch')
  @UseGuards(CompanyOnlyGuard)
  createBatch(
    @Body(new ZodValidationPipe(createDeliveryBatchSchema)) body: CreateDeliveryBatchPayload,
    @CurrentUser() user: User,
  ): Promise<DeliveryBatchDetail> {
    return this.deliveriesService.createBatch(user, body);
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

  @Patch(':id/collect')
  @UseGuards(DriverOnlyGuard)
  collect(@Param('id') id: string, @CurrentUser() user: User): Promise<DeliveryGroupResult> {
    return this.deliveriesService.collect(user, id);
  }

  @Patch(':id/deliver')
  @UseGuards(DriverOnlyGuard)
  deliver(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(markDeliveredSchema)) body: MarkDeliveredPayload,
    @CurrentUser() user: User,
  ): Promise<DeliveryDetail> {
    return this.deliveriesService.markDelivered(user, id, body);
  }

  @Patch(':id/complete-return')
  @UseGuards(DriverOnlyGuard)
  completeReturn(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(completeReturnSchema)) body: CompleteReturnPayload,
    @CurrentUser() user: User,
  ): Promise<DeliveryGroupResult> {
    return this.deliveriesService.completeReturn(user, id, body);
  }
}
