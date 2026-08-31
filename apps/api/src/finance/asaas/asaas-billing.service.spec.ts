import {
  BadGatewayException,
  ForbiddenException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { AsaasBillingService } from './asaas-billing.service';
import { AsaasProviderError, type AsaasClient } from './asaas.client';
import type { PrismaService } from '../../prisma/prisma.service';
import type { FinancialClock } from '../financial-clock.service';
import type { User } from '@prisma/client';

const NOW = new Date('2026-08-31T15:00:00.000Z');
const WEBHOOK_TOKEN = 'w'.repeat(40);

function subject(options?: { inserted?: number; invoiceStatus?: string; paymentValue?: number }) {
  const tx = {
    asaasWebhookEvent: {
      createMany: jest.fn().mockResolvedValue({ count: options?.inserted ?? 1 }),
      update: jest.fn().mockResolvedValue({}),
    },
    invoicePixCharge: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'charge-1',
        invoiceId: 'invoice-1',
        externalReference: 'invoice-ref',
        providerCustomerId: 'cus-1',
        invoice: {
          id: 'invoice-1',
          status: options?.invoiceStatus ?? 'PENDING',
          totalValue: { toString: () => '25.50' },
        },
      }),
      update: jest.fn().mockResolvedValue({}),
    },
    invoice: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    invoiceStatusHistory: { create: jest.fn().mockResolvedValue({}) },
  };
  const prisma = {
    $transaction: jest.fn(async (operation: (client: typeof tx) => Promise<unknown>) => operation(tx)),
  } as unknown as PrismaService;
  const config = {
    get: jest.fn((key: string) =>
      ({
        ASAAS_API_KEY: 'api-key',
        ASAAS_WEBHOOK_TOKEN: WEBHOOK_TOKEN,
        ASAAS_ENVIRONMENT: 'sandbox',
      })[key],
    ),
  } as unknown as ConfigService;
  const clock = { now: jest.fn(() => NOW) } as unknown as FinancialClock;
  const service = new AsaasBillingService(prisma, {} as AsaasClient, config, clock);
  const envelope = {
    id: 'evt-1',
    event: 'PAYMENT_RECEIVED',
    payment: {
      id: 'pay-1',
      customer: 'cus-1',
      value: options?.paymentValue ?? 25.5,
      status: 'RECEIVED',
      billingType: 'PIX',
      externalReference: 'invoice-ref',
      paymentDate: '2026-08-31',
    },
  };
  return { service, tx, envelope };
}

describe('AsaasBillingService webhook', () => {
  it('recusa webhook sem o token configurado antes de tocar no banco', async () => {
    const { service } = subject();
    await expect(
      service.receiveWebhook(undefined, { id: 'evt', event: 'PAYMENT_RECEIVED' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('baixa a fatura somente no PAYMENT_RECEIVED validado', async () => {
    const { service, tx, envelope } = subject();
    await expect(service.receiveWebhook(WEBHOOK_TOKEN, envelope)).resolves.toEqual({ received: true });
    expect(tx.invoice.updateMany).toHaveBeenCalledWith({
      where: { id: 'invoice-1', status: 'PENDING' },
      data: {
        status: 'PAID',
        paymentDate: new Date('2026-08-31T00:00:00.000Z'),
        paymentMethod: 'ONLINE',
      },
    });
    expect(tx.invoiceStatusHistory.create).toHaveBeenCalledTimes(1);
    expect(tx.asaasWebhookEvent.update).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'PROCESSED' }) }),
    );
  });

  it('ignora valor divergente e nao baixa a fatura', async () => {
    const { service, tx, envelope } = subject({ paymentValue: 25.49 });
    await service.receiveWebhook(WEBHOOK_TOKEN, envelope);
    expect(tx.invoice.updateMany).not.toHaveBeenCalled();
    expect(tx.invoiceStatusHistory.create).not.toHaveBeenCalled();
    expect(tx.asaasWebhookEvent.update).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'IGNORED' }) }),
    );
  });

  it('trata o mesmo id de evento uma unica vez', async () => {
    const { service, tx, envelope } = subject({ inserted: 0 });
    await service.receiveWebhook(WEBHOOK_TOKEN, envelope);
    expect(tx.invoicePixCharge.findUnique).not.toHaveBeenCalled();
    expect(tx.invoice.updateMany).not.toHaveBeenCalled();
  });

  it('nao usa PAYMENT_CONFIRMED para quitar Pix', async () => {
    const { service, tx, envelope } = subject();
    await service.receiveWebhook(WEBHOOK_TOKEN, { ...envelope, event: 'PAYMENT_CONFIRMED' });
    expect(tx.invoicePixCharge.findUnique).not.toHaveBeenCalled();
    expect(tx.invoice.updateMany).not.toHaveBeenCalled();
  });
});

