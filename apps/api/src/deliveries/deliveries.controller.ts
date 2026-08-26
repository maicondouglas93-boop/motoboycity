import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import {
  createDeliverySchema,
  createDeliveryBatchSchema,
  completeReturnSchema,
  markDeliveredSchema,
  markCollectedSchema,
  markFailedSchema,
  returnToQueueSchema,
  type MarkCollectedPayload,
  type MarkFailedPayload,
  type ReturnToQueuePayload,
  type CompleteReturnPayload,
  type CreateDeliveryBatchPayload,
  cancelDeliverySchema,
  listDeliveriesQuerySchema,
  deliveryOperationsQuerySchema,
  searchDeliveriesQuerySchema,
  deliverySummaryQuerySchema,
  deliveryStageTimesQuerySchema,
  type DeliveryStageTimesQuery,
  type CreateDeliveryPayload,
  type CancelDeliveryPayload,
  type ListDeliveriesQuery,
  type DeliveryOperationsQuery,
  type SearchDeliveriesQuery,
  type DeliverySummaryQuery,
  type MarkDeliveredPayload,
} from '@motoboycity/validation';
import type {
  DeliveryOperationsResult,
  DeliverySearchResult,
  DeliverySummaryResult,
  DeliveryStageTimesResult,
} from '@motoboycity/types';
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

  @Get('operations')
  operations(
    @Query(new ZodValidationPipe(deliveryOperationsQuerySchema)) query: DeliveryOperationsQuery,
    @CurrentUser() user: User,
  ): Promise<DeliveryOperationsResult> {
    return this.deliveriesService.operations(user, query);
  }

  /**
   * Precisa vir antes de `@Get(':id')`: o Nest casa as rotas na ordem de
   * declaracao, e um segmento estatico depois do parametro nunca seria
   * alcancado — "stage-times" viraria um id.
   */
  @Get('stage-times')
  stageTimes(
    @Query(new ZodValidationPipe(deliveryStageTimesQuerySchema)) query: DeliveryStageTimesQuery,
    @CurrentUser() user: User,
  ): Promise<DeliveryStageTimesResult> {
    return this.deliveriesService.stageTimes(user, query);
  }

  @Get('search')
  search(
    @Query(new ZodValidationPipe(searchDeliveriesQuerySchema)) query: SearchDeliveriesQuery,
    @CurrentUser() user: User,
  ): Promise<DeliverySearchResult> {
    return this.deliveriesService.search(user, query);
  }

  @Get('summary')
  summary(
    @Query(new ZodValidationPipe(deliverySummaryQuerySchema)) query: DeliverySummaryQuery,
    @CurrentUser() user: User,
  ): Promise<DeliverySummaryResult> {
    return this.deliveriesService.summary(user, query);
  }

  @Get(':id/group')
  group(@Param('id') id: string, @CurrentUser() user: User): Promise<DeliveryGroupResult> {
    return this.deliveriesService.group(user, id);
  }

  @Get(':id')
  detail(@Param('id') id: string, @CurrentUser() user: User): Promise<DeliveryDetail> {
    return this.deliveriesService.detail(user, id);
  }

  /**
   * Corpo opcional: as telas que cancelam sem motivo continuam funcionando.
   * Admin e motoboy podem mandar um motivo, que vira nota no historico.
   */
  @Patch(':id/cancel')
  cancel(
    @Param('id') id: string,
    @CurrentUser() user: User,
    @Body(new ZodValidationPipe(cancelDeliverySchema)) payload: CancelDeliveryPayload,
  ): Promise<DeliveryDetail> {
    return this.deliveriesService.cancel(user, id, payload.reason);
  }

  @Patch(':id/redispatch')
  redispatch(@Param('id') id: string, @CurrentUser() user: User): Promise<DeliveryDetail> {
    return this.deliveriesService.redispatch(user, id);
  }

  /**
   * O corpo e opcional: a coleta normal nao manda nada. `occurredAt` so aparece
   * quando o motoboy esqueceu de tocar na hora e esta declarando o horario.
   */
  @Patch(':id/collect')
  @UseGuards(DriverOnlyGuard)
  collect(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(markCollectedSchema)) body: MarkCollectedPayload,
    @CurrentUser() user: User,
  ): Promise<DeliveryGroupResult> {
    return this.deliveriesService.collect(user, id, body);
  }

  /**
   * Insucesso: coletou mas nao conseguiu entregar. Nao fecha o pedido — ele
   * vai para FAILED e so encerra quando o motoboy confirmar o retorno da
   * mercadoria na loja, pelo mesmo `complete-return`.
   */
  @Patch(':id/fail')
  @UseGuards(DriverOnlyGuard)
  fail(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(markFailedSchema)) body: MarkFailedPayload,
    @CurrentUser() user: User,
  ): Promise<DeliveryDetail> {
    return this.deliveriesService.markFailed(user, id, body);
  }

  /**
   * Devolver a fila: aceitou e nao vai conseguir entregar. Fica ao lado de
   * `fail` porque e a mesma familia de acao — desistir de um pedido — so que
   * ANTES da coleta, quando ainda nao ha mercadoria em posse do motoboy.
   */
  @Patch(':id/return-to-queue')
  @UseGuards(DriverOnlyGuard)
  returnToQueue(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(returnToQueueSchema)) body: ReturnToQueuePayload,
    @CurrentUser() user: User,
  ): Promise<{ deliveryId: string; displayNumber: number; returnedCount: number }> {
    return this.deliveriesService.returnToQueue(user, id, body);
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
