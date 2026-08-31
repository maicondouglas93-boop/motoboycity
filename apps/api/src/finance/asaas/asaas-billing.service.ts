import {
  BadGatewayException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CompanyInvoicePixCharge } from '@motoboycity/types';
import { Prisma, type User } from '@prisma/client';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { dateInSaoPaulo } from '../finance-release.utils';
import { FinancialClock } from '../financial-clock.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AsaasClient, AsaasProviderError, type AsaasPayment } from './asaas.client';
import { readAsaasWebhookToken } from './asaas.config';
import type { AsaasWebhookEnvelope } from './asaas.schemas';

const RESERVATION_TTL_MS = 30_000;
const RECONCILIATION_WAIT_MS = 60_000;

@Injectable()
export class AsaasBillingService {
  private readonly logger = new Logger(AsaasBillingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly client: AsaasClient,
    private readonly config: ConfigService,
    private readonly clock: FinancialClock,
  ) {}

  async getForCompany(user: User, invoiceId: string): Promise<CompanyInvoicePixCharge | null> {
    const invoice = await this.companyInvoice(user, invoiceId);
    const charge = await this.prisma.invoicePixCharge.findUnique({ where: { invoiceId } });
    if (!charge) return null;
    if (charge.status === 'ACTIVE' && charge.providerPaymentId && this.needsQrRefresh(charge)) {
      try {
        return await this.hydrateQrCode(charge.id, charge.providerPaymentId, invoice);
      } catch (error) {
        this.logAsaasFailure('refresh-qr-code', invoice.id, error);
        return this.toResponse(charge, invoice);
      }
    }
    return this.toResponse(charge, invoice);
  }

