import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import type { OperacaoDaLoja } from '@motoboycity/types';
import {
  storeDeliveryAreasSchema,
  storeManualStatusSchema,
  storeNotificationsSchema,
  storeOrderTypesSchema,
  storePaymentsSchema,
  storeScheduleSchema,
  type StoreDeliveryAreasPayload,
  type StoreManualStatusPayload,
  type StoreNotificationsPayload,
  type StoreOrderTypesPayload,
  type StorePaymentsPayload,
  type StoreSchedulePayload,
} from '@motoboycity/validation';
import type { User } from '@prisma/client';
import { CompanyOnlyGuard } from '../../auth/company-only.guard';
import { CurrentUser } from '../../auth/current-user.decorator';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { StoreOperationService } from './store-operation.service';

/** Como a loja online funciona, no painel da empresa. Cada bloco grava sozinho. */
@Controller('company/store/operation')
@UseGuards(JwtAuthGuard, CompanyOnlyGuard)
export class StoreOperationController {
  constructor(private readonly storeOperationService: StoreOperationService) {}

  @Get()
  operation(@CurrentUser() user: User): Promise<OperacaoDaLoja> {
    return this.storeOperationService.operation(user);
  }

  @Put('schedule')
  updateSchedule(
    @CurrentUser() user: User,
    @Body(new ZodValidationPipe(storeScheduleSchema)) body: StoreSchedulePayload,
  ): Promise<OperacaoDaLoja> {
    return this.storeOperationService.updateSchedule(user, body);
  }

  @Put('status')
  updateStatus(
    @CurrentUser() user: User,
    @Body(new ZodValidationPipe(storeManualStatusSchema)) body: StoreManualStatusPayload,
  ): Promise<OperacaoDaLoja> {
    return this.storeOperationService.updateStatus(user, body);
  }

  @Put('order-types')
  updateOrderTypes(
    @CurrentUser() user: User,
    @Body(new ZodValidationPipe(storeOrderTypesSchema)) body: StoreOrderTypesPayload,
  ): Promise<OperacaoDaLoja> {
    return this.storeOperationService.updateOrderTypes(user, body);
  }

  @Put('notifications')
  updateNotifications(
    @CurrentUser() user: User,
    @Body(new ZodValidationPipe(storeNotificationsSchema)) body: StoreNotificationsPayload,
  ): Promise<OperacaoDaLoja> {
    return this.storeOperationService.updateNotifications(user, body);
  }

  @Put('payments')
  updatePayments(
    @CurrentUser() user: User,
    @Body(new ZodValidationPipe(storePaymentsSchema)) body: StorePaymentsPayload,
  ): Promise<OperacaoDaLoja> {
    return this.storeOperationService.updatePayments(user, body);
  }

  @Put('delivery-areas')
  updateDeliveryAreas(
    @CurrentUser() user: User,
    @Body(new ZodValidationPipe(storeDeliveryAreasSchema)) body: StoreDeliveryAreasPayload,
  ): Promise<OperacaoDaLoja> {
    return this.storeOperationService.updateDeliveryAreas(user, body);
  }
}
