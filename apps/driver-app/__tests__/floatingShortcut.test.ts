import { NativeModules, Platform } from 'react-native';
import {
  consultarAtalhoFlutuante,
  definirAtalhoFlutuanteComAppAberto,
  definirAtalhoFlutuanteMinimizado,
  definirTamanhoAtalhoFlutuante,
  definirTelaLigada,
} from '../src/lib/floatingShortcut';

describe('atalho flutuante Android', () => {
  const status = jest.fn();
  const setEnabled = jest.fn();
  const setEnabledWhenMinimized = jest.fn();
  const setEnabledWhenOpen = jest.fn();
  const setSizeDp = jest.fn();
  const setKeepScreenOn = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true });
    status.mockResolvedValue({
      enabled: true,
      enabledWhenMinimized: true,
      enabledWhenOpen: false,
      sizeDp: 72,
      keepScreenOn: true,
      permissionGranted: true,
    });
    setEnabled.mockResolvedValue(undefined);
    setEnabledWhenMinimized.mockResolvedValue(undefined);
    setEnabledWhenOpen.mockResolvedValue(undefined);
    setSizeDp.mockResolvedValue(undefined);
    setKeepScreenOn.mockResolvedValue(undefined);
    (NativeModules as Record<string, unknown>).FloatingShortcut = {
      status,
      setEnabled,
      setEnabledWhenMinimized,
      setEnabledWhenOpen,
      setSizeDp,
      setKeepScreenOn,
    };
  });

  it('consulta o estado persistido no modulo nativo', async () => {
    await expect(consultarAtalhoFlutuante()).resolves.toEqual({
      enabledWhenMinimized: true,
      enabledWhenOpen: false,
      sizeDp: 72,
      keepScreenOn: true,
      permissionGranted: true,
    });
    expect(status).toHaveBeenCalledTimes(1);
  });

  it('preserva a preferencia antiga e aplica defaults ao atualizar o APK', async () => {
    status.mockResolvedValue({ enabled: true, permissionGranted: true });

    await expect(consultarAtalhoFlutuante()).resolves.toEqual({
      enabledWhenMinimized: true,
      enabledWhenOpen: false,
      sizeDp: 64,
      keepScreenOn: false,
      permissionGranted: true,
    });
  });

  it('altera visibilidade, tamanho e tela pela ponte nativa', async () => {
    await definirAtalhoFlutuanteMinimizado(true);
    await definirAtalhoFlutuanteComAppAberto(true);
    await definirTamanhoAtalhoFlutuante(74);
    await definirTamanhoAtalhoFlutuante(Number.NaN);
    await definirTelaLigada(true);

    expect(setEnabledWhenMinimized).toHaveBeenCalledWith(true);
    expect(setEnabledWhenOpen).toHaveBeenCalledWith(true);
    expect(setSizeDp).toHaveBeenNthCalledWith(1, 76);
    expect(setSizeDp).toHaveBeenNthCalledWith(2, 64);
    expect(setKeepScreenOn).toHaveBeenCalledWith(true);
  });

  it('usa o metodo antigo como fallback apenas para o modo minimizado', async () => {
    (NativeModules as Record<string, unknown>).FloatingShortcut = { status, setEnabled };

    await definirAtalhoFlutuanteMinimizado(false);

    expect(setEnabled).toHaveBeenCalledWith(false);
    await expect(definirAtalhoFlutuanteComAppAberto(true)).rejects.toThrow(
      'Atualize o aplicativo para usar estas opções do botão flutuante.',
    );
  });

  it('nao tenta controlar sobreposicao fora do Android', async () => {
    Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true });

    await expect(consultarAtalhoFlutuante()).resolves.toBeNull();
    await expect(definirAtalhoFlutuanteMinimizado(true)).resolves.toBeUndefined();
    await expect(definirAtalhoFlutuanteComAppAberto(true)).resolves.toBeUndefined();
    await expect(definirTamanhoAtalhoFlutuante(80)).resolves.toBeUndefined();
    await expect(definirTelaLigada(true)).resolves.toBeUndefined();
    expect(status).not.toHaveBeenCalled();
    expect(setEnabled).not.toHaveBeenCalled();
    expect(setEnabledWhenMinimized).not.toHaveBeenCalled();
  });

  it('recusa ativacao em APK Android sem o modulo nativo', async () => {
    (NativeModules as Record<string, unknown>).FloatingShortcut = undefined;

    await expect(definirAtalhoFlutuanteMinimizado(true)).rejects.toThrow(
      'Atualize o aplicativo para usar estas opções do botão flutuante.',
    );
  });
});
