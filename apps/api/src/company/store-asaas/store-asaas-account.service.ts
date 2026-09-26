import { randomBytes, timingSafeEqual } from 'node:crypto';
import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ContaAsaasDaLoja } from '@motoboycity/types';
import { FORMAS_DE_PAGAMENTO_ONLINE, type StoreAsaasAccountPayload } from '@motoboycity/validation';
import { Prisma, type StoreAsaasAccount, type User } from '@prisma/client';
import { AsaasProviderError, type AsaasCredential } from '../../finance/asaas/asaas.client';
import { PrismaService } from '../../prisma/prisma.service';
import { StoreCatalogService } from '../store-catalog/store-catalog.service';
import { StoreAsaasCredentialsService } from './store-asaas-credentials.service';
import { StoreAsaasClient, credencialDaLoja, type AmbienteDaConta } from './store-asaas.client';

const API_PADRAO = 'https://motoboycity-api.onrender.com';

/** O endereço público da API, que o Asaas chama no webhook de cada loja. */
export function enderecoPublicoDaApi(config: ConfigService): string {
  const bruto = config.get<string>('API_PUBLIC_URL')?.trim().replace(/\/+$/, '');
  if (!bruto) return API_PADRAO;
  try {
    const url = new URL(bruto);
    return url.protocol === 'https:' && url.pathname === '/' ? url.origin : API_PADRAO;
  } catch {
    return API_PADRAO;
  }
}

export interface ContaParaCobrar {
  credencial: AsaasCredential;
  ambiente: AmbienteDaConta;
}

/**
 * A conta Asaas da loja: por onde ela recebe as vendas pagas online, direto na
 * conta dela — a plataforma não toca no dinheiro da venda (decisão 3).
 *
 * Ligar é colar a chave da API. O servidor confere a chave no próprio Asaas,
 * vê se a conta tem chave Pix ativa (sem ela, o Asaas não gera o QR code), cria
 * na conta da loja o webhook que avisa o MOTOboyCity do pagamento, e guarda a
 * chave e o token do webhook cifrados. Nada disso volta para o navegador.
 */
@Injectable()
export class StoreAsaasAccountService {
  private readonly logger = new Logger(StoreAsaasAccountService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly catalogo: StoreCatalogService,
    private readonly asaas: StoreAsaasClient,
    private readonly segredos: StoreAsaasCredentialsService,
  ) {}

  async conta(user: User): Promise<ContaAsaasDaLoja> {
    const companyId = await this.catalogo.resolveCompanyId(user);
    return paraConta(await this.prisma.storeAsaasAccount.findUnique({ where: { companyId } }));
  }

  async conectar(user: User, payload: StoreAsaasAccountPayload): Promise<ContaAsaasDaLoja> {
    const companyId = await this.catalogo.resolveCompanyId(user);
    if (!this.segredos.disponivel()) {
      throw new ServiceUnavailableException({
        message: 'O recebimento online ainda não foi ligado no servidor. Fale com a central.',
        code: 'STORE_ASAAS_UNAVAILABLE',
      });
    }
    const ambiente: AmbienteDaConta = payload.ambiente === 'SANDBOX' ? 'SANDBOX' : 'PRODUCTION';
    const credencial = credencialDaLoja(payload.chaveDaApi, ambiente);

    const dados = await this.asaas.dadosComerciais(credencial).catch((erro: unknown) => {
      const status = erro instanceof AsaasProviderError ? erro.httpStatus : undefined;
      if (status === 401 || status === 403) {
        throw new BadRequestException({
          message:
            payload.ambiente === 'SANDBOX'
              ? 'O Asaas não reconheceu essa chave no ambiente de testes (sandbox). Confira a chave, ou escolha "Produção".'
              : 'O Asaas não reconheceu essa chave na conta de produção. Confira a chave, ou escolha "Testes (sandbox)".',
          code: 'STORE_ASAAS_KEY_INVALID',
        });
      }
      throw new BadGatewayException({
        message: 'O Asaas não respondeu agora. Tente de novo em instantes.',
        code: 'STORE_ASAAS_UNREACHABLE',
      });
    });
    const temChavePix = await this.asaas.temChavePixAtiva(credencial).catch(() => false);
    const email = dados.email?.trim() || user.email;
    const nome =
      dados.tradingName?.trim() || dados.companyName?.trim() || dados.name?.trim() || email;

    const webhookToken = randomBytes(32).toString('base64url');
    const webhookId = await this.asaas
      .criarWebhook(credencial, {
        url: `${enderecoPublicoDaApi(this.config)}/integrations/asaas/stores/${companyId}/webhook`,
        email,
        authToken: webhookToken,
      })
      .catch(() => {
        throw new BadGatewayException({
          message:
            'O Asaas aceitou a chave, mas não deixou criar o aviso de pagamento na sua conta. Confira se a chave tem permissão total e tente de novo.',
          code: 'STORE_ASAAS_WEBHOOK_FAILED',
        });
      });

    const anterior = await this.prisma.storeAsaasAccount.findUnique({ where: { companyId } });
    const cifrados = this.segredos.cifrar(companyId, {
      apiKey: payload.chaveDaApi,
      webhookToken,
    });
    const dadosDaConta = {
      environment: ambiente,
      ...cifrados,
      webhookId,
      accountName: nome.slice(0, 200),
      accountEmail: dados.email?.trim().slice(0, 200) || null,
      hasPixKey: temChavePix,
    } satisfies Omit<Prisma.StoreAsaasAccountUncheckedCreateInput, 'companyId'>;
    const salva = await this.prisma.storeAsaasAccount.upsert({
      where: { companyId },
      create: { companyId, ...dadosDaConta },
      update: dadosDaConta,
    });
    // A conta ligada antes fica sem o webhook antigo: não sobram dois avisos.
    if (anterior) await this.apagarWebhook(companyId, anterior);
    return paraConta(salva);
  }

