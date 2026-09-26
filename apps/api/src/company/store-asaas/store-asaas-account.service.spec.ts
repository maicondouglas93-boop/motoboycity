import { randomBytes } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import type { StoreAsaasAccount, User } from '@prisma/client';
import { AsaasProviderError } from '../../finance/asaas/asaas.client';
import { PrismaService } from '../../prisma/prisma.service';
import { StoreCatalogService } from '../store-catalog/store-catalog.service';
import { StoreAsaasAccountService, enderecoPublicoDaApi } from './store-asaas-account.service';
import { StoreAsaasCredentialsService } from './store-asaas-credentials.service';
import { StoreAsaasClient } from './store-asaas.client';

/**
 * A conta Asaas da loja: a chave conferida no próprio Asaas, o webhook criado
 * na conta da loja, e os dois guardados cifrados — nada disso volta ao
 * navegador.
 */

const EMPRESA = '8a4d3b0e-2f1c-4e8a-9d7b-6c5a4b3e2d1f';
const membro = { id: 'user-1', type: 'COMPANY_MEMBER', email: 'dono@loja.com' } as User;
const CHAVE_MESTRA = randomBytes(32).toString('base64');

function ambiente(valores: Record<string, string | undefined>): ConfigService {
  return { get: (nome: string) => valores[nome] } as unknown as ConfigService;
}

describe('StoreAsaasCredentialsService', () => {
  it('cifra e abre; com o id de outra empresa, não abre', () => {
    const cofre = new StoreAsaasCredentialsService(
      ambiente({ STORE_ASAAS_ENCRYPTION_KEY: CHAVE_MESTRA }),
    );
    const cifrados = cofre.cifrar(EMPRESA, {
      apiKey: '$aact_chave_da_loja',
      webhookToken: 'x'.repeat(43),
    });
    expect(cifrados.encryptedPayload).not.toContain('aact');
    expect(cofre.abrir(EMPRESA, cifrados).apiKey).toBe('$aact_chave_da_loja');
    expect(() => cofre.abrir('outra-empresa', cifrados)).toThrow();
  });

  it('sem a chave mestra (ou com tamanho errado), recusa em vez de guardar em texto', () => {
    expect(new StoreAsaasCredentialsService(ambiente({})).disponivel()).toBe(false);
    const curta = new StoreAsaasCredentialsService(
      ambiente({ STORE_ASAAS_ENCRYPTION_KEY: randomBytes(16).toString('base64') }),
    );
    expect(curta.disponivel()).toBe(false);
    expect(() => curta.cifrar(EMPRESA, { apiKey: 'k', webhookToken: 'x'.repeat(43) })).toThrow();
  });
});

