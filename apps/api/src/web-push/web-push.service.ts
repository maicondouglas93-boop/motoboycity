import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { sendNotification } from 'web-push';
import { PrismaService } from '../prisma/prisma.service';

/**
 * As chaves VAPID do Web Push: com elas o servidor assina cada aviso, e o
 * serviço de push do navegador sabe que veio do MOTOboyCity.
 *
 * A pública vai para o navegador (é assim que ele se inscreve); a privada é
 * segredo, e só vive no ambiente da API. `WEB_PUSH_SUBJECT` é um contato
 * (`mailto:`) que os serviços de push usam se precisarem falar com quem envia.
 */
export interface WebPushCredentials {
  publicKey: string;
  privateKey: string;
  subject: string;
}

export function readWebPushCredentials(env: NodeJS.ProcessEnv): WebPushCredentials | null {
  const publicKey = env['WEB_PUSH_PUBLIC_KEY']?.trim();
  const privateKey = env['WEB_PUSH_PRIVATE_KEY']?.trim();
  const subject = env['WEB_PUSH_SUBJECT']?.trim();
  if (!publicKey || !privateKey || !subject) return null;
  return { publicKey, privateKey, subject };
}

/** O que a notificação mostra, e para onde o toque leva. */
export interface AvisoDePush {
  titulo: string;
  corpo: string;
  /** Caminho no mesmo site: `/loja/vendas`, `/pedir/acai/pedidos`. */
  url: string;
  /** A notificação nova com a mesma etiqueta substitui a anterior. */
  etiqueta: string;
}

export interface InscricaoDePush {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

/**
 * O Web Push da loja online: avisos para o painel e para o cliente com a página
 * fechada.
 *
 * Inerte sem as chaves, como o push do aplicativo do motoboy: a loja funciona
 * sem ele — o painel aberto avisa, e a página do cliente acompanha sozinha —, e
 * uma variável faltando não pode derrubar a API. O envio nunca lança: aviso que
 * não chegou não desfaz o pedido que mudou.
 */
@Injectable()
export class WebPushService implements OnModuleInit {
  private readonly logger = new Logger(WebPushService.name);
  private credenciais: WebPushCredentials | null = null;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit(): void {
    this.credenciais = readWebPushCredentials(process.env);
    if (!this.credenciais) {
      this.logger.warn(
        'Web Push desligado: WEB_PUSH_PUBLIC_KEY, WEB_PUSH_PRIVATE_KEY e WEB_PUSH_SUBJECT não estão configuradas. ' +
          'Os avisos da loja online só chegam com a página aberta.',
      );
    }
  }

  disponivel(): boolean {
    return this.credenciais !== null;
  }

  chavePublica(): string | null {
    return this.credenciais?.publicKey ?? null;
  }

  /**
   * Manda para todos ao mesmo tempo. O aparelho que o serviço de push dá como
   * sumido (404 ou 410: desinstalou, limpou os dados, revogou a permissão) sai
   * da tabela; qualquer outra falha fica no log, e a inscrição continua.
   */
  async enviar(inscricoes: InscricaoDePush[], aviso: AvisoDePush): Promise<void> {
    const credenciais = this.credenciais;
    if (!credenciais || inscricoes.length === 0) return;
    const payload = JSON.stringify(aviso);
    await Promise.all(
      inscricoes.map(async (inscricao) => {
        try {
          await this.enviarUm(inscricao, payload, credenciais);
        } catch (erro) {
          const status = (erro as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) {
            await this.prisma.webPushSubscription
              .deleteMany({ where: { id: inscricao.id } })
              .catch(() => undefined);
            return;
          }
          this.logger.warn(
            `Aviso não entregue (${status ?? 'sem resposta'}): ${erro instanceof Error ? erro.message : String(erro)}`,
          );
        }
      }),
    );
  }

  /** O envio de um aviso, à parte para o teste trocá-lo sem rede. */
  protected async enviarUm(
    inscricao: InscricaoDePush,
    payload: string,
    credenciais: WebPushCredentials,
  ): Promise<void> {
    await sendNotification(
      { endpoint: inscricao.endpoint, keys: { p256dh: inscricao.p256dh, auth: inscricao.auth } },
      payload,
      {
        vapidDetails: {
          subject: credenciais.subject,
          publicKey: credenciais.publicKey,
          privateKey: credenciais.privateKey,
        },
        // Uma hora: aviso de pedido que chega depois disso já não serve.
        TTL: 60 * 60,
        urgency: 'high',
        timeout: 10_000,
      },
    );
  }
}
