import { Body, Controller, Param, Patch, Post, Put, UseGuards } from '@nestjs/common';
import type { User } from '@prisma/client';
import {
  forceCompleteSchema,
  createDeliverySchema,
  adminMarkFailedSchema,
  manualDeliveryStageSchema,
  reassignDriverSchema,
  type CreateDeliveryPayload,
  type ForceCompletePayload,
  type AdminMarkFailedPayload,
  type ManualDeliveryStagePayload,
  type ReassignDriverPayload,
} from '@motoboycity/validation';
import { AdminOnlyGuard } from '../../auth/admin-only.guard';
import { CurrentUser } from '../../auth/current-user.decorator';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import type { DeliveryDetail } from '../../deliveries/deliveries.service';
import { AdminDeliveriesService } from './admin-deliveries.service';

/**
 * Intervencoes manuais sobre um pedido. Ficam num controller separado, e nao
 * junto das rotas de entrega, porque sao acoes de administrador sobrescrevendo
 * o que aconteceu na rua — o guarda precisa ser obvio a quem le o arquivo.
 */
@Controller('admin/deliveries')
@UseGuards(JwtAuthGuard, AdminOnlyGuard)
export class AdminDeliveriesController {
  constructor(private readonly adminDeliveriesService: AdminDeliveriesService) {}

  @Post('company/:companyId')
  createForCompany(
    @Param('companyId') companyId: string,
    @Body(new ZodValidationPipe(createDeliverySchema)) body: CreateDeliveryPayload,
    @CurrentUser() user: User,
  ): Promise<DeliveryDetail> {
    return this.adminDeliveriesService.createForCompany(user, companyId, body);
  }

  @Put(':id')
  updateBeforeAcceptance(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(createDeliverySchema)) body: CreateDeliveryPayload,
    @CurrentUser() user: User,
  ): Promise<DeliveryDetail> {
    return this.adminDeliveriesService.updateBeforeAcceptance(user, id, body);
  }

  @Patch(':id/driver')
  reassignDriver(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(reassignDriverSchema)) body: ReassignDriverPayload,
    @CurrentUser() user: User,
  ): Promise<DeliveryDetail> {
    return this.adminDeliveriesService.reassignDriver(user, id, body);
  }

  @Patch(':id/collect')
  markCollected(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(manualDeliveryStageSchema)) body: ManualDeliveryStagePayload,
    @CurrentUser() user: User,
  ): Promise<DeliveryDetail> {
    return this.adminDeliveriesService.markCollected(user, id, body);
  }

  @Patch(':id/deliver')
  markDelivered(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(manualDeliveryStageSchema)) body: ManualDeliveryStagePayload,
    @CurrentUser() user: User,
  ): Promise<DeliveryDetail> {
    return this.adminDeliveriesService.markDelivered(user, id, body);
  }

  @Patch(':id/fail')
  markFailed(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(adminMarkFailedSchema)) body: AdminMarkFailedPayload,
    @CurrentUser() user: User,
  ): Promise<DeliveryDetail> {
    return this.adminDeliveriesService.markFailed(user, id, body);
  }

  @Patch(':id/force-complete')
  forceComplete(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(forceCompleteSchema)) body: ForceCompletePayload,
    @CurrentUser() user: User,
  ): Promise<DeliveryDetail> {
    return this.adminDeliveriesService.forceComplete(user, id, body);
  }
}
