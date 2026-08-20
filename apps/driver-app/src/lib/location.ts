import Geolocation from '@react-native-community/geolocation';
import { PermissionsAndroid, Platform } from 'react-native';

export type LocationFix = {
  lat: number;
  lng: number;
  accuracy: number | undefined;
};

export class LocationError extends Error {}

export async function ensurePreciseLocationPermission(): Promise<void> {
  if (Platform.OS !== 'android') return;

  const permission = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
    {
      title: 'Permitir localizacao precisa',
      message: 'Usamos sua localizacao somente para concluir entregas e retornos.',
      buttonPositive: 'Permitir',
      buttonNegative: 'Agora nao',
    },
  );

  if (permission !== PermissionsAndroid.RESULTS.GRANTED) {
    throw new LocationError(
      permission === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN
        ? 'A localizacao precisa esta bloqueada. Ative-a nas configuracoes do aplicativo.'
        : 'A localizacao precisa e necessaria para concluir esta acao.',
    );
  }
}

/**
 * O rastreamento ativo exige permissão em segundo plano no Android. No iOS a
 * autorização "Sempre" é solicitada pelo módulo nativo, junto ao Core Location.
 */
export async function ensureBackgroundTrackingPermission(): Promise<void> {
  if (Platform.OS !== 'android') return;

  await ensurePreciseLocationPermission();

  if (Number(Platform.Version) >= 29) {
    const backgroundPermission = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.ACCESS_BACKGROUND_LOCATION,
      {
        title: 'Permitir rastreamento durante a entrega',
        message:
          'Com uma entrega ativa, precisamos da localização mesmo com o aplicativo fechado. O rastreamento para ao encerrar o pedido.',
        buttonPositive: 'Permitir',
        buttonNegative: 'Agora não',
      },
    );

    if (backgroundPermission !== PermissionsAndroid.RESULTS.GRANTED) {
      throw new LocationError(
        backgroundPermission === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN
          ? 'A localização em segundo plano está bloqueada. Ative-a nas configurações do aplicativo.'
          : 'A localização em segundo plano é necessária durante uma entrega ativa.',
      );
    }
  }

  if (Number(Platform.Version) >= 33) {
    await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS).catch(
      () => undefined,
    );
  }
}

function locationErrorMessage(code: number): string {
  if (code === 1) return 'A permissao de localizacao foi negada.';
  if (code === 2)
    return 'Nao foi possivel determinar sua localizacao. Verifique se o GPS esta ligado.';
  if (code === 3)
    return 'A localizacao demorou demais para responder. Tente novamente em um local aberto.';
  return 'Nao foi possivel obter sua localizacao agora. Tente novamente.';
}

/** Captura unica, precisa e sem rastreamento em segundo plano. */
export async function captureCurrentLocation(): Promise<LocationFix> {
  await ensurePreciseLocationPermission();

  return new Promise((resolve, reject) => {
    Geolocation.getCurrentPosition(
      (position) => {
        if ('mocked' in position && position.mocked === true) {
          reject(
            new LocationError('A localizacao simulada nao pode ser usada para concluir esta acao.'),
          );
          return;
        }

        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy ?? undefined,
        });
      },
      (error) => reject(new LocationError(locationErrorMessage(error.code))),
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 0 },
    );
  });
}
