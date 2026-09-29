import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { ConferenciaDoCupom, CupomDisponivel, PedidoDaLoja } from '@motoboycity/types';
import {
  storeCheckoutSchema,
  storeCouponQuoteSchema,
  storeSlugLookupSchema,
  webPushSubscriptionSchema,
  webPushUnsubscribeSchema,
  type StoreCheckoutPayload,
  type StoreCouponQuotePayload,
  type WebPushSubscriptionPayload,
  type WebPushUnsubscribePayload,
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

  /**
   * "Já paguei": confere o Pix no Asaas agora, em vez de esperar o aviso dele.
   * Poucas por minuto: cada uma é uma consulta ao Asaas.
   */
  /**
   * A lista "Cupons" do checkout: os cupons que a loja quis mostrar e que ainda valem para
   * este cliente. Exige o login: o limite por cliente é dele.
   */
  @Get('coupons')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  cuponsDisponiveis(
    @Param('slug', new ZodValidationPipe(storeSlugLookupSchema)) slug: string,
    @ClienteAtual() cliente: ClienteDaLoja,
  ): Promise<CupomDisponivel[]> {
    return this.storeOrdersService.cuponsDisponiveis(slug, cliente.id);
  }

  /**
   * "Aplicar cupom": confere o código para este cliente e esta sacola, e devolve as
   * regras do cupom e o desconto de agora. Não grava nada. O limite é o do pedido:
   * quem tenta adivinhar códigos esbarra nele.
   */
  @Post('coupon')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  conferirCupom(
    @Param('slug', new ZodValidationPipe(storeSlugLookupSchema)) slug: string,
    @ClienteAtual() cliente: ClienteDaLoja,
    @Body(new ZodValidationPipe(storeCouponQuoteSchema)) conferencia: StoreCouponQuotePayload,
  ): Promise<ConferenciaDoCupom> {
    return this.storeOrdersService.conferirCupomDaSacola(slug, cliente.id, conferencia);
  }

  @Post(':id/check-payment')
  @HttpCode(200)
  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  conferirPagamento(
    @Param('slug', new ZodValidationPipe(storeSlugLookupSchema)) slug: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @ClienteAtual() cliente: ClienteDaLoja,
  ): Promise<PedidoDaLoja> {
    return this.storeOrdersService.conferirPagamento(slug, cliente.id, id);
  }

  /** Este aparelho passa a receber os avisos dos pedidos com a página fechada. */
  @Put('push-subscription')
  @HttpCode(204)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async inscrever(
    @Param('slug', new ZodValidationPipe(storeSlugLookupSchema)) slug: string,
    @ClienteAtual() cliente: ClienteDaLoja,
    @Body(new ZodValidationPipe(webPushSubscriptionSchema)) inscricao: WebPushSubscriptionPayload,
  ): Promise<void> {
    await this.storeOrdersService.inscreverAvisosDoCliente(slug, cliente.id, inscricao);
  }

  @Delete('push-subscription')
  @HttpCode(204)
  async cancelarInscricao(
    @Param('slug', new ZodValidationPipe(storeSlugLookupSchema)) slug: string,
    @ClienteAtual() cliente: ClienteDaLoja,
    @Body(new ZodValidationPipe(webPushUnsubscribeSchema)) { endpoint }: WebPushUnsubscribePayload,
  ): Promise<void> {
    await this.storeOrdersService.cancelarAvisosDoCliente(slug, cliente.id, endpoint);
  }
}
