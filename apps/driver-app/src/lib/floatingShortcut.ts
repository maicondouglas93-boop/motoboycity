import { NativeModules, Platform } from 'react-native';

type NativeFloatingShortcut = {
  status(): Promise<FloatingShortcutStatus>;
  setEnabled(enabled: boolean): Promise<void>;
};

export type FloatingShortcutStatus = {
  enabled: boolean;
  permissionGranted: boolean;
};

function getNativeModule(): NativeFloatingShortcut | null {
  if (Platform.OS !== 'android') return null;
  return (NativeModules.FloatingShortcut as NativeFloatingShortcut | undefined) ?? null;
}

export async function consultarAtalhoFlutuante(): Promise<FloatingShortcutStatus | null> {
  return (
    getNativeModule()
      ?.status()
      .catch(() => null) ?? null
  );
}

export async function definirAtalhoFlutuante(enabled: boolean): Promise<void> {
  const nativeModule = getNativeModule();
  if (!nativeModule) {
    if (Platform.OS === 'android') {
      throw new Error('Atualize o aplicativo para usar o botão flutuante.');
    }
    return;
  }
  await nativeModule.setEnabled(enabled);
}
