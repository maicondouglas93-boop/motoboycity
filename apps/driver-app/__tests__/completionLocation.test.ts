import Geolocation from '@react-native-community/geolocation';
import { PermissionsAndroid, Platform } from 'react-native';
import { captureCompletionLocation } from '../src/lib/location';

type PositionSuccess = (position: {
  coords: { latitude: number; longitude: number; accuracy: number | null };
}) => void;
type PositionFailure = (error: { code: number }) => void;

const getCurrentPosition = Geolocation.getCurrentPosition as jest.Mock;

function fix(lat: number, lng: number, accuracy: number | null) {
  return { coords: { latitude: lat, longitude: lng, accuracy } };
}

/** Responde o n-esimo `getCurrentPosition` com sucesso ou falha. */
function responder(...respostas: Array<{ ok: true; accuracy: number } | { ok: false }>) {
  respostas.forEach((resposta) => {
    getCurrentPosition.mockImplementationOnce(
      (sucesso: PositionSuccess, falha: PositionFailure) => {
        if (resposta.ok) sucesso(fix(-20.15, -41.62, resposta.accuracy));
        // 3 = POSITION_UNAVAILABLE no contrato do Geolocation.
        else falha({ code: 3 });
      },
    );
  });
}

describe('captura de posicao para coleta, entrega e retorno', () => {
  beforeEach(() => {
    getCurrentPosition.mockReset();
    Platform.OS = 'android';
    jest
      .spyOn(PermissionsAndroid, 'request')
      .mockResolvedValue(PermissionsAndroid.RESULTS.GRANTED as never);
  });

  afterEach(() => jest.restoreAllMocks());

  it('usa o GPS fino quando ele responde', async () => {
    responder({ ok: true, accuracy: 8 });

    await expect(captureCompletionLocation()).resolves.toEqual({
      lat: -20.15,
      lng: -41.62,
      accuracy: 8,
    });
    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
    expect(getCurrentPosition).toHaveBeenNthCalledWith(
      1,
      expect.any(Function),
      expect.any(Function),
      { enableHighAccuracy: true, timeout: 8_000, maximumAge: 0 },
    );
  });

  /**
   * O caso que travava o motoboy: garagem, predio, economia de bateria. Antes a
   * acao nem saia do celular; agora ela sai com a posicao que existir.
   */
  it('cai para a posicao aproximada quando o GPS fino nao fecha', async () => {
    responder({ ok: false }, { ok: true, accuracy: 850 });

    await expect(captureCompletionLocation()).resolves.toEqual({
      lat: -20.15,
      lng: -41.62,
      accuracy: 850,
    });
    expect(getCurrentPosition).toHaveBeenCalledTimes(2);
    expect(getCurrentPosition).toHaveBeenNthCalledWith(
      2,
      expect.any(Function),
      expect.any(Function),
      { enableHighAccuracy: false, timeout: 4_000, maximumAge: 0 },
    );
  });

  /**
   * Sem teto de precisao aqui de proposito: quem decide se 850m serve e o
   * servidor, comparando com o raio que o administrador configurou. Um teto
   * local seria mais uma trava fora do alcance de quem opera.
   */
  it('nao recusa uma posicao imprecisa por conta propria', async () => {
    responder({ ok: false }, { ok: true, accuracy: 4000 });

    await expect(captureCompletionLocation()).resolves.toMatchObject({ accuracy: 4000 });
  });

  it('devolve null quando nenhuma das duas tentativas responde', async () => {
    responder({ ok: false }, { ok: false });

    await expect(captureCompletionLocation()).resolves.toBeNull();
  });

  /**
   * Permissao negada tambem devolve null em vez de estourar: a etapa segue sem
   * posicao e o servidor recusa — com o motivo — apenas se o raio exigir.
   */
  it('devolve null quando a permissao de localizacao foi negada', async () => {
    jest
      .spyOn(PermissionsAndroid, 'request')
      .mockResolvedValue(PermissionsAndroid.RESULTS.DENIED as never);

    await expect(captureCompletionLocation()).resolves.toBeNull();
    expect(getCurrentPosition).not.toHaveBeenCalled();
  });
});