  async createForCompany(user: User, invoiceId: string): Promise<CompanyInvoicePixCharge> {
    const invoice = await this.companyInvoice(user, invoiceId);
    if (invoice.status !== 'PENDING' && invoice.status !== 'OVERDUE') {
      throw new ConflictException('Somente faturas pendentes ou vencidas podem ser pagas por Pix.');
    }
    if (this.toCents(invoice.totalValue) <= 0) {
      throw new ConflictException('A fatura precisa ter valor positivo para gerar o Pix.');
    }

    let charge = await this.prisma.invoicePixCharge.findUnique({ where: { invoiceId } });
    if (charge?.status === 'RECEIVED') return this.toResponse(charge, invoice);
    if (charge?.status === 'ACTIVE' && charge.providerPaymentId) {
      if (!this.needsQrRefresh(charge)) return this.toResponse(charge, invoice);
      try {
        return await this.hydrateQrCode(charge.id, charge.providerPaymentId, invoice);
      } catch (error) {
        this.logAsaasFailure('refresh-qr-code', invoice.id, error);
        throw this.publicAsaasException(
          error,
          'Não foi possível atualizar o QR Code. Tente novamente.',
        );
      }
    }

    let ownsReservation = false;
    if (!charge) {
      try {
        charge = await this.prisma.invoicePixCharge.create({
          data: {
            invoiceId,
            externalReference: this.invoiceReference(invoiceId),
            status: 'CREATING',
          },
        });
        ownsReservation = true;
      } catch (error) {
        if (!this.isUniqueViolation(error)) throw error;
        charge = await this.prisma.invoicePixCharge.findUniqueOrThrow({ where: { invoiceId } });
      }
    }

    if (!ownsReservation) {
      const reconciled = await this.reconcilePayment(charge, invoice);
      if (reconciled) return reconciled;

      if (
        charge.status === 'CREATING' &&
        this.clock.now().getTime() - charge.updatedAt.getTime() < RESERVATION_TTL_MS
      ) {
        throw new ConflictException('O Pix já está sendo gerado. Aguarde alguns segundos e tente novamente.');
      }
      if (
        charge.status === 'RECONCILIATION_REQUIRED' &&
        this.clock.now().getTime() - charge.updatedAt.getTime() < RECONCILIATION_WAIT_MS
      ) {
        throw new ConflictException(
          'A confirmação do Asaas ainda está em processamento. Aguarde um minuto e tente novamente.',
        );
      }

      const externalReference =
        charge.status === 'FAILED' || charge.status === 'CANCELLED'
          ? this.invoiceReference(invoiceId)
          : charge.externalReference;
      const claimed = await this.prisma.invoicePixCharge.updateMany({
        where: { id: charge.id, status: charge.status, updatedAt: charge.updatedAt },
        data: {
          status: 'CREATING',
          externalReference,
          providerPaymentId: null,
          providerCustomerId: null,
          providerStatus: null,
          pixPayload: null,
          pixEncodedImage: null,
          expiresAt: null,
          receivedAt: null,
          errorCode: null,
        },
      });
      if (claimed.count !== 1) {
        throw new ConflictException('A cobrança foi alterada por outra solicitação. Atualize e tente novamente.');
      }
      charge = await this.prisma.invoicePixCharge.findUniqueOrThrow({ where: { id: charge.id } });
    }

    try {
      const customerId = await this.ensureCustomer(invoice.company);
      const invoiceDueDate = invoice.dueDate.toISOString().slice(0, 10);
      const providerDueDate = [invoiceDueDate, dateInSaoPaulo(this.clock.now())].sort().at(-1)!;
      const payment = await this.client.createPixPayment({
        customer: customerId,
        value: this.toCents(invoice.totalValue) / 100,
        // O Asaas recebe hoje como vencimento operacional quando a fatura já
        // está vencida; a data original continua imutável na nossa fatura.
        dueDate: providerDueDate,
        description: `Fatura ${invoice.number} - MOTOboyCity`,
        externalReference: charge.externalReference,
      });
      this.assertPaymentMatches(payment, charge.externalReference, customerId, invoice.totalValue);
      await this.prisma.invoicePixCharge.update({
        where: { id: charge.id },
        data: {
          providerPaymentId: payment.id,
          providerCustomerId: customerId,
          providerStatus: payment.status,
          status: 'ACTIVE',
          receivedAt: null,
          errorCode: null,
        },
      });
      return this.hydrateQrCode(charge.id, payment.id, invoice);
    } catch (error) {
      this.logAsaasFailure('create-pix', invoice.id, error);
      const persisted = await this.prisma.invoicePixCharge.findUnique({
        where: { id: charge.id },
        select: { providerPaymentId: true, status: true },
      });
      if (persisted?.providerPaymentId && persisted.status === 'ACTIVE') {
        throw new BadGatewayException(
          'A cobrança foi criada, mas o QR Code ainda não carregou. Tente novamente.',
        );
      }
      const unknown = error instanceof AsaasProviderError && error.outcomeUnknown;
      await this.prisma.invoicePixCharge.updateMany({
        where: { id: charge.id, status: 'CREATING' },
        data: {
          status: unknown ? 'RECONCILIATION_REQUIRED' : 'FAILED',
          errorCode: this.safeAsaasErrorCode(error),
        },
      });
      if (error instanceof ConflictException) throw error;
      throw this.publicAsaasException(
        error,
        unknown
          ? 'O Asaas não confirmou se criou a cobrança. Tente novamente para reconciliar sem duplicar.'
          : 'Não foi possível gerar o Pix no Asaas. Tente novamente em instantes.',
      );
    }
  }

