import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import {
  callAsaas,
  type AsaasCredential,
  type AsaasPayment,
  type AsaasPixQrCode,
} from '../../finance/asaas/asaas.client';
import { ASAAS_BASE_URLS } from '../../finance/asaas/asaas.config';
import {
  asaasCustomerListSchema,
  asaasCustomerSchema,
  asaasPaymentSchema,
  asaasPixQrCodeSchema,
} from '../../finance/asaas/asaas.schemas';

export type AmbienteDaConta = 'SANDBOX' | 'PRODUCTION';

export function credencialDaLoja(apiKey: string, ambiente: AmbienteDaConta): AsaasCredential {
  return { apiKey, baseUrl: ASAAS_BASE_URLS[ambiente === 'SANDBOX' ? 'sandbox' : 'production'] };
}

const dadosComerciaisSchema = z
  .object({
    name: z.string().nullable().optional(),
    companyName: z.string().nullable().optional(),
    tradingName: z.string().nullable().optional(),
    email: z.string().nullable().optional(),
  })
  .passthrough();

const listaSchema = z.object({ data: z.array(z.unknown()) }).passthrough();
const comIdSchema = z.object({ id: z.string().min(1) }).passthrough();
const qualquerSchema = z.object({}).passthrough();

/**
 * Os eventos que a conta da loja manda ao MOTOboyCity: o Pix recebido (e o
 * cartão confirmado, quando entrar) e o estorno feito.
 */
const EVENTOS_DO_WEBHOOK = ['PAYMENT_RECEIVED', 'PAYMENT_CONFIRMED', 'PAYMENT_REFUNDED'];

export type DadosComerciais = z.infer<typeof dadosComerciaisSchema>;

/**
 * A API do Asaas com a chave da conta de UMA loja — a mesma chamada das faturas
 * da plataforma (`callAsaas`), com outra credencial. Cada método recebe a
 * credencial: nada aqui guarda chave.
 */
@Injectable()
export class StoreAsaasClient {
  dadosComerciais(conta: AsaasCredential): Promise<DadosComerciais> {
    return callAsaas(
      conta,
      '/myAccount/commercialInfo',
      {},
      dadosComerciaisSchema,
      'GET_COMMERCIAL_INFO',
    );
  }

  /** Sem chave Pix ativa, o Asaas não gera o QR code da cobrança. */
  async temChavePixAtiva(conta: AsaasCredential): Promise<boolean> {
    const lista = await callAsaas(
      conta,
      '/pix/addressKeys?status=ACTIVE&limit=1',
      {},
      listaSchema,
      'LIST_PIX_KEYS',
    );
    return lista.data.length > 0;
  }

  async criarWebhook(
    conta: AsaasCredential,
    { url, email, authToken }: { url: string; email: string; authToken: string },
  ): Promise<string> {
    const criado = await callAsaas(
      conta,
      '/webhooks',
      {
        method: 'POST',
        body: JSON.stringify({
          name: 'MOTOboyCity - loja online',
          url,
          email,
          enabled: true,
          interrupted: false,
          authToken,
          sendType: 'SEQUENTIALLY',
          events: EVENTOS_DO_WEBHOOK,
        }),
      },
      comIdSchema,
      'CREATE_WEBHOOK',
    );
    return criado.id;
  }

  async apagarWebhook(conta: AsaasCredential, id: string): Promise<void> {
    await callAsaas(
      conta,
      `/webhooks/${encodeURIComponent(id)}`,
      { method: 'DELETE' },
      qualquerSchema,
      'DELETE_WEBHOOK',
    );
  }

  /** O cliente da loja no Asaas, pelo CPF — ou um novo, se ainda não existe. */
  async clienteDoCpf(
    conta: AsaasCredential,
    dados: { nome: string; cpf: string; telefone: string; referencia: string },
  ): Promise<string> {
    const achados = await callAsaas(
      conta,
      `/customers?cpfCnpj=${encodeURIComponent(dados.cpf)}&limit=1`,
      {},
      asaasCustomerListSchema,
      'FIND_CUSTOMER',
    );
    const existente = achados.data[0]?.id;
    if (existente) return existente;
    const criado = await callAsaas(
      conta,
      '/customers',
      {
        method: 'POST',
        body: JSON.stringify({
          name: dados.nome,
          cpfCnpj: dados.cpf,
          mobilePhone: dados.telefone,
          externalReference: dados.referencia,
          // A loja avisa o cliente pela página; o Asaas não manda nada por conta.
          notificationDisabled: true,
        }),
      },
      asaasCustomerSchema,
      'CREATE_CUSTOMER',
    );
    return criado.id;
  }

  criarCobrancaPix(
    conta: AsaasCredential,
    cobranca: {
      customer: string;
      value: number;
      dueDate: string;
      description: string;
      externalReference: string;
    },
  ): Promise<AsaasPayment> {
    return callAsaas(
      conta,
      '/payments',
      { method: 'POST', body: JSON.stringify({ ...cobranca, billingType: 'PIX' }) },
      asaasPaymentSchema,
      'CREATE_PAYMENT',
    );
  }

  qrCodePix(conta: AsaasCredential, id: string): Promise<AsaasPixQrCode> {
    return callAsaas(
      conta,
      `/payments/${encodeURIComponent(id)}/pixQrCode`,
      {},
      asaasPixQrCodeSchema,
      'GET_PIX_QR_CODE',
    );
  }

  cobranca(conta: AsaasCredential, id: string): Promise<AsaasPayment> {
    return callAsaas(
      conta,
      `/payments/${encodeURIComponent(id)}`,
      {},
      asaasPaymentSchema,
      'GET_PAYMENT',
    );
  }

  async apagarCobranca(conta: AsaasCredential, id: string): Promise<void> {
    await callAsaas(
      conta,
      `/payments/${encodeURIComponent(id)}`,
      { method: 'DELETE' },
      qualquerSchema,
      'DELETE_PAYMENT',
    );
  }

  /** O estorno inteiro (decisão 18). As tarifas do Asaas não voltam. */
  estornar(conta: AsaasCredential, id: string, descricao: string): Promise<AsaasPayment> {
    return callAsaas(
      conta,
      `/payments/${encodeURIComponent(id)}/refund`,
      { method: 'POST', body: JSON.stringify({ description: descricao.slice(0, 200) }) },
      asaasPaymentSchema,
      'REFUND_PAYMENT',
    );
  }
}
