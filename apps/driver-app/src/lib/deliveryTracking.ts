import { NativeModules, Platform } from 'react-native';
import { API_BASE_URL } from './config';
import { ensureBackgroundTrackingPermission, LocationError } from './location';

type NativeLocationTracking = {
  start(deliveryIds: string[], baseUrl: string, accessToken: string): Promise<void>;
  stop(): Promise<void>;
};

function getNativeTracker(): NativeLocationTracking | null {
  return (NativeModules.LocationTracking as NativeLocationTracking | undefined) ?? null;
}

/**
 * Mantém o serviço nativo limitado às entregas operacionais atuais. Não há
 * monitoramento fora de ACCEPTED, COLLECTED ou DELIVERED.
 */
export async function syncDeliveryTracking(
  accessToken: string,
  deliveryIds: string[],
): Promise<void> {
  const uniqueIds = [...new Set(deliveryIds.filter(Boolean))];
  const tracker = getNativeTracker();

  if (uniqueIds.length === 0) {
    await tracker?.stop();
    return;
  }

  if (!tracker) {
    throw new LocationError(
      'Atualize o aplicativo para ativar o rastreamento exigido durante uma entrega ativa.',
    );
  }

  await ensureBackgroundTrackingPermission();
  await tracker.start(uniqueIds, API_BASE_URL, accessToken);
}

export async function stopDeliveryTracking(): Promise<void> {
  const tracker = getNativeTracker();
  if (tracker) await tracker.stop();
}

export const isBackgroundTrackingSupported = Platform.OS === 'android' || Platform.OS === 'ios';
