import { PermissionsAndroid, Platform } from 'react-native';
import { ensureBackgroundTrackingPermission, LocationError } from '../src/lib/location';

/**
 * O beco do Android 11+.
 *
 * A partir da API 30 o sistema NAO concede mais "Permitir o tempo todo" por
 * dialogo dentro do aplicativo: ele so oferece "Durante o uso do app", e a opcao
 * que o rastreamento precisa vive na tela de configuracoes. A recusa deixa de
 * ser recuperavel pedindo de novo — e o aplicativo dizia "ative nas
 * configuracoes" sem nenhum botao que levasse ate la, com o unico botao
 * disponivel repetindo a permissao que nunca ia ser concedida.
 */
describe('permissao de localizacao em segundo plano', () => {
  const versaoOriginal = Platform.Version;

  function responder(fine: string, background: string) {
    jest
      .spyOn(PermissionsAndroid, 'request')
      .mockImplementation(async (permission: string) =>
        permission === PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
          ? (fine as never)
          : (background as never),
      );
  }

  beforeEach(() => {
    Platform.OS = 'android';
  });

  afterEach(() => {
    jest.restoreAllMocks();
    Object.defineProperty(Platform, 'Version', { value: versaoOriginal, configurable: true });
  });

  function fixarVersao(versao: number) {
    Object.defineProperty(Platform, 'Version', { value: versao, configurable: true });
  }

  it('no Android 11+ manda para as configuracoes mesmo sem "nao perguntar de novo"', async () => {
    fixarVersao(30);
    responder(PermissionsAndroid.RESULTS.GRANTED, PermissionsAndroid.RESULTS.DENIED);

    const erro = await ensureBackgroundTrackingPermission().catch((e: unknown) => e);

    expect(erro).toBeInstanceOf(LocationError);
    expect((erro as LocationError).requiresSettings).toBe(true);
    expect((erro as LocationError).message).toContain('Permitir o tempo todo');
  });

  /**
   * No Android 10 o dialogo ainda resolve, entao uma recusa simples continua
   * sendo recuperavel pedindo de novo — mandar para as configuracoes ali seria
   * um desvio desnecessario.
   */
  it('no Android 10 uma recusa simples nao manda para as configuracoes', async () => {
    fixarVersao(29);
    responder(PermissionsAndroid.RESULTS.GRANTED, PermissionsAndroid.RESULTS.DENIED);

    const erro = await ensureBackgroundTrackingPermission().catch((e: unknown) => e);

    expect(erro).toBeInstanceOf(LocationError);
    expect((erro as LocationError).requiresSettings).toBe(false);
  });

  it('no Android 10 o bloqueio explicito manda para as configuracoes', async () => {
    fixarVersao(29);
    responder(PermissionsAndroid.RESULTS.GRANTED, PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN);

    const erro = await ensureBackgroundTrackingPermission().catch((e: unknown) => e);

    expect((erro as LocationError).requiresSettings).toBe(true);
  });

  it('a localizacao precisa bloqueada tambem oferece as configuracoes', async () => {
    fixarVersao(30);
    responder(PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN, PermissionsAndroid.RESULTS.DENIED);

    const erro = await ensureBackgroundTrackingPermission().catch((e: unknown) => e);

    expect(erro).toBeInstanceOf(LocationError);
    expect((erro as LocationError).requiresSettings).toBe(true);
  });

  it('com tudo concedido nao lanca nada', async () => {
    fixarVersao(30);
    responder(PermissionsAndroid.RESULTS.GRANTED, PermissionsAndroid.RESULTS.GRANTED);

    await expect(ensureBackgroundTrackingPermission()).resolves.toBeUndefined();
  });
});
