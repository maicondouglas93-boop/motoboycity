import { PermissionsAndroid, Platform } from 'react-native';
import {
  AuthorizationStatus,
  getMessaging,
  getToken,
  onTokenRefresh,
  requestPermission,
} from '@react-native-firebase/messaging';
import { version as appVersion } from '../../package.json';
import { pushTokensApi } from './apiClient';
import { session } from './session';

/**
 * Push do aplicativo do motoboy.
 *
 * É o que faz a oferta chegar com o aplicativo FECHADO. O socket só alcança
 * quem está com o app aberto, e o caso que interessa é o oposto: o motoboy
 * esperando corrida com o celular no bolso.
 *
 * Tudo aqui é tolerante a falha de propósito. Sem `google-services.json` o
 * módulo nativo nem existe, e um app que quebra ao subir porque não tem push é
 * pior do que um app sem push.
 */
function firebaseDisponivel(): boolean {
  try {
    getMessaging();
    return true;
  } catch {
    return false;
  }
}

let tokenAtual: string | null = null;
let cancelarRefresh: (() => void) | null = null;

/**
 * Pede a permissão de notificação.
 *
 * No Android 13+ a permissão é explícita e o padrão é NEGADO — sem pedir, o
 * push chega ao aparelho e não aparece para ninguém. Abaixo do 13 a permissão é
 * concedida na instalação e não há o que pedir.
 */
export async function pedirPermissaoDeNotificacao(): Promise<boolean> {
  if (Platform.OS !== 'android') {
    const status = await requestPermission(getMessaging());
    return status === AuthorizationStatus.AUTHORIZED || status === AuthorizationStatus.PROVISIONAL;
  }

  if (Number(Platform.Version) < 33) {
    return true;
  }

  const resultado = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
  );
  return resultado === PermissionsAndroid.RESULTS.GRANTED;
}

/**
 * Registra o aparelho e passa a acompanhar a troca de token.
 *
 * O FCM troca o token sozinho — restauração de backup, limpeza de dados,
 * reinstalação. Sem acompanhar a troca, o motoboy simplesmente para de receber
 * oferta e não há nada na tela dizendo isso.
 */
export async function ativarPush(): Promise<boolean> {
  /**
   * Sem `google-services.json` o Firebase nao inicializa e qualquer chamada
   * daqui lanca. Sair em silencio e o certo: o aplicativo inteiro continua
   * util, so nao recebe push.
   */
  if (!firebaseDisponivel()) {
    return false;
  }

  const permitido = await pedirPermissaoDeNotificacao();
  if (!permitido) {
    return false;
  }

  const token = await getToken(getMessaging());
  const registrado = await registrarToken(token);
  if (!registrado) return false;

  cancelarRefresh?.();
  cancelarRefresh = onTokenRefresh(getMessaging(), (novo: string) => {
    registrarToken(novo).catch(() => undefined);
  });
  return true;
}

/**
 * Remove o aparelho ao sair da conta.
 *
 * Sem isto, o celular continuaria recebendo as ofertas do motoboy anterior —
 * inclusive o número do pedido na notificação, que é informação de outra
 * pessoa.
 */
export async function desativarPush(): Promise<void> {
  cancelarRefresh?.();
  cancelarRefresh = null;

  const token = tokenAtual;
  tokenAtual = null;
  if (!token) {
    return;
  }

  const acesso = await session.getToken();
  if (!acesso) {
    return;
  }
  await pushTokensApi.unregister(acesso, token).catch(() => undefined);
}

async function registrarToken(token: string): Promise<boolean> {
  const acesso = await session.getToken();
  if (!acesso) {
    return false;
  }

  await pushTokensApi.register(acesso, {
    token,
    platform: Platform.OS === 'ios' ? 'IOS' : 'ANDROID',
    appVersion,
  });
  tokenAtual = token;
  return true;
}
