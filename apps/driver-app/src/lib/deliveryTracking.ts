import { NativeModules, Platform } from 'react-native';
import { API_BASE_URL } from './config';
import { ensureBackgroundTrackingPermission, LocationError } from './location';
import { DRIVER_APP_VERSION } from './appVersion';

type NativeLocationTracking = {
  start(
    deliveryIds: string[],
    baseUrl: string,
    accessToken: string,
    appVersion: string,
  ): Promise<void>;
  stop(): Promise<void>;
};

function getNativeTracker(): NativeLocationTracking | null {
  return (NativeModules.LocationTracking as NativeLocationTracking | undefined) ?? null;
}

/**
 * Mantém um heartbeat leve enquanto o motoboy está online e reaproveita o
 * mesmo fix para os pedidos operacionais quando houver entrega ativa.
 */
export async function syncDeliveryTracking(
  accessToken: string,
  deliveryIds: string[],
  available = true,
): Promise<void> {
  const uniqueIds = [...new Set(deliveryIds.filter(Boolean))];
  const tracker = getNativeTracker();

  if (!available) {
    await tracker?.stop();
    return;
  }

  if (!tracker) {
    throw new LocationError(
      'Atualize o aplicativo para compartilhar a localização enquanto estiver online.',
    );
  }

  await ensureBackgroundTrackingPermission();
  await tracker.start(uniqueIds, API_BASE_URL, accessToken, DRIVER_APP_VERSION);
}

export async function stopDeliveryTracking(): Promise<void> {
  const tracker = getNativeTracker();
  if (tracker) await tracker.stop();
}

export const isBackgroundTrackingSupported = Platform.OS === 'android' || Platform.OS === 'ios';
