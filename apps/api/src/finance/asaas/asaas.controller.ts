import { Controller, Get, Headers, HttpCode, Param, Post, Body, UseGuards } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { CompanyInvoicePixCharge } from '@motoboycity/types';
import type { User } from '@prisma/client';
import { CompanyOnlyGuard } from '../../auth/company-only.guard';
import { CurrentUser } from '../../auth/current-user.decorator';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AsaasBillingService } from './asaas-billing.service';
import { asaasWebhookEnvelopeSchema, type AsaasWebhookEnvelope } from './asaas.schemas';

@Controller('company/invoices')
@UseGuards(JwtAuthGuard, CompanyOnlyGuard)
export class CompanyInvoicePixController {
  constructor(private readonly billing: AsaasBillingService) {}

  @Get(':id/pix')
  get(
    @Param('id') invoiceId: string,
    @CurrentUser() companyUser: User,
  ): Promise<CompanyInvoicePixCharge | null> {
    return this.billing.getForCompany(companyUser, invoiceId);
  }

  @Post(':id/pix')
  create(
    @Param('id') invoiceId: string,
    @CurrentUser() companyUser: User,
  ): Promise<CompanyInvoicePixCharge> {
    return this.billing.createForCompany(companyUser, invoiceId);
  }
}

@Controller('integrations/asaas')
@SkipThrottle()
export class AsaasWebhookController {
  constructor(private readonly billing: AsaasBillingService) {}

  @Post('webhook')
  @HttpCode(200)
  receive(
    @Headers('asaas-access-token') token: string | undefined,
    @Body(new ZodValidationPipe(asaasWebhookEnvelopeSchema)) body: AsaasWebhookEnvelope,
  ): Promise<{ received: true }> {
    return this.billing.receiveWebhook(token, body);
  }
}