describe('StoreAsaasAccountService', () => {
  let service: StoreAsaasAccountService;
  let conta: StoreAsaasAccount | null;
  let operacao: { paymentMethods: string[] | null };
  let asaas: {
    dadosComerciais: jest.Mock;
    temChavePixAtiva: jest.Mock;
    criarWebhook: jest.Mock;
    apagarWebhook: jest.Mock;
  };
  let cofre: StoreAsaasCredentialsService;

  beforeEach(async () => {
    conta = null;
    operacao = { paymentMethods: ['DINHEIRO', 'PIX_ONLINE'] };
    asaas = {
      dadosComerciais: jest.fn().mockResolvedValue({
        name: 'José da Silva',
        tradingName: 'Açaí do Zé',
        email: 'financeiro@acai.com',
      }),
      temChavePixAtiva: jest.fn().mockResolvedValue(true),
      criarWebhook: jest.fn().mockResolvedValue('wh_novo'),
      apagarWebhook: jest.fn().mockResolvedValue(undefined),
    };
    const prisma = {
      storeAsaasAccount: {
        findUnique: jest.fn(() => Promise.resolve(conta)),
        upsert: jest.fn(({ create, update }) => {
          conta = {
            ...(conta ?? create),
            ...(conta ? update : {}),
            companyId: EMPRESA,
            createdAt: new Date(),
            updatedAt: new Date('2026-09-27T12:00:00Z'),
          } as StoreAsaasAccount;
          return Promise.resolve(conta);
        }),
        delete: jest.fn(() => {
          conta = null;
          return Promise.resolve({});
        }),
      },
      storeOperation: {
        findUnique: jest.fn(() => Promise.resolve(operacao)),
        update: jest.fn(({ data }) => {
          operacao = { ...operacao, ...data };
          return Promise.resolve(operacao);
        }),
      },
    };
    const config = ambiente({
      STORE_ASAAS_ENCRYPTION_KEY: CHAVE_MESTRA,
      API_PUBLIC_URL: 'https://api.motoboycity.com.br/',
    });
    cofre = new StoreAsaasCredentialsService(config);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StoreAsaasAccountService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: config },
        {
          provide: StoreCatalogService,
          useValue: { resolveCompanyId: jest.fn().mockResolvedValue(EMPRESA) },
        },
        { provide: StoreAsaasClient, useValue: asaas },
        { provide: StoreAsaasCredentialsService, useValue: cofre },
      ],
    }).compile();
    service = module.get(StoreAsaasAccountService);
  });

  it('ligar confere a chave, cria o webhook na conta da loja e guarda tudo cifrado', async () => {
    const ligada = await service.conectar(membro, {
      chaveDaApi: '$aact_chave_da_loja_de_teste',
      ambiente: 'SANDBOX',
    });

    expect(ligada).toMatchObject({
      conectada: true,
      ambiente: 'SANDBOX',
      nome: 'Açaí do Zé',
      email: 'financeiro@acai.com',
      temChavePix: true,
    });
    const [credencial, webhook] = asaas.criarWebhook.mock.calls[0]!;
    expect(credencial.baseUrl).toBe('https://api-sandbox.asaas.com/v3');
    expect(webhook).toMatchObject({
      url: `https://api.motoboycity.com.br/integrations/asaas/stores/${EMPRESA}/webhook`,
      email: 'financeiro@acai.com',
    });
    // O token do webhook e a chave só existem cifrados.
    expect(JSON.stringify(conta)).not.toContain('aact');
    expect(cofre.abrir(EMPRESA, conta!).webhookToken).toBe(webhook.authToken);
    expect(await service.webhookDaLoja(EMPRESA, webhook.authToken)).toBe(true);
    expect(await service.webhookDaLoja(EMPRESA, 'x'.repeat(43))).toBe(false);
    expect(await service.recebePix(EMPRESA)).toBe(true);
  });

  it('chave que o Asaas não reconhece: diz qual ambiente conferir, e nada é gravado', async () => {
    asaas.dadosComerciais.mockRejectedValue(
      new AsaasProviderError('GET_COMMERCIAL_INFO', 'REQUEST_REJECTED', 401),
    );
    await expect(
      service.conectar(membro, { chaveDaApi: '$aact_chave_errada_de_teste', ambiente: 'PRODUCAO' }),
    ).rejects.toMatchObject({
      response: { code: 'STORE_ASAAS_KEY_INVALID', message: expect.stringMatching(/sandbox/) },
    });
    expect(asaas.criarWebhook).not.toHaveBeenCalled();
    expect(conta).toBeNull();
  });

  it('ligar de novo apaga o webhook antigo; desligar tira o Pix das formas de pagamento', async () => {
    await service.conectar(membro, { chaveDaApi: '$aact_primeira_chave_1', ambiente: 'SANDBOX' });
    asaas.criarWebhook.mockResolvedValue('wh_segundo');
    await service.conectar(membro, { chaveDaApi: '$aact_segunda_chave_22', ambiente: 'PRODUCAO' });
    expect(asaas.apagarWebhook).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: '$aact_primeira_chave_1' }),
      'wh_novo',
    );

    expect(await service.desconectar(membro)).toEqual({ conectada: false });
    expect(asaas.apagarWebhook).toHaveBeenLastCalledWith(
      expect.objectContaining({ apiKey: '$aact_segunda_chave_22' }),
      'wh_segundo',
    );
    expect(operacao.paymentMethods).toEqual(['DINHEIRO']);
    expect(await service.recebePix(EMPRESA)).toBe(false);
  });

  it('sem chave Pix ativa, liga, mas não recebe Pix', async () => {
    asaas.temChavePixAtiva.mockResolvedValue(false);
    const ligada = await service.conectar(membro, {
      chaveDaApi: '$aact_chave_sem_pix_000',
      ambiente: 'PRODUCAO',
    });
    expect(ligada).toMatchObject({ conectada: true, temChavePix: false });
    expect(await service.recebePix(EMPRESA)).toBe(false);
  });

  it('o endereço público da API só vale em https, sem caminho', () => {
    expect(enderecoPublicoDaApi(ambiente({}))).toBe('https://motoboycity-api.onrender.com');
    expect(enderecoPublicoDaApi(ambiente({ API_PUBLIC_URL: 'http://inseguro.com' }))).toBe(
      'https://motoboycity-api.onrender.com',
    );
    expect(enderecoPublicoDaApi(ambiente({ API_PUBLIC_URL: 'https://api.x.com/' }))).toBe(
      'https://api.x.com',
    );
  });
});
