import { Body, Controller, Headers, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import {
  asaasWebhookEnvelopeSchema,
  type AsaasWebhookEnvelope,
} from '../../finance/asaas/asaas.schemas';
import { StoreOrdersService } from './store-orders.service';

/**
 * O aviso de pagamento da conta Asaas de cada loja. A URL leva o id da empresa,
 * e o que autoriza é o token que o MOTOboyCity criou para aquela conta ao ligá-la
 * (`asaas-access-token`): a URL sozinha não abre nada.
 */
@Controller('integrations/asaas/stores')
@SkipThrottle()
export class StoreAsaasWebhookController {
  constructor(private readonly storeOrders: StoreOrdersService) {}

  @Post(':companyId/webhook')
  @HttpCode(200)
  receber(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Headers('asaas-access-token') token: string | undefined,
    @Body(new ZodValidationPipe(asaasWebhookEnvelopeSchema)) envelope: AsaasWebhookEnvelope,
  ): Promise<{ received: true }> {
    return this.storeOrders.receberWebhook(companyId, token, envelope);
  }
}
