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
      message: 'Usamos sua localizacao enquanto voce estiver online e durante as entregas.',
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
        title: 'Permitir localizacao enquanto online',
        message:
          'Enquanto você estiver online, precisamos da localização mesmo com o aplicativo fechado. O compartilhamento para ao ficar offline.',
        buttonPositive: 'Permitir',
        buttonNegative: 'Agora não',
      },
    );

    if (backgroundPermission !== PermissionsAndroid.RESULTS.GRANTED) {
      throw new LocationError(
        backgroundPermission === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN
          ? 'A localização em segundo plano está bloqueada. Ative-a nas configurações do aplicativo.'
          : 'A localização em segundo plano é necessária para ficar online.',
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

type OpcoesDeCaptura = {
  enableHighAccuracy: boolean;
  timeout: number;
  maximumAge: number;
};

function obterPosicao(opcoes: OpcoesDeCaptura): Promise<LocationFix> {
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
      opcoes,
    );
  });
}

/**
 * Captura unica, precisa e sem rastreamento em segundo plano.
 *
 * Exige posicao nova em folha (`maximumAge: 0`) de proposito: e usada na coleta,
 * entrega e retorno, onde a posicao serve de comprovacao de presenca fisica.
 * Uma posicao guardada de minutos atras nao comprova nada.
 */
export async function captureCurrentLocation(): Promise<LocationFix> {
  await ensurePreciseLocationPermission();

  return obterPosicao({ enableHighAccuracy: true, timeout: 20_000, maximumAge: 0 });
}

const COMPLETION_PRECISE_TIMEOUT_MS = 8_000;
const COMPLETION_APPROXIMATE_TIMEOUT_MS = 4_000;

/**
 * Captura para coleta, entrega e retorno — tenta o melhor fix, mas nunca
 * impede definitivamente a acao.
 *
 * A versao estrita acima trancava o motoboy no aparelho: se o GPS fino nao
 * fechasse no prazo — garagem, predio, economia de bateria, permissao
 * negada — a acao nem chegava a sair do celular. E trancava mesmo com todos os
 * raios desligados no painel, porque a decisao estava aqui, no lugar onde o
 * administrador nao alcanca.
 *
 * Agora a posicao e uma INFORMACAO enviada ao servidor, nao um pre-requisito
 * local. Quem decide se ela basta e a regra de proximidade: com o raio
 * desligado qualquer coisa serve, e com o raio ligado o servidor recusa
 * dizendo o numero exato ("a precisao agora e 800m, maior que o raio de
 * 500m"). A decisao volta para a tela de configuracoes.
 *
 * Nao ha teto de precisao aqui, ao contrario da captura de presenca: o teto e
 * o proprio raio configurado, e quem escolheu o raio foi o administrador.
 */
export async function captureCompletionLocation(): Promise<LocationFix | null> {
  try {
    await ensurePreciseLocationPermission();
  } catch {
    // Permissao negada ou bloqueada. O servidor decide se isso impede a etapa.
    return null;
  }

  // `maximumAge: 0` no primeiro tento: a posicao serve de comprovacao, entao
  // vale insistir por uma nova antes de aceitar qualquer alternativa. A espera
  // total fica limitada a 12 segundos para a tela nao parecer travada.
  try {
    return await obterPosicao({
      enableHighAccuracy: true,
      timeout: COMPLETION_PRECISE_TIMEOUT_MS,
      maximumAge: 0,
    });
  } catch (erroDoGpsFino) {
    if (!(erroDoGpsFino instanceof LocationError)) throw erroDoGpsFino;
  }

  try {
    return await obterPosicao({
      enableHighAccuracy: false,
      timeout: COMPLETION_APPROXIMATE_TIMEOUT_MS,
      // Um ponto antigo nao comprova a etapa e pode virar destino e preco.
      maximumAge: 0,
    });
  } catch (erroDaAproximada) {
    if (!(erroDaAproximada instanceof LocationError)) throw erroDaAproximada;
    return null;
  }
}

/** Acima disso a posicao e grosseira demais para escolher o motoboy mais proximo. */
const PRECISAO_MAXIMA_PARA_FICAR_ONLINE = 1_000;

/**
 * Captura para ficar online — mais tolerante que a de comprovacao.
 *
 * Ficar online quase sempre acontece de dentro de casa ou de uma loja, onde o
 * GPS fino nao fecha nos 20 segundos da captura estrita. Com a regra estrita o
 * motoboy simplesmente nao consegue comecar a trabalhar, que foi o que travou o
 * teste no aparelho.
 *
 * Entao aqui: aceita posicao do ultimo minuto e, se o GPS fino falhar, cai para
 * a localizacao aproximada (rede/celula). O rastreamento continuo comeca logo
 * em seguida e a precisao sobe sozinha.
 *
 * O limite de precisao existe porque a localizacao por celula pode errar
 * quilometros, e essa posicao alimenta a escolha do motoboy mais proximo.
 */
export async function capturePresenceLocation(): Promise<LocationFix> {
  await ensurePreciseLocationPermission();

  let posicao: LocationFix;
  try {
    posicao = await obterPosicao({
      enableHighAccuracy: true,
      timeout: 15_000,
      maximumAge: 60_000,
    });
  } catch (erroDoGpsFino) {
    if (!(erroDoGpsFino instanceof LocationError)) throw erroDoGpsFino;
    posicao = await obterPosicao({
      enableHighAccuracy: false,
      timeout: 15_000,
      maximumAge: 120_000,
    });
  }

  if (posicao.accuracy !== undefined && posicao.accuracy > PRECISAO_MAXIMA_PARA_FICAR_ONLINE) {
    throw new LocationError(
      'Sua localizacao esta imprecisa demais para ficar online. Va para um local mais aberto e tente de novo.',
    );
  }

  return posicao;
}
