import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { cert, deleteApp, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getMessaging, type Message } from 'firebase-admin/messaging';
import { PrismaService } from '../prisma/prisma.service';
import { GENERAL_CHANNEL_ID, OFFER_CHANNEL_ID, readPushCredentials } from './push.config';

export interface PushMessage {
  title: string;
  body: string;
  /**
   * Dados para o aplicativo decidir para onde levar o motoboy ao tocar. Só
   * texto: o FCM recusa qualquer outro tipo aqui.
   */
  data?: Record<string, string>;
  /** Oferta usa canal e prioridade próprios — ver `OFFER_CHANNEL_ID`. */
  kind?: 'offer' | 'general';
}

/**
 * Push para o aplicativo do motoboy.
 *
 * É o que faltava para a oferta chegar com o aplicativo FECHADO. O socket só
 * alcança quem está com o app aberto, e é justamente o caso oposto que
 * interessa: o motoboy esperando corrida com o celular no bolso.
 *
 * O serviço é INERTE sem credencial, de propósito. Um piloto pode começar sem
 * Firebase configurado, e derrubar a API inteira porque falta uma variável de
 * ambiente transformaria um recurso ausente num sistema fora do ar. O aviso
 * sai uma vez, na subida.
 */
@Injectable()
export class PushService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PushService.name);
  private app: App | null = null;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit(): void {
    const credentials = readPushCredentials(process.env);
    if (!credentials) {
      this.logger.warn(
        'Push desligado: FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL e FIREBASE_PRIVATE_KEY não estão configuradas. ' +
          'As ofertas só chegarão com o aplicativo aberto.',
      );
      return;
    }

    /**
     * Nome próprio para o app do Firebase.
     *
     * O padrão é global e único no processo; em teste, dois módulos subindo
     * juntos colidiriam. Com nome, cada instância é isolada e o `onModuleDestroy`
     * consegue derrubar só a sua.
     */
    const existente = getApps().find((item) => item.name === 'motoboycity-push');
    this.app =
      existente ??
      initializeApp(
        {
          credential: cert({
            projectId: credentials.projectId,
            clientEmail: credentials.clientEmail,
            privateKey: credentials.privateKey,
          }),
        },
        'motoboycity-push',
      );
    this.logger.log(`Push ativo no projeto ${credentials.projectId}.`);
  }

  async onModuleDestroy(): Promise<void> {
    if (this.app) {
      await deleteApp(this.app);
      this.app = null;
    }
  }

  get enabled(): boolean {
    return this.app !== null;
  }

  /**
   * Envia para todos os aparelhos do motoboy. Devolve quantos receberam.
   *
   * Um motoboy pode ter mais de um aparelho registrado — trocou de celular e
   * não desinstalou o antigo, por exemplo. Mandar para todos é o certo: não dá
   * para saber qual está no bolso dele agora.
   */
  async sendToDriver(driverId: string, message: PushMessage): Promise<number> {
    if (!this.app) {
      return 0;
    }

    const tokens = await this.prisma.deviceToken.findMany({
      where: { driverId },
      select: { token: true },
    });
    if (tokens.length === 0) {
      return 0;
    }

    const canal = message.kind === 'offer' ? OFFER_CHANNEL_ID : GENERAL_CHANNEL_ID;
    const messaging = getMessaging(this.app);

    const envios = await Promise.all(
      tokens.map(async ({ token }) => {
        const payload: Message = {
          token,
          notification: { title: message.title, body: message.body },
          ...(message.data && { data: message.data }),
          android: {
            /**
             * Alta prioridade acorda o aparelho em modo de economia. Sem isso o
             * Android pode segurar a mensagem até a próxima janela de
             * manutenção — e a oferta tem prazo de resposta.
             */
            priority: 'high',
            notification: {
              channelId: canal,
              /**
               * Oferta é evento vivo: guardar uma que expirou para entregar
               * depois só faria o motoboy abrir o app e encontrar nada.
               */
              ...(message.kind === 'offer' && { ttl: 0 }),
            },
            ...(message.kind === 'offer' && { ttl: 0 }),
          },
        };

        try {
          await messaging.send(payload);
          return { token, ok: true as const };
        } catch (error) {
          return { token, ok: false as const, error };
        }
      }),
    );

    const invalidos = envios
      .filter((envio) => !envio.ok && this.isTokenInvalid(envio.error))
      .map((envio) => envio.token);
    if (invalidos.length > 0) {
      /**
       * O FCM só avisa que um token morreu na hora de enviar. Apagar aqui é a
       * única limpeza possível — do contrário a tabela cresce com aparelhos
       * desinstalados e todo envio arrasta erro que não é erro.
       */
      await this.prisma.deviceToken.deleteMany({ where: { token: { in: invalidos } } });
      this.logger.log(`${invalidos.length} token(s) de push inválido(s) removido(s).`);
    }

    const falhasReais = envios.filter((envio) => !envio.ok && !this.isTokenInvalid(envio.error));
    if (falhasReais.length > 0) {
      this.logger.warn(`${falhasReais.length} envio(s) de push falharam.`);
    }

    return envios.filter((envio) => envio.ok).length;
  }

  /** Token que não existe mais: aparelho desinstalado ou registro trocado. */
  private isTokenInvalid(error: unknown): boolean {
    const codigo = (error as { errorInfo?: { code?: string } } | null)?.errorInfo?.code;
    return (
      codigo === 'messaging/registration-token-not-registered' ||
      codigo === 'messaging/invalid-registration-token' ||
      codigo === 'messaging/invalid-argument'
    );
  }
}
