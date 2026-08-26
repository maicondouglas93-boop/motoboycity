import { NativeModules, Platform } from 'react-native';

type NativeFloatingShortcut = {
  status(): Promise<NativeFloatingShortcutStatus>;
  setEnabled?(enabled: boolean): Promise<void>;
  setEnabledWhenMinimized?(enabled: boolean): Promise<void>;
  setEnabledWhenOpen?(enabled: boolean): Promise<void>;
  setSizeDp?(sizeDp: number): Promise<void>;
  setKeepScreenOn?(enabled: boolean): Promise<void>;
};

type NativeFloatingShortcutStatus = Partial<FloatingShortcutStatus> & {
  enabled?: boolean;
  permissionGranted: boolean;
};

export type FloatingShortcutStatus = {
  enabledWhenMinimized: boolean;
  enabledWhenOpen: boolean;
  sizeDp: number;
  keepScreenOn: boolean;
  permissionGranted: boolean;
};

export const FLOATING_SHORTCUT_MIN_SIZE_DP = 48;
export const FLOATING_SHORTCUT_MAX_SIZE_DP = 96;
export const FLOATING_SHORTCUT_DEFAULT_SIZE_DP = 64;
export const FLOATING_SHORTCUT_SIZE_STEP_DP = 4;

function getNativeModule(): NativeFloatingShortcut | null {
  if (Platform.OS !== 'android') return null;
  return (NativeModules.FloatingShortcut as NativeFloatingShortcut | undefined) ?? null;
}

export async function consultarAtalhoFlutuante(): Promise<FloatingShortcutStatus | null> {
  const nativeModule = getNativeModule();
  if (!nativeModule) return null;
  const status = await nativeModule.status().catch(() => null);
  if (!status) return null;
  return {
    enabledWhenMinimized: status.enabledWhenMinimized ?? status.enabled ?? false,
    enabledWhenOpen: status.enabledWhenOpen ?? false,
    sizeDp: normalizarTamanho(status.sizeDp ?? FLOATING_SHORTCUT_DEFAULT_SIZE_DP),
    keepScreenOn: status.keepScreenOn ?? false,
    permissionGranted: status.permissionGranted,
  };
}

export async function definirAtalhoFlutuanteMinimizado(enabled: boolean): Promise<void> {
  const nativeModule = getNativeModule();
  if (!nativeModule) {
    if (Platform.OS === 'android') throw nativeModuleMissingError();
    return;
  }
  if (nativeModule.setEnabledWhenMinimized) {
    await nativeModule.setEnabledWhenMinimized(enabled);
    return;
  }
  if (nativeModule.setEnabled) {
    await nativeModule.setEnabled(enabled);
    return;
  }
  throw nativeModuleMissingError();
}

export async function definirAtalhoFlutuanteComAppAberto(enabled: boolean): Promise<void> {
  const nativeModule = getNativeModule();
  if (!nativeModule) {
    if (Platform.OS === 'android') throw nativeModuleMissingError();
    return;
  }
  if (!nativeModule.setEnabledWhenOpen) throw nativeModuleMissingError();
  await nativeModule.setEnabledWhenOpen(enabled);
}

export async function definirTamanhoAtalhoFlutuante(sizeDp: number): Promise<void> {
  const nativeModule = getNativeModule();
  if (!nativeModule) {
    if (Platform.OS === 'android') throw nativeModuleMissingError();
    return;
  }
  if (!nativeModule.setSizeDp) throw nativeModuleMissingError();
  await nativeModule.setSizeDp(normalizarTamanho(sizeDp));
}

export async function definirTelaLigada(enabled: boolean): Promise<void> {
  const nativeModule = getNativeModule();
  if (!nativeModule) {
    if (Platform.OS === 'android') throw nativeModuleMissingError();
    return;
  }
  if (!nativeModule.setKeepScreenOn) throw nativeModuleMissingError();
  await nativeModule.setKeepScreenOn(enabled);
}

function normalizarTamanho(sizeDp: number): number {
  const finiteSize = Number.isFinite(sizeDp) ? sizeDp : FLOATING_SHORTCUT_DEFAULT_SIZE_DP;
  const clamped = Math.min(
    FLOATING_SHORTCUT_MAX_SIZE_DP,
    Math.max(FLOATING_SHORTCUT_MIN_SIZE_DP, finiteSize),
  );
  return Math.round(clamped / FLOATING_SHORTCUT_SIZE_STEP_DP) * FLOATING_SHORTCUT_SIZE_STEP_DP;
}

function nativeModuleMissingError(): Error {
  return new Error('Atualize o aplicativo para usar estas opções do botão flutuante.');
}