  async receiveWebhook(
    suppliedToken: string | undefined,
    envelope: AsaasWebhookEnvelope,
  ): Promise<{ received: true }> {
    this.assertWebhookToken(suppliedToken);

    await this.prisma.$transaction(async (tx) => {
      const inserted = await tx.asaasWebhookEvent.createMany({
        data: {
          id: envelope.id,
          eventType: envelope.event,
          providerPaymentId: envelope.payment?.id ?? null,
        },
        skipDuplicates: true,
      });
      if (inserted.count === 0) return;

      if (envelope.event !== 'PAYMENT_RECEIVED' || !envelope.payment) {
        await this.finishEvent(tx, envelope.id, 'IGNORED', 'Evento sem baixa financeira.');
        return;
      }

      const charge = await tx.invoicePixCharge.findUnique({
        where: { providerPaymentId: envelope.payment.id },
        include: { invoice: true },
      });
      if (!charge) {
        await this.finishEvent(tx, envelope.id, 'IGNORED', 'Cobrança não pertence à plataforma.');
        return;
      }

      const mismatch = this.webhookMismatch(charge, envelope.payment);
      if (mismatch) {
        this.logger.error(`Webhook Asaas ${envelope.id} ignorado: ${mismatch}`);
        await tx.asaasWebhookEvent.update({
          where: { id: envelope.id },
          data: { chargeId: charge.id },
        });
        await this.finishEvent(tx, envelope.id, 'IGNORED', mismatch);
        return;
      }

      await tx.invoicePixCharge.update({
        where: { id: charge.id },
        data: {
          status: 'RECEIVED',
          providerStatus: envelope.payment.status,
          receivedAt: this.clock.now(),
          errorCode: null,
        },
      });

      if (charge.invoice.status === 'PENDING' || charge.invoice.status === 'OVERDUE') {
        const paymentDate = this.validPaymentDate(envelope.payment) ?? dateInSaoPaulo(this.clock.now());
        const updated = await tx.invoice.updateMany({
          where: { id: charge.invoiceId, status: charge.invoice.status },
          data: { status: 'PAID', paymentDate: this.dateOnly(paymentDate), paymentMethod: 'ONLINE' },
        });
        if (updated.count !== 1) throw new Error('INVOICE_CONCURRENT_TRANSITION');
        await tx.invoiceStatusHistory.create({
          data: {
            invoiceId: charge.invoiceId,
            fromStatus: charge.invoice.status,
            toStatus: 'PAID',
            changedByUserId: null,
            note: `Pagamento Pix confirmado pelo Asaas (evento ${envelope.id}).`,
          },
        });
      } else if (charge.invoice.status === 'CANCELLED') {
        this.logger.error(
          `Pagamento Asaas ${envelope.payment.id} recebido para fatura cancelada ${charge.invoiceId}.`,
        );
        await tx.asaasWebhookEvent.update({
          where: { id: envelope.id },
          data: { chargeId: charge.id },
        });
        await this.finishEvent(
          tx,
          envelope.id,
          'IGNORED',
          'Pagamento recebido para fatura cancelada; exige conciliação manual.',
        );
        return;
      } else if (charge.invoice.paymentMethod !== 'ONLINE') {
        this.logger.error(
          `Pagamento Asaas ${envelope.payment.id} recebido para fatura ${charge.invoiceId} já baixada por outro meio.`,
        );
        await tx.asaasWebhookEvent.update({
          where: { id: envelope.id },
          data: { chargeId: charge.id },
        });
        await this.finishEvent(
          tx,
          envelope.id,
          'IGNORED',
          'Fatura já estava paga por outro meio; exige conciliação manual.',
        );
        return;
      }

      await tx.asaasWebhookEvent.update({
        where: { id: envelope.id },
        data: { chargeId: charge.id },
      });
      await this.finishEvent(tx, envelope.id, 'PROCESSED', 'Pagamento Pix conciliado.');
    });

    return { received: true };
  }

