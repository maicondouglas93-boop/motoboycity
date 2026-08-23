/**
 * Credenciais do Firebase para enviar push.
 *
 * Três variáveis separadas, e não o JSON inteiro da conta de serviço numa só:
 * painel de hospedagem lida melhor com campos curtos, e um JSON completo num
 * campo de texto é o tipo de coisa que alguém acaba colando num chat ou num
 * commit. A chave privada continua sendo segredo — as outras duas não são.
 */
export interface PushCredentials {
  projectId: string;
  clientEmail: string;
  privateKey: string;
}

export function readPushCredentials(env: NodeJS.ProcessEnv): PushCredentials | null {
  const projectId = env['FIREBASE_PROJECT_ID']?.trim();
  const clientEmail = env['FIREBASE_CLIENT_EMAIL']?.trim();
  const privateKey = env['FIREBASE_PRIVATE_KEY'];

  if (!projectId || !clientEmail || !privateKey) {
    return null;
  }

  return {
    projectId,
    clientEmail,
    /**
     * A chave vem com `\n` literal.
     *
     * Painel de hospedagem quase sempre guarda variável de ambiente em uma
     * linha só, então a quebra real da chave PEM chega escapada. Sem esta
     * troca, o Firebase recusa a credencial com um erro de parsing que não diz
     * nada sobre a causa.
     */
    privateKey: privateKey.replace(/\\n/g, '\n'),
  };
}

/**
 * Canal de notificação do Android para OFERTA.
 *
 * Precisa existir no aplicativo com importância alta, senão o Android entrega
 * a oferta em silêncio — que é o mesmo que não entregar, já que o motoboy tem
 * um prazo para responder.
 */
export const OFFER_CHANNEL_ID = 'ofertas';

/** Canal para o resto: aviso de conta, rastreamento, repasse. */
export const GENERAL_CHANNEL_ID = 'avisos';