describe('AsaasBillingService cobrança', () => {
  it('não expõe a cobrança de uma fatura de outra empresa', async () => {
    const findCharge = jest.fn();
    const prisma = {
      companyTeamMember: { findFirst: jest.fn().mockResolvedValue({ companyId: 'company-1' }) },
      invoice: {
        findUnique: jest.fn().mockResolvedValue({ id: 'invoice-2', companyId: 'company-2' }),
      },
      invoicePixCharge: { findUnique: findCharge },
    } as unknown as PrismaService;
    const service = new AsaasBillingService(
      prisma,
      {} as AsaasClient,
      {} as ConfigService,
      { now: jest.fn(() => NOW) } as unknown as FinancialClock,
    );

    await expect(
      service.getForCompany({ id: 'user-1', type: 'COMPANY_MEMBER' } as User, 'invoice-2'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(findCharge).not.toHaveBeenCalled();
  });

  it('cria cliente e Pix uma vez e usa hoje como vencimento operacional da fatura atrasada', async () => {
    const invoice = {
      id: 'invoice-1',
      companyId: 'company-1',
      number: 'FAT-1',
      status: 'OVERDUE',
      dueDate: new Date('2026-08-20T00:00:00.000Z'),
      totalValue: { toString: () => '25.50' },
      company: {
        id: 'company-1',
        tradeName: 'Loja teste',
        document: '39.535.445/0001-01',
        teamMembers: [
          { role: 'OWNER', user: { email: 'loja@example.com', phone: '11999999999' } },
        ],
      },
    };
    const createdCharge = {
      id: 'charge-1',
      invoiceId: 'invoice-1',
      externalReference: 'invoice-ref',
      status: 'CREATING',
      updatedAt: NOW,
      providerPaymentId: null,
      providerCustomerId: null,
      providerStatus: null,
      pixPayload: null,
      pixEncodedImage: null,
      expiresAt: null,
      receivedAt: null,
      errorCode: null,
    };
    const prisma = {
      companyTeamMember: { findFirst: jest.fn().mockResolvedValue({ companyId: 'company-1' }) },
      invoice: { findUnique: jest.fn().mockResolvedValue(invoice) },
      invoicePixCharge: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(createdCharge),
        update: jest
          .fn()
          .mockResolvedValueOnce({ ...createdCharge, status: 'ACTIVE', providerPaymentId: 'pay-1' })
          .mockResolvedValueOnce({
            ...createdCharge,
            status: 'ACTIVE',
            providerPaymentId: 'pay-1',
            pixPayload: 'pix-payload',
            pixEncodedImage: 'base64',
            expiresAt: new Date('2026-08-31T18:00:00.000Z'),
          }),
        updateMany: jest.fn(),
      },
      asaasCustomer: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({
          id: 'customer-row-1',
          companyId: 'company-1',
          status: 'CREATING',
          providerCustomerId: null,
          updatedAt: NOW,
        }),
        update: jest.fn().mockResolvedValue({}),
      },
    } as unknown as PrismaService;
    const client = {
      findCustomerByExternalReference: jest.fn().mockResolvedValue(null),
      createCustomer: jest.fn().mockResolvedValue('cus-1'),
      createPixPayment: jest.fn().mockImplementation(async (input) => ({
        id: 'pay-1',
        customer: input.customer,
        value: input.value,
        status: 'PENDING',
        billingType: 'PIX',
        externalReference: input.externalReference,
      })),
      getPixQrCode: jest.fn().mockResolvedValue({
        encodedImage: 'base64',
        payload: 'pix-payload',
        expirationDate: '2026-08-31T18:00:00.000Z',
      }),
    } as unknown as AsaasClient;
    const config = {} as ConfigService;
    const clock = { now: jest.fn(() => NOW) } as unknown as FinancialClock;
    const service = new AsaasBillingService(prisma, client, config, clock);

    await expect(
      service.createForCompany(
        { id: 'user-1', type: 'COMPANY_MEMBER' } as User,
        'invoice-1',
      ),
    ).resolves.toMatchObject({ status: 'ACTIVE', pixPayload: 'pix-payload', totalValue: 25.5 });
    expect(client.createCustomer).toHaveBeenCalledTimes(1);
    expect(client.createPixPayment).toHaveBeenCalledWith(
      expect.objectContaining({ customer: 'cus-1', value: 25.5, dueDate: '2026-08-31' }),
    );
  });

  it('explica quando o Asaas rejeita a credencial ao reconciliar uma tentativa', async () => {
    const invoice = {
      id: 'invoice-1',
      companyId: 'company-1',
      number: 'FAT-1',
      status: 'PENDING',
      dueDate: new Date('2026-08-31T00:00:00.000Z'),
      totalValue: { toString: () => '11.50' },
      company: {
        id: 'company-1',
        tradeName: 'Loja teste',
        document: '39.535.445/0001-01',
        teamMembers: [],
      },
    };
    const prisma = {
      companyTeamMember: { findFirst: jest.fn().mockResolvedValue({ companyId: 'company-1' }) },
      invoice: { findUnique: jest.fn().mockResolvedValue(invoice) },
      invoicePixCharge: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'charge-1',
          invoiceId: 'invoice-1',
          externalReference: 'invoice-ref',
          providerCustomerId: null,
          status: 'FAILED',
          updatedAt: new Date('2026-08-31T14:00:00.000Z'),
        }),
      },
    } as unknown as PrismaService;
    const client = {
      findPaymentByExternalReference: jest
        .fn()
        .mockRejectedValue(
          new AsaasProviderError(
            'FIND_PAYMENT',
            'REQUEST_REJECTED',
            401,
            false,
            'invalid_environment',
          ),
        ),
    } as unknown as AsaasClient;
    const service = new AsaasBillingService(
      prisma,
      client,
      {} as ConfigService,
      { now: jest.fn(() => NOW) } as unknown as FinancialClock,
    );

    await expect(
      service.createForCompany({ id: 'user-1', type: 'COMPANY_MEMBER' } as User, 'invoice-1'),
    ).rejects.toMatchObject({
      constructor: BadGatewayException,
      response: {
        message:
          'A chave do Asaas não pertence ao ambiente configurado. Use chave Sandbox com ASAAS_ENVIRONMENT=sandbox.',
      },
    });
  });

  it('nao mascara configuracao ausente como 502 generico', async () => {
    const invoice = {
      id: 'invoice-1',
      companyId: 'company-1',
      number: 'FAT-1',
      status: 'PENDING',
      dueDate: new Date('2026-08-31T00:00:00.000Z'),
      totalValue: { toString: () => '11.50' },
      company: {
        id: 'company-1',
        tradeName: 'Loja teste',
        document: '39.535.445/0001-01',
        teamMembers: [],
      },
    };
    const prisma = {
      companyTeamMember: { findFirst: jest.fn().mockResolvedValue({ companyId: 'company-1' }) },
      invoice: { findUnique: jest.fn().mockResolvedValue(invoice) },
      invoicePixCharge: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'charge-1',
          invoiceId: 'invoice-1',
          externalReference: 'invoice-ref',
          providerCustomerId: null,
          status: 'FAILED',
          updatedAt: new Date('2026-08-31T14:00:00.000Z'),
        }),
      },
    } as unknown as PrismaService;
    const client = {
      findPaymentByExternalReference: jest
        .fn()
        .mockRejectedValue(new ServiceUnavailableException('Configuração Asaas ausente.')),
    } as unknown as AsaasClient;
    const service = new AsaasBillingService(
      prisma,
      client,
      {} as ConfigService,
      { now: jest.fn(() => NOW) } as unknown as FinancialClock,
    );

    await expect(
      service.createForCompany({ id: 'user-1', type: 'COMPANY_MEMBER' } as User, 'invoice-1'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
