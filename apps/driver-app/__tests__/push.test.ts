import { NativeModules, PermissionsAndroid, Platform } from 'react-native';
import {
  deleteToken,
  getMessaging,
  getToken,
  onTokenRefresh,
} from '@react-native-firebase/messaging';
import { ativarPush, desativarPush } from '../src/lib/push';
import {
  abrirAjusteDeSobreposicao,
  abrirAjusteDeTelaCheia,
  consultarApresentacaoNativa,
  dispensarOfertaNativa,
  iniciarAlarmeDaOfertaNativa,
  limparSessaoNativa,
  pararAlarmeDaOfertaNativa,
  salvarSessaoNativa,
} from '../src/lib/offerSession';
import { pushTokensApi } from '../src/lib/apiClient';
import { session } from '../src/lib/session';

jest.mock('../src/lib/apiClient', () => ({
  pushTokensApi: {
    register: jest.fn(() => Promise.resolve({ ok: true })),
    unregister: jest.fn(() => Promise.resolve({ ok: true })),
  },
}));

jest.mock('../src/lib/session', () => ({
  session: { getToken: jest.fn(() => Promise.resolve('acesso-1')) },
}));

/**
 * `PermissionsAndroid.request` vem real do preset do React Native, entao e
 * preciso espiona-lo em vez de esperar um mock pronto.
 */
const permissionRequest = jest.spyOn(PermissionsAndroid, 'request');

describe('push do app do motoboy', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // O preset do React Native assume iOS. O piloto e Android, e o caminho de
    // permissao e completamente diferente nos dois.
    Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true });
    Object.defineProperty(Platform, 'Version', { value: 34, configurable: true });
    permissionRequest.mockResolvedValue(PermissionsAndroid.RESULTS.GRANTED);
    (getToken as jest.Mock).mockResolvedValue('fcm-abc');
    (onTokenRefresh as jest.Mock).mockReturnValue(() => undefined);
  });

  it('registra o aparelho quando a permissão é concedida', async () => {
    await expect(ativarPush()).resolves.toBe(true);

    expect(pushTokensApi.register).toHaveBeenCalledWith('acesso-1', {
      token: 'fcm-abc',
      platform: 'ANDROID',
      appVersion: expect.any(String),
    });
  });

  it('não registra nada quando a permissão é negada', async () => {
    // Push que chega ao aparelho e nao aparece para ninguem e pior que push
    // nenhum: o servidor contaria como entregue.
    permissionRequest.mockResolvedValue(PermissionsAndroid.RESULTS.DENIED);

    await expect(ativarPush()).resolves.toBe(false);

    expect(getToken).not.toHaveBeenCalled();
    expect(pushTokensApi.register).not.toHaveBeenCalled();
  });

  it('abaixo do Android 13 não pede permissão, porque ela já veio na instalação', async () => {
    Object.defineProperty(Platform, 'Version', { value: 30, configurable: true });

    await ativarPush();

    expect(permissionRequest).not.toHaveBeenCalled();
    expect(pushTokensApi.register).toHaveBeenCalled();
  });

  it('reregistra quando o FCM troca o token sozinho', async () => {
    // Restauracao de backup, limpeza de dados, reinstalacao. Sem acompanhar a
    // troca, o motoboy simplesmente para de receber oferta e nada na tela diz
    // isso.
    /**
     * Array em vez de variavel solta: o TypeScript estreita uma variavel
     * atribuida so dentro de callback para o tipo inicial, e chamar depois
     * viraria erro de compilacao.
     */
    const ouvintes: ((token: string) => void)[] = [];
    (onTokenRefresh as jest.Mock).mockImplementation(
      (_messaging: unknown, listener: (token: string) => void) => {
        ouvintes.push(listener);
        return () => undefined;
      },
    );

    await ativarPush();
    ouvintes[0]?.('fcm-novo');
    await Promise.resolve();
    await Promise.resolve();

    expect(pushTokensApi.register).toHaveBeenLastCalledWith(
      'acesso-1',
      expect.objectContaining({ token: 'fcm-novo' }),
    );
  });

  it('ao sair da conta, desregistra o aparelho', async () => {
    // Sem isto, o celular continuaria recebendo as ofertas do motoboy anterior
    // — inclusive o numero do pedido na notificacao.
    await ativarPush();
    await desativarPush();

    expect(pushTokensApi.unregister).toHaveBeenCalledWith('acesso-1', 'fcm-abc');
  });

  it('sair sem nunca ter registrado não chama o servidor', async () => {
    await desativarPush();

    expect(pushTokensApi.unregister).not.toHaveBeenCalled();
  });

  it('remove o token FCM local quando a API invalidou uma sessão restaurada', async () => {
    await desativarPush({ clearLocalToken: true });

    expect(getToken).toHaveBeenCalled();
    expect(deleteToken).toHaveBeenCalled();
  });

  it('sem sessão válida, não tenta registrar', async () => {
    (session.getToken as jest.Mock).mockResolvedValue(null);

    await expect(ativarPush()).resolves.toBe(false);

    expect(pushTokensApi.register).not.toHaveBeenCalled();
  });

  it('informa quando o Firebase nativo nao esta disponivel', async () => {
    (getMessaging as jest.Mock).mockImplementationOnce(() => {
      throw new Error('Firebase ausente');
    });

    await expect(ativarPush()).resolves.toBe(false);

    expect(getToken).not.toHaveBeenCalled();
  });

  it('espelha a sessão para o lado nativo ao entrar', async () => {
    // Os botoes de aceitar e recusar da notificacao sao respondidos pelo lado
    // nativo, que nao le o AsyncStorage. Sem o espelho eles apareceriam e nao
    // fariam nada.
    await salvarSessaoNativa('http://api.exemplo', 'acesso-1');

    expect(NativeModules.OfferSession.save).toHaveBeenCalledWith('http://api.exemplo', 'acesso-1');
  });

  it('limpa a sessão nativa ao sair', async () => {
    // Token esquecido ali deixaria os botoes respondendo ofertas em nome de
    // quem ja saiu, no mesmo aparelho em que outro pode entrar depois.
    await limparSessaoNativa();

    expect(NativeModules.OfferSession.clear).toHaveBeenCalled();
  });

  it('fecha a apresentação nativa quando a oferta é resolvida no React Native', async () => {
    await dispensarOfertaNativa('oferta-1');

    expect(NativeModules.OfferSession.dismiss).toHaveBeenCalledWith('oferta-1');
  });

  it('controla o alarme nativo usado pela tela React Native da oferta', async () => {
    await iniciarAlarmeDaOfertaNativa('oferta-1');
    await pararAlarmeDaOfertaNativa('oferta-1');

    expect(NativeModules.OfferSession.startOfferAlarm).toHaveBeenCalledWith('oferta-1');
    expect(NativeModules.OfferSession.stopOfferAlarm).toHaveBeenCalledWith('oferta-1');
  });

  it('consulta e abre o acesso especial de tela cheia do Android', async () => {
    await expect(consultarApresentacaoNativa()).resolves.toEqual({
      notificationsEnabled: true,
      fullScreenGranted: true,
      fullScreenNeedsManualGrant: true,
      overlayGranted: true,
      overlayNeedsManualGrant: true,
    });
    await abrirAjusteDeTelaCheia();
    await abrirAjusteDeSobreposicao();

    expect(NativeModules.OfferSession.presentationStatus).toHaveBeenCalled();
    expect(NativeModules.OfferSession.openFullScreenSettings).toHaveBeenCalled();
    expect(NativeModules.OfferSession.openOverlaySettings).toHaveBeenCalled();
  });
});