  /**
   * Desliga: apaga o webhook na conta da loja (se o Asaas deixar), esquece a
   * chave e tira o Pix online das formas de pagamento — a página para de
   * oferecer na hora.
   */
  async desconectar(user: User): Promise<ContaAsaasDaLoja> {
    const companyId = await this.catalogo.resolveCompanyId(user);
    const conta = await this.prisma.storeAsaasAccount.findUnique({ where: { companyId } });
    if (!conta) return { conectada: false };
    await this.apagarWebhook(companyId, conta);
    await this.prisma.storeAsaasAccount.delete({ where: { companyId } });
    const operacao = await this.prisma.storeOperation.findUnique({
      where: { companyId },
      select: { paymentMethods: true },
    });
    const formas = (operacao?.paymentMethods as string[] | null) ?? null;
    if (
      formas?.some((forma) => (FORMAS_DE_PAGAMENTO_ONLINE as readonly string[]).includes(forma))
    ) {
      const naEntrega = formas.filter(
        (forma) => !(FORMAS_DE_PAGAMENTO_ONLINE as readonly string[]).includes(forma),
      );
      await this.prisma.storeOperation.update({
        where: { companyId },
        data: { paymentMethods: naEntrega.length > 0 ? naEntrega : ['DINHEIRO'] },
      });
    }
    return { conectada: false };
  }

  /** A loja recebe Pix pela página: conta ligada e com chave Pix ativa. */
  async recebePix(companyId: string): Promise<boolean> {
    const conta = await this.prisma.storeAsaasAccount.findUnique({
      where: { companyId },
      select: { hasPixKey: true },
    });
    return conta?.hasPixKey === true && this.segredos.disponivel();
  }

  /** A credencial para cobrar e estornar. `null`: a loja não tem conta ligada. */
  async contaParaCobrar(companyId: string): Promise<ContaParaCobrar | null> {
    const conta = await this.prisma.storeAsaasAccount.findUnique({ where: { companyId } });
    if (!conta || !this.segredos.disponivel()) return null;
    const { apiKey } = this.segredos.abrir(companyId, conta);
    return { credencial: credencialDaLoja(apiKey, conta.environment), ambiente: conta.environment };
  }

  /** O token que o Asaas mandou no webhook é o desta loja? Comparado em tempo constante. */
  async webhookDaLoja(companyId: string, token: string | undefined): Promise<boolean> {
    if (!token || !this.segredos.disponivel()) return false;
    const conta = await this.prisma.storeAsaasAccount.findUnique({ where: { companyId } });
    if (!conta) return false;
    const esperado = Buffer.from(this.segredos.abrir(companyId, conta).webhookToken);
    const recebido = Buffer.from(token);
    return esperado.length === recebido.length && timingSafeEqual(esperado, recebido);
  }

  /** Sem lançar: a conta pode ter sido apagada no Asaas, ou a chave revogada. */
  private async apagarWebhook(companyId: string, conta: StoreAsaasAccount): Promise<void> {
    if (!conta.webhookId) return;
    try {
      const { apiKey } = this.segredos.abrir(companyId, conta);
      await this.asaas.apagarWebhook(credencialDaLoja(apiKey, conta.environment), conta.webhookId);
    } catch (erro) {
      this.logger.warn(
        `Webhook antigo da conta Asaas não foi apagado (${companyId}): ${erro instanceof Error ? erro.message : String(erro)}`,
      );
    }
  }
}

function paraConta(conta: StoreAsaasAccount | null): ContaAsaasDaLoja {
  if (!conta) return { conectada: false };
  return {
    conectada: true,
    ambiente: conta.environment === 'SANDBOX' ? 'SANDBOX' : 'PRODUCAO',
    nome: conta.accountName,
    email: conta.accountEmail,
    temChavePix: conta.hasPixKey,
    conectadaEm: conta.updatedAt.toISOString(),
  };
}
