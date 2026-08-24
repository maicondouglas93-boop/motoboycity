import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import type { User } from '@prisma/client';
import type { PaymentNotice, PaymentNoticeQueueItem } from '@motoboycity/types';
import {
  confirmPaymentNoticeSchema,
  createPaymentNoticeSchema,
  listPaymentNoticesQuerySchema,
  rejectPaymentNoticeSchema,
  type ConfirmPaymentNoticePayload,
  type CreatePaymentNoticePayload,
  type ListPaymentNoticesQuery,
  type RejectPaymentNoticePayload,
} from '@motoboycity/validation';
import { AdminOnlyGuard } from '../auth/admin-only.guard';
import { CompanyOnlyGuard } from '../auth/company-only.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { PaymentNoticeService } from './payment-notice.service';

/**
 * O que a LOJA pode fazer com um aviso: mandar e acompanhar.
 *
 * Nao existe rota aqui que mude o status da fatura. Isso nao e esquecimento —
 * e a regra: o devedor nao da baixa na propria divida.
 */
@Controller('company/invoices')
@UseGuards(JwtAuthGuard, CompanyOnlyGuard)
export class CompanyPaymentNoticeController {
  constructor(private readonly paymentNoticeService: PaymentNoticeService) {}

  @Post(':id/payment-notice')
  create(
    @CurrentUser() companyUser: User,
    @Param('id') invoiceId: string,
    @Body(new ZodValidationPipe(createPaymentNoticeSchema)) payload: CreatePaymentNoticePayload,
  ): Promise<PaymentNotice> {
    return this.paymentNoticeService.create(companyUser, invoiceId, payload);
  }

  @Get(':id/payment-notices')
  list(@CurrentUser() companyUser: User, @Param('id') invoiceId: string): Promise<PaymentNotice[]> {
    return this.paymentNoticeService.listForInvoice(companyUser, invoiceId);
  }
}

/** A fila do admin, e as duas decisoes que ele pode tomar. */
@Controller('admin/payment-notices')
@UseGuards(JwtAuthGuard, AdminOnlyGuard)
export class AdminPaymentNoticeController {
  constructor(private readonly paymentNoticeService: PaymentNoticeService) {}

  @Get()
  queue(
    @Query(new ZodValidationPipe(listPaymentNoticesQuerySchema)) query: ListPaymentNoticesQuery,
  ): Promise<PaymentNoticeQueueItem[]> {
    return this.paymentNoticeService.queue(query.status);
  }

  @Post(':id/confirm')
  confirm(
    @CurrentUser() admin: User,
    @Param('id') noticeId: string,
    @Body(new ZodValidationPipe(confirmPaymentNoticeSchema)) payload: ConfirmPaymentNoticePayload,
  ): Promise<PaymentNotice> {
    return this.paymentNoticeService.confirm(admin, noticeId, payload);
  }

  @Post(':id/reject')
  reject(
    @CurrentUser() admin: User,
    @Param('id') noticeId: string,
    @Body(new ZodValidationPipe(rejectPaymentNoticeSchema)) payload: RejectPaymentNoticePayload,
  ): Promise<PaymentNotice> {
    return this.paymentNoticeService.reject(admin, noticeId, payload);
  }
}
