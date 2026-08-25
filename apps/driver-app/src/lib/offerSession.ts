import { NativeModules, Platform } from 'react-native';

interface OfferSessionNativo {
  save(apiUrl: string, accessToken: string): Promise<void>;
  clear(): Promise<void>;
  dismiss(offerId: string): Promise<void>;
  presentationStatus(): Promise<NativeOfferPresentationStatus>;
  openFullScreenSettings(): Promise<void>;
  openOverlaySettings(): Promise<void>;
}

export interface NativeOfferPresentationStatus {
  notificationsEnabled: boolean;
  fullScreenGranted: boolean;
  fullScreenNeedsManualGrant: boolean;
  overlayGranted: boolean;
  overlayNeedsManualGrant: boolean;
}

/**
 * Espelha a sessao para o lado NATIVO, onde vivem os botoes da notificacao.
 *
 * Aceitar e recusar sao respondidos por um `BroadcastReceiver` do Android, que
 * nao tem como ler o AsyncStorage do JavaScript. Sem este espelho, os botoes
 * apareceriam e nao fariam nada.
 *
 * O modulo nao existe no iOS nem no ambiente de teste, entao tudo aqui e
 * tolerante a ausencia: um aplicativo que quebra porque um modulo nativo nao
 * esta la e pior que um aplicativo sem os botoes.
 */
const modulo = (NativeModules as { OfferSession?: OfferSessionNativo }).OfferSession;

export async function salvarSessaoNativa(apiUrl: string, accessToken: string): Promise<void> {
  if (Platform.OS !== 'android' || !modulo) return;
  await modulo.save(apiUrl, accessToken).catch(() => undefined);
}

/**
 * Limpar ao sair e obrigatorio, nao higiene.
 *
 * Um token esquecido ali deixaria os botoes respondendo ofertas em nome de quem
 * ja saiu da conta — no mesmo aparelho em que outro motoboy pode entrar depois.
 */
export async function limparSessaoNativa(): Promise<void> {
  if (Platform.OS !== 'android' || !modulo) return;
  await modulo.clear().catch(() => undefined);
}

/** Remove a faixa/cartão Android depois que o React Native resolveu a oferta. */
export async function dispensarOfertaNativa(offerId: string): Promise<void> {
  if (Platform.OS !== 'android' || !modulo) return;
  await modulo.dismiss(offerId).catch(() => undefined);
}

export async function consultarApresentacaoNativa(): Promise<NativeOfferPresentationStatus | null> {
  if (Platform.OS !== 'android' || !modulo) return null;
  return modulo.presentationStatus().catch(() => null);
}

export async function abrirAjusteDeTelaCheia(): Promise<void> {
  if (Platform.OS !== 'android' || !modulo) return;
  await modulo.openFullScreenSettings().catch(() => undefined);
}

export async function abrirAjusteDeSobreposicao(): Promise<void> {
  if (Platform.OS !== 'android' || !modulo) return;
  await modulo.openOverlaySettings().catch(() => undefined);
}
