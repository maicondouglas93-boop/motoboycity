import { Body, Controller, Get, Header, Param, Post, Put, UseGuards } from '@nestjs/common';
import type { PedidoDaLoja } from '@motoboycity/types';
import {
  storeOrderCancelSchema,
  storeOrderStageSchema,
  type StoreOrderCancelPayload,
  type StoreOrderStagePayload,
} from '@motoboycity/validation';
import type { User } from '@prisma/client';
import { CompanyOnlyGuard } from '../../auth/company-only.guard';
import { CurrentUser } from '../../auth/current-user.decorator';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { StoreOrdersService } from './store-orders.service';

/** Os pedidos da loja online, no painel da empresa: a fila de Vendas e o que fazer com cada um. */
@Controller('company/store/orders')
@UseGuards(JwtAuthGuard, CompanyOnlyGuard)
export class StoreOrdersController {
  constructor(private readonly storeOrdersService: StoreOrdersService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  vendas(@CurrentUser() user: User): Promise<PedidoDaLoja[]> {
    return this.storeOrdersService.vendas(user);
  }

  @Put(':id/stage')
  avancar(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(storeOrderStageSchema)) body: StoreOrderStagePayload,
  ): Promise<PedidoDaLoja> {
    return this.storeOrdersService.avancarEtapa(user, id, body);
  }

  @Post(':id/cancel')
  cancelar(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(storeOrderCancelSchema)) body: StoreOrderCancelPayload,
  ): Promise<PedidoDaLoja> {
    return this.storeOrdersService.cancelar(user, id, body.motivo);
  }

  @Post(':id/call-motoboycity')
  chamarMotoboy(@CurrentUser() user: User, @Param('id') id: string): Promise<PedidoDaLoja> {
    return this.storeOrdersService.chamarMotoboy(user, id);
  }

  /** A corrida não nasceu, ou a central a cancelou: chama o motoboy de novo. */
  @Post(':id/ride')
  chamarDeNovo(@CurrentUser() user: User, @Param('id') id: string): Promise<PedidoDaLoja> {
    return this.storeOrdersService.chamarDeNovo(user, id);
  }

  /** O pedido que o MOTOboyCity não vai levar passa ao entregador da loja. */
  @Post(':id/own-courier')
  entregarComALoja(@CurrentUser() user: User, @Param('id') id: string): Promise<PedidoDaLoja> {
    return this.storeOrdersService.entregarComALoja(user, id);
  }
}
