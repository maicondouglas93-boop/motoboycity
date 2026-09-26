import { Body, Controller, Get, Header, Param, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { PedidoDaLoja } from '@motoboycity/types';
import {
  storeCheckoutSchema,
  storeSlugLookupSchema,
  type StoreCheckoutPayload,
} from '@motoboycity/validation';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ClienteAtual, ClienteDaLojaGuard, type ClienteDaLoja } from './cliente-da-loja.guard';
import { StoreOrdersService } from './store-orders.service';

/**
 * O pedido na página da loja, do lado do cliente: fazer e acompanhar. Exige o
 * cliente logado com o Google (login do Firebase): navegar é livre, comprar
 * pede conta.
 */
@Controller('public/stores/:slug/orders')
@UseGuards(ClienteDaLojaGuard)
export class PublicStoreOrdersController {
  constructor(private readonly storeOrdersService: StoreOrdersService) {}

  @Post()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  checkout(
    @Param('slug', new ZodValidationPipe(storeSlugLookupSchema)) slug: string,
    @ClienteAtual() cliente: ClienteDaLoja,
    @Body(new ZodValidationPipe(storeCheckoutSchema)) pedido: StoreCheckoutPayload,
  ): Promise<PedidoDaLoja> {
    return this.storeOrdersService.checkout(slug, cliente.id, pedido);
  }

  @Get()
  @Header('Cache-Control', 'no-store')
  pedidos(
    @Param('slug', new ZodValidationPipe(storeSlugLookupSchema)) slug: string,
    @ClienteAtual() cliente: ClienteDaLoja,
  ): Promise<PedidoDaLoja[]> {
    return this.storeOrdersService.pedidosDoCliente(slug, cliente.id);
  }
}