  private async companyInvoice(user: User, invoiceId: string) {
    if (user.type !== 'COMPANY_MEMBER') throw new ForbiddenException('Acesso restrito a empresas.');
    const membership = await this.prisma.companyTeamMember.findFirst({
      where: { userId: user.id, active: true },
      select: { companyId: true },
    });
    if (!membership) throw new ForbiddenException('Usuário não está vinculado a uma empresa.');
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        company: {
          include: {
            teamMembers: {
              where: { active: true },
              take: 10,
              orderBy: { joinedAt: 'asc' },
              include: { user: { select: { email: true, phone: true } } },
            },
          },
        },
      },
    });
    if (!invoice) throw new NotFoundException('Fatura não encontrada.');
    if (invoice.companyId !== membership.companyId) {
      throw new ForbiddenException('Você não tem acesso a esta fatura.');
    }
    return invoice;
  }

  private async ensureCustomer(company: {
    id: string;
    tradeName: string;
    document: string;
    teamMembers: Array<{ role: string; user: { email: string; phone: string } }>;
  }): Promise<string> {
    const document = company.document.replace(/\D/g, '');
    if (document.length !== 11 && document.length !== 14) {
      throw new ConflictException('O CPF/CNPJ da empresa precisa estar válido antes de gerar o Pix.');
    }
    const externalReference = `motoboycity-company-${company.id}`;
    let record = await this.prisma.asaasCustomer.findUnique({ where: { companyId: company.id } });
    let ownsReservation = false;
    if (!record) {
      try {
        record = await this.prisma.asaasCustomer.create({ data: { companyId: company.id } });
        ownsReservation = true;
      } catch (error) {
        if (!this.isUniqueViolation(error)) throw error;
        record = await this.prisma.asaasCustomer.findUniqueOrThrow({ where: { companyId: company.id } });
      }
    }
    if (record.status === 'ACTIVE' && record.providerCustomerId) return record.providerCustomerId;

    const existingProviderId = await this.client.findCustomerByExternalReference(externalReference);
    if (existingProviderId) {
      await this.prisma.asaasCustomer.update({
        where: { id: record.id },
        data: { status: 'ACTIVE', providerCustomerId: existingProviderId, errorCode: null },
      });
      return existingProviderId;
    }
    if (
      !ownsReservation &&
      record.status === 'CREATING' &&
      this.clock.now().getTime() - record.updatedAt.getTime() < RESERVATION_TTL_MS
    ) {
      throw new ConflictException('O cadastro financeiro da empresa já está sendo criado. Tente novamente.');
    }
    if (!ownsReservation) {
      const claimed = await this.prisma.asaasCustomer.updateMany({
        where: { id: record.id, status: record.status, updatedAt: record.updatedAt },
        data: { status: 'CREATING', errorCode: null },
      });
      if (claimed.count !== 1) throw new ConflictException('Cadastro financeiro em atualização.');
    }

    try {
      const contact =
        company.teamMembers.find((member) => member.role === 'OWNER')?.user ??
        company.teamMembers[0]?.user;
      const providerCustomerId = await this.client.createCustomer({
        name: company.tradeName,
        cpfCnpj: document,
        externalReference,
        ...(contact?.email ? { email: contact.email } : {}),
        ...(contact?.phone ? { mobilePhone: contact.phone.replace(/\D/g, '') } : {}),
      });
      await this.prisma.asaasCustomer.update({
        where: { id: record.id },
        data: { status: 'ACTIVE', providerCustomerId, errorCode: null },
      });
      return providerCustomerId;
    } catch (error) {
      await this.prisma.asaasCustomer.update({
        where: { id: record.id },
        data: {
          status: 'FAILED',
          errorCode: this.safeAsaasErrorCode(error),
        },
      });
      throw error;
    }
  }

  private async reconcilePayment(
    charge: { id: string; externalReference: string; providerCustomerId: string | null },
    invoice: Awaited<ReturnType<AsaasBillingService['companyInvoice']>>,
  ) {
    let payment: AsaasPayment | null;
    try {
      payment = await this.client.findPaymentByExternalReference(charge.externalReference);
    } catch (error) {
      this.logAsaasFailure('reconcile-pix', invoice.id, error);
      throw this.publicAsaasException(
        error,
        'Não foi possível consultar a cobrança no Asaas. Tente novamente.',
      );
    }
    if (!payment) return null;
    const customer = await this.prisma.asaasCustomer.findUnique({
      where: { companyId: invoice.companyId },
      select: { providerCustomerId: true },
    });
    const expectedCustomerId = charge.providerCustomerId ?? customer?.providerCustomerId;
    if (!expectedCustomerId) {
      throw new ConflictException('A cobrança encontrada não possui cliente Asaas conciliado.');
    }
    this.assertPaymentMatches(
      payment,
      charge.externalReference,
      expectedCustomerId,
      invoice.totalValue,
    );
    await this.prisma.invoicePixCharge.update({
      where: { id: charge.id },
      data: {
        providerPaymentId: payment.id,
        providerCustomerId: payment.customer,
        providerStatus: payment.status,
        status: 'ACTIVE',
        receivedAt: null,
        errorCode: null,
      },
    });
    return this.hydrateQrCode(charge.id, payment.id, invoice);
  }

  private async hydrateQrCode(
    chargeId: string,
    paymentId: string,
    invoice: Awaited<ReturnType<AsaasBillingService['companyInvoice']>>,
  ): Promise<CompanyInvoicePixCharge> {
    const qr = await this.client.getPixQrCode(paymentId);
    const expiration = new Date(qr.expirationDate);
    const updated = await this.prisma.invoicePixCharge.update({
      where: { id: chargeId },
      data: {
        pixPayload: qr.payload,
        pixEncodedImage: qr.encodedImage,
        expiresAt: Number.isNaN(expiration.getTime()) ? null : expiration,
      },
    });
    return this.toResponse(updated, invoice);
  }

  private assertPaymentMatches(
    payment: AsaasPayment,
    externalReference: string,
    customerId: string,
    invoiceValue: { toString(): string },
  ) {
    if (
      payment.externalReference !== externalReference ||
      payment.customer !== customerId ||
      payment.billingType !== 'PIX' ||
      Math.round(payment.value * 100) !== this.toCents(invoiceValue)
    ) {
      throw new ConflictException('A cobrança retornada pelo Asaas não corresponde à fatura.');
    }
  }

  private webhookMismatch(
    charge: {
      externalReference: string;
      providerCustomerId: string | null;
      invoice: { totalValue: { toString(): string } };
    },
    payment: NonNullable<AsaasWebhookEnvelope['payment']>,
  ): string | null {
    if (payment.status !== 'RECEIVED') return 'PAYMENT_RECEIVED sem status RECEIVED.';
    if (payment.billingType !== 'PIX') return 'Forma de pagamento diferente de PIX.';
    if (payment.externalReference !== charge.externalReference) return 'External reference divergente.';
    if (!charge.providerCustomerId || payment.customer !== charge.providerCustomerId) {
      return 'Cliente Asaas divergente.';
    }
    if (Math.round(payment.value * 100) !== this.toCents(charge.invoice.totalValue)) {
      return 'Valor recebido diverge do total da fatura.';
    }
    return null;
  }

  private assertWebhookToken(suppliedToken: string | undefined) {
    const expected = readAsaasWebhookToken(this.config);
    if (!suppliedToken || !expected) throw new UnauthorizedException('Webhook não autorizado.');
    const supplied = Buffer.from(suppliedToken);
    const configured = Buffer.from(expected);
    if (supplied.length !== configured.length || !timingSafeEqual(supplied, configured)) {
      throw new UnauthorizedException('Webhook não autorizado.');
    }
  }

  private async finishEvent(
    tx: Prisma.TransactionClient,
    id: string,
    status: 'PROCESSED' | 'IGNORED',
    note: string,
  ) {
    await tx.asaasWebhookEvent.update({
      where: { id },
      data: { status, note, processedAt: this.clock.now() },
    });
  }

  private validPaymentDate(payment: NonNullable<AsaasWebhookEnvelope['payment']>): string | null {
    for (const value of [payment.paymentDate, payment.clientPaymentDate]) {
      if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) continue;
      const parsed = new Date(`${value}T00:00:00.000Z`);
      if (!Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value) {
        return value;
      }
    }
    return null;
  }

  private dateOnly(value: string): Date {
    return new Date(`${value}T00:00:00.000Z`);
  }

  private invoiceReference(invoiceId: string): string {
    return `motoboycity-invoice-${invoiceId}-${randomUUID()}`;
  }

  private toCents(value: { toString(): string }): number {
    return Math.round(Number(value.toString()) * 100);
  }

  private toResponse(
    charge: {
      invoiceId: string;
      status: CompanyInvoicePixCharge['status'];
      pixPayload: string | null;
      pixEncodedImage: string | null;
      expiresAt: Date | null;
      receivedAt: Date | null;
    },
    invoice: { number: string; totalValue: { toString(): string } },
  ): CompanyInvoicePixCharge {
    return {
      invoiceId: charge.invoiceId,
      invoiceNumber: invoice.number,
      status: charge.status,
      totalValue: Number(invoice.totalValue.toString()),
      pixPayload: charge.pixPayload,
      pixEncodedImage: charge.pixEncodedImage,
      expiresAt: charge.expiresAt?.toISOString() ?? null,
      receivedAt: charge.receivedAt?.toISOString() ?? null,
    };
  }

  private needsQrRefresh(charge: {
    pixPayload: string | null;
    pixEncodedImage: string | null;
    expiresAt: Date | null;
  }): boolean {
    return (
      !charge.pixPayload ||
      !charge.pixEncodedImage ||
      (charge.expiresAt !== null && charge.expiresAt.getTime() <= this.clock.now().getTime())
    );
  }

  private safeAsaasErrorCode(error: unknown): string {
    if (error instanceof AsaasProviderError) {
      return [error.operation, error.code, error.httpStatus, error.providerCode]
        .filter((part) => part !== undefined && part !== '')
        .join(':')
        .slice(0, 80);
    }
    if (error instanceof HttpException) return `HTTP_${error.getStatus()}`;
    return 'UNEXPECTED_ERROR';
  }

  private logAsaasFailure(context: string, invoiceId: string, error: unknown): void {
    if (error instanceof AsaasProviderError) {
      this.logger.error(
        `Asaas ${context} falhou invoiceId=${invoiceId} operation=${error.operation} code=${error.code} httpStatus=${error.httpStatus ?? 'none'} providerCode=${error.providerCode ?? 'none'} outcomeUnknown=${error.outcomeUnknown}`,
      );
      return;
    }
    const errorType =
      error instanceof Error ? error.constructor.name.replace(/[^a-zA-Z0-9_.-]/g, '_') : 'unknown';
    const httpStatus = error instanceof HttpException ? error.getStatus() : 'none';
    this.logger.error(
      `Asaas ${context} falhou invoiceId=${invoiceId} errorType=${errorType} httpStatus=${httpStatus}`,
    );
  }

  private publicAsaasException(error: unknown, fallbackMessage: string): HttpException {
    if (error instanceof HttpException) return error;
    if (!(error instanceof AsaasProviderError)) {
      return new BadGatewayException(fallbackMessage);
    }
    if (error.httpStatus === 401) {
      if (error.providerCode === 'invalid_environment') {
        return new BadGatewayException(
          'A chave do Asaas não pertence ao ambiente configurado. Use chave Sandbox com ASAAS_ENVIRONMENT=sandbox.',
        );
      }
      if (error.providerCode === 'invalid_access_token_format') {
        return new BadGatewayException(
          'O formato da chave do Asaas está inválido. Confira se ela foi copiada completa, incluindo o caractere $.',
        );
      }
      if (error.providerCode === 'invalid_access_token') {
        return new BadGatewayException(
          'A chave do Asaas está inválida ou foi revogada. Gere ou ative uma chave no painel Asaas.',
        );
      }
      if (error.providerCode === 'access_token_not_found') {
        return new BadGatewayException(
          'A chave do Asaas não chegou ao provedor. Confira ASAAS_API_KEY no servidor.',
        );
      }
      return new BadGatewayException(
        'A credencial do Asaas foi recusada. Confira ASAAS_ENVIRONMENT e ASAAS_API_KEY no servidor.',
      );
    }
    if (error.httpStatus === 403) {
      return new BadGatewayException(
        'O Asaas recusou o acesso desta integração. Confira as permissões da chave no painel Asaas.',
      );
    }
    if (error.httpStatus === 400) {
      return new BadGatewayException(
        'O Asaas recusou os dados enviados. Confira o cadastro financeiro da empresa.',
      );
    }
    if (error.httpStatus === 429) {
      return new BadGatewayException(
        'O Asaas limitou temporariamente as solicitações. Aguarde alguns segundos e tente novamente.',
      );
    }
    if (error.code === 'NETWORK_OR_TIMEOUT' || (error.httpStatus ?? 0) >= 500) {
      return new BadGatewayException(
        'O Asaas está indisponível ou demorou para responder. Tente novamente em instantes.',
      );
    }
    return new BadGatewayException(fallbackMessage);
  }

  private isUniqueViolation(error: unknown): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
  }
}
