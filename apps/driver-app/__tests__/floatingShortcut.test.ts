import { NativeModules, Platform } from 'react-native';
import { consultarAtalhoFlutuante, definirAtalhoFlutuante } from '../src/lib/floatingShortcut';

describe('atalho flutuante Android', () => {
  const status = jest.fn();
  const setEnabled = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true });
    status.mockResolvedValue({ enabled: true, permissionGranted: true });
    setEnabled.mockResolvedValue(undefined);
    (NativeModules as Record<string, unknown>).FloatingShortcut = { status, setEnabled };
  });

  it('consulta o estado persistido no modulo nativo', async () => {
    await expect(consultarAtalhoFlutuante()).resolves.toEqual({
      enabled: true,
      permissionGranted: true,
    });
    expect(status).toHaveBeenCalledTimes(1);
  });

  it('ativa e desativa pelo modulo nativo', async () => {
    await definirAtalhoFlutuante(true);
    await definirAtalhoFlutuante(false);

    expect(setEnabled).toHaveBeenNthCalledWith(1, true);
    expect(setEnabled).toHaveBeenNthCalledWith(2, false);
  });

  it('nao tenta controlar sobreposicao fora do Android', async () => {
    Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true });

    await expect(consultarAtalhoFlutuante()).resolves.toBeNull();
    await expect(definirAtalhoFlutuante(true)).resolves.toBeUndefined();
    expect(status).not.toHaveBeenCalled();
    expect(setEnabled).not.toHaveBeenCalled();
  });

  it('recusa ativacao em APK Android sem o modulo nativo', async () => {
    (NativeModules as Record<string, unknown>).FloatingShortcut = undefined;

    await expect(definirAtalhoFlutuante(true)).rejects.toThrow(
      'Atualize o aplicativo para usar o botão flutuante.',
    );
  });
});
