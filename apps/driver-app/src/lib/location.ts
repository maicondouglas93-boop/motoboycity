import Geolocation from '@react-native-community/geolocation';
import { PermissionsAndroid, Platform } from 'react-native';

export type LocationFix = {
  lat: number;
  lng: number;
  accuracy: number | undefined;
};

export class LocationError extends Error {
  /**
   * O diálogo do sistema não resolve mais: só a tela de configurações resolve.
   *
   * Quem trata o erro precisa saber disso para oferecer o atalho em vez de um
   * botão "tentar de novo" que vai falhar do mesmo jeito — foi exatamente o que
   * deixou motoboy preso no Android 11+, lendo "ative nas configurações" sem
   * nenhum caminho até lá.
   */
  constructor(
    message: string,
    readonly requiresSettings = false,
  ) {
    super(message);
    this.name = 'LocationError';
  }
}

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
    const bloqueada = permission === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN;
    throw new LocationError(
      bloqueada
        ? 'A localizacao precisa esta bloqueada. Abra as configuracoes e permita o acesso a localizacao.'
        : 'A localizacao precisa e necessaria para concluir esta acao.',
      bloqueada,
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
      /**
       * No Android 11 (API 30) em diante, "Permitir o tempo todo" DEIXOU de ser
       * concedível por diálogo dentro do aplicativo: o sistema só oferece
       * "Durante o uso do app", e a opção que precisamos vive na tela de
       * configurações. Ou seja, a partir dali a recusa nunca é recuperável
       * pedindo de novo — insistir no mesmo botão devolve o mesmo erro para
       * sempre, que era o beco em que o motoboy ficava.
       *
       * No Android 10 o diálogo ainda resolve, então só o bloqueio explícito
       * ("não perguntar de novo") manda para as configurações.
       */
      const precisaDosAjustes =
        Number(Platform.Version) >= 30 ||
        backgroundPermission === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN;
      throw new LocationError(
        precisaDosAjustes
          ? 'Para ficar online, o Android exige que voce escolha "Permitir o tempo todo" na tela de configuracoes de localizacao do aplicativo.'
          : 'A localização em segundo plano é necessária para ficar online.',
        precisaDosAjustes,
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
const COMPLETION_SECOND_PRECISE_TIMEOUT_MS = 4_000;
/** Alvo para tentar melhorar o fix; a API continua sendo quem aceita ou recusa. */
const COMPLETION_ACCURACY_RETRY_TARGET_METERS = 100;

function moreAccurateLocation(first: LocationFix, second: LocationFix): LocationFix {
  if (first.accuracy === undefined) return first;
  if (second.accuracy === undefined) return first;
  return second.accuracy < first.accuracy ? second : first;
}

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
export async function captureCompletionLocation(options?: {
  /** Tenta uma segunda leitura curta quando este ponto pode virar destino/preco. */
  improveImpreciseFix?: boolean;
}): Promise<LocationFix | null> {
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
    const firstPreciseFix = await obterPosicao({
      enableHighAccuracy: true,
      timeout: COMPLETION_PRECISE_TIMEOUT_MS,
      maximumAge: 0,
    });

    if (
      !options?.improveImpreciseFix ||
      firstPreciseFix.accuracy === undefined ||
      firstPreciseFix.accuracy <= COMPLETION_ACCURACY_RETRY_TARGET_METERS
    ) {
      return firstPreciseFix;
    }

    // Alguns aparelhos entregam primeiro uma leitura de rede mesmo com
    // `enableHighAccuracy`. Uma segunda leitura curta costuma receber o GPS
    // estabilizado. Se nao melhorar, o primeiro ponto ainda segue para a API.
    try {
      const secondPreciseFix = await obterPosicao({
        enableHighAccuracy: true,
        timeout: COMPLETION_SECOND_PRECISE_TIMEOUT_MS,
        maximumAge: 0,
      });
      return moreAccurateLocation(firstPreciseFix, secondPreciseFix);
    } catch (secondError) {
      if (!(secondError instanceof LocationError)) throw secondError;
      return firstPreciseFix;
    }
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
