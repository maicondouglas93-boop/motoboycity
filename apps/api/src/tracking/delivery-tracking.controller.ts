import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import {
  listDeliveryTrackingQuerySchema,
  reportDeliveryLocationSchema,
  type ListDeliveryTrackingQuery,
  type ReportDeliveryLocationPayload,
} from '@motoboycity/validation';
import type { User } from '@prisma/client';
import { CurrentUser } from '../auth/current-user.decorator';
import { DriverOnlyGuard } from '../auth/driver-only.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import {
  DeliveryTrackingService,
  type ActiveDeliveryTrackingItem,
  type DeliveryTrackingDetail,
  type DeliveryTrackingPointItem,
} from './delivery-tracking.service';

@Controller('tracking')
@UseGuards(JwtAuthGuard)
export class DeliveryTrackingController {
  constructor(private readonly deliveryTrackingService: DeliveryTrackingService) {}

  @Post('driver/deliveries/:deliveryId/points')
  @UseGuards(DriverOnlyGuard)
  report(
    @Param('deliveryId') deliveryId: string,
    @Body(new ZodValidationPipe(reportDeliveryLocationSchema)) payload: ReportDeliveryLocationPayload,
    @CurrentUser() user: User,
  ): Promise<DeliveryTrackingPointItem> {
    return this.deliveryTrackingService.report(user, deliveryId, payload);
  }

  @Get('deliveries/:deliveryId')
  detail(
    @Param('deliveryId') deliveryId: string,
    @Query(new ZodValidationPipe(listDeliveryTrackingQuerySchema)) query: ListDeliveryTrackingQuery,
    @CurrentUser() user: User,
  ): Promise<DeliveryTrackingDetail> {
    return this.deliveryTrackingService.detail(user, deliveryId, query);
  }

  @Get('active')
  active(@CurrentUser() user: User): Promise<ActiveDeliveryTrackingItem[]> {
    return this.deliveryTrackingService.active(user);
  }
}
