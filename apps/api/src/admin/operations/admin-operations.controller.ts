import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import {
  adminActivityQuerySchema,
  deliveryOperationsQuerySchema,
  type AdminActivityQuery,
  type DeliveryOperationsQuery,
} from '@motoboycity/validation';
import type {
  AdminDeliveryDispatchAudit,
  AdminOperationsResult,
  OperationalActivityEvent,
  SilentDriverItem,
} from '@motoboycity/types';
import type { User } from '@prisma/client';
import { AdminOnlyGuard } from '../../auth/admin-only.guard';
import { CurrentUser } from '../../auth/current-user.decorator';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AdminOperationsService } from './admin-operations.service';

@Controller('admin/operations')
@UseGuards(JwtAuthGuard, AdminOnlyGuard)
export class AdminOperationsController {
  constructor(private readonly service: AdminOperationsService) {}

  @Get()
  overview(
    @Query(new ZodValidationPipe(deliveryOperationsQuerySchema)) query: DeliveryOperationsQuery,
    @CurrentUser() user: User,
  ): Promise<AdminOperationsResult> {
    return this.service.overview(user, query);
  }

  @Get('activity')
  activity(
    @Query(new ZodValidationPipe(adminActivityQuerySchema)) query: AdminActivityQuery,
  ): Promise<OperationalActivityEvent[]> {
    return this.service.activity(query);
  }

  /**
   * Quem esta com pedido em andamento e parou de mandar posicao.
   *
   * Fica no painel do admin porque e o lado que SEMPRE funciona: o aviso ao
   * motoboy depende do app dele estar vivo, e o caso mais grave e justamente
   * aquele em que nao esta.
   */
  @Get('silent-drivers')
  silentDrivers(): Promise<SilentDriverItem[]> {
    return this.service.silentDrivers();
  }

  @Get('deliveries/:id/dispatch-audit')
  dispatchAudit(@Param('id') id: string): Promise<AdminDeliveryDispatchAudit> {
    return this.service.dispatchAudit(id);
  }
}
