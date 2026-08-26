import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import {
  closeInvoicesSchema,
  listInvoicesQuerySchema,
  cancelInvoiceSchema,
  manualInvoiceEligibleQuerySchema,
  manualInvoiceSchema,
  markInvoicePaidSchema,
  updateInvoiceDueDateSchema,
  type CloseInvoicesPayload,
  type ListInvoicesQuery,
  type CancelInvoicePayload,
  type ManualInvoiceEligibleQuery,
  type ManualInvoicePayload,
  type MarkInvoicePaidPayload,
  type UpdateInvoiceDueDatePayload,
} from '@motoboycity/validation';
import type { User } from '@prisma/client';
import { AdminOnlyGuard } from '../auth/admin-only.guard';
import { CompanyOnlyGuard } from '../auth/company-only.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import {
  InvoiceService,
  type CompanyInvoiceDetail,
  type CompanyInvoiceListItem,
  type InvoiceDetail,
  type InvoiceListItem,
  type ManualInvoiceCandidate,
  type ManualInvoicePreview,
} from './invoice.service';

@Controller('admin/financial/invoices')
@UseGuards(JwtAuthGuard, AdminOnlyGuard)
export class AdminInvoicesController {
  constructor(private readonly invoiceService: InvoiceService) {}

  @Get()
  list(
    @Query(new ZodValidationPipe(listInvoicesQuerySchema)) query: ListInvoicesQuery,
  ): Promise<InvoiceListItem[]> {
    return this.invoiceService.listForAdmin(query);
  }

  @Post('close')
  close(
    @Body(new ZodValidationPipe(closeInvoicesSchema)) body: CloseInvoicesPayload,
    @CurrentUser() admin: User,
  ): Promise<InvoiceListItem> {
    return this.invoiceService.closeOpenInvoices(admin, body);
  }

  @Get('manual/candidates')
  manualCandidates(
    @Query(new ZodValidationPipe(manualInvoiceEligibleQuerySchema))
    query: ManualInvoiceEligibleQuery,
  ): Promise<ManualInvoiceCandidate[]> {
    return this.invoiceService.listManualCandidates(query);
  }

  @Post('manual/preview')
  previewManual(
    @Body(new ZodValidationPipe(manualInvoiceSchema)) body: ManualInvoicePayload,
  ): Promise<ManualInvoicePreview> {
    return this.invoiceService.previewManualInvoice(body);
  }

  @Post('manual')
  createManual(
    @Body(new ZodValidationPipe(manualInvoiceSchema)) body: ManualInvoicePayload,
    @CurrentUser() admin: User,
  ): Promise<InvoiceDetail> {
    return this.invoiceService.createManualInvoice(admin, body);
  }

  /**
   * Cancela uma fatura emitida errada, devolvendo as entregas para cobranca.
   *
   * `PATCH` e nao `DELETE`: a fatura continua existindo, com numero e
   * historico. Apagar registro de cobranca deixaria um buraco na numeracao que
   * ninguem consegue explicar depois.
   */
  @Patch(':id/cancel')
  cancel(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(cancelInvoiceSchema)) body: CancelInvoicePayload,
    @CurrentUser() admin: User,
  ): Promise<InvoiceDetail> {
    return this.invoiceService.cancelInvoice(admin, id, body);
  }

  @Get(':id')
  detail(@Param('id') id: string): Promise<InvoiceDetail> {
    return this.invoiceService.detailForAdmin(id);
  }

  @Patch(':id/mark-paid')
  markPaid(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(markInvoicePaidSchema)) body: MarkInvoicePaidPayload,
    @CurrentUser() admin: User,
  ): Promise<InvoiceDetail> {
    return this.invoiceService.markPaid(admin, id, body);
  }

  @Patch(':id/due-date')
  updateDueDate(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateInvoiceDueDateSchema))
    body: UpdateInvoiceDueDatePayload,
    @CurrentUser() admin: User,
  ): Promise<InvoiceDetail> {
    return this.invoiceService.updateDueDate(admin, id, body);
  }
}

@Controller('company/invoices')
@UseGuards(JwtAuthGuard, CompanyOnlyGuard)
export class CompanyInvoicesController {
  constructor(private readonly invoiceService: InvoiceService) {}

  @Get()
  list(
    @Query(new ZodValidationPipe(listInvoicesQuerySchema)) query: ListInvoicesQuery,
    @CurrentUser() companyUser: User,
  ): Promise<CompanyInvoiceListItem[]> {
    return this.invoiceService.listForCompany(companyUser, query);
  }

  @Get(':id')
  detail(@Param('id') id: string, @CurrentUser() companyUser: User): Promise<CompanyInvoiceDetail> {
    return this.invoiceService.detailForCompany(companyUser, id);
  }
}
