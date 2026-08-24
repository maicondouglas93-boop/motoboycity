import { useRef } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import MapView, { PROVIDER_GOOGLE, type UserLocationChangeEvent } from 'react-native-maps';
import { colors } from '../theme/colors';

/**
 * O mapa que fica atras de tudo na tela principal.
 *
 * A chave do Google Maps entra pelo Manifest, vinda de
 * `android/local.properties` — fora do Git, porque o repositorio e publico. Sem
 * chave o aplicativo abre normalmente e o mapa aparece em branco; e por isso
 * que o fundo ja nasce na cor de terreno, para o branco nao dar impressao de
 * tela quebrada.
 *
 * O ponto azul de posicao e desenhado pelo proprio Google a partir do GPS do
 * aparelho, e nao pelo aplicativo. Isso e de proposito: e o mesmo ponto que a
 * pessoa ve no Google Maps, com a mesma suavizacao de movimento, e nao um
 * marcador nosso pulando a cada leitura.
 */

/**
 * Centro de Lajinha - MG, onde a operacao acontece.
 *
 * Coordenada conferida na Geocoding API, e nao estimada: a primeira versao
 * usava -20.1389 / -41.6069, cerca de 2 km ao norte daqui. So aparecia nos
 * segundos antes do primeiro fix de GPS, mas comecava a tela no lugar errado.
 */
const CENTRO_DA_OPERACAO = {
  latitude: -20.1522,
  longitude: -41.6232,
  // ~2 km de largura: a cidade inteira cabe, e os nomes de rua ainda se leem.
  latitudeDelta: 0.02,
  longitudeDelta: 0.02,
};

/**
 * Quanto da tela a folha cobre quando ninguem arrastou ainda.
 *
 * Esta fracao vira `mapPadding`, sem o qual o Google centraliza o ponto azul no
 * meio da tela INTEIRA — ou seja, atras da folha, onde ninguem ve. Quando a
 * folha e arrastada ela informa a fracao nova, e o padding acompanha.
 */
const FRACAO_PADRAO_DA_FOLHA = 0.52;

/**
 * ~800 m de largura: as ruas ao redor aparecem com nome legivel de relance.
 *
 * Fica proximo de proposito. O motoboy nao usa este mapa para planejar a rota —
 * para isso ele abre o Google Maps pelo botao de rota. Aqui ele so precisa se
 * situar: em que rua estou, e para que lado.
 */
const ESCALA_DE_BAIRRO = 0.008;

type Props = {
  children?: React.ReactNode;
  /**
   * Deixa o motoboy arrastar e dar zoom. Fica desligado por padrao porque nas
   * telas de oferta e de operacao o mapa e so pano de fundo: ali ele roubaria o
   * toque de quem esta tentando aceitar o pedido.
   */
  interactive?: boolean;
  /** Fracao da tela coberta pela folha, para o ponto azul nao ficar atras dela. */
  sheetFraction?: number;
};

export function MapBackdrop({
  children,
  interactive = false,
  sheetFraction = FRACAO_PADRAO_DA_FOLHA,
}: Props) {
  const { height } = useWindowDimensions();
  const alturaDaFolha = interactive ? Math.round(height * sheetFraction) : 0;
  const mapa = useRef<MapView | null>(null);
  const jaCentralizou = useRef(false);

  /**
   * Leva o mapa ate o motoboy na PRIMEIRA posicao que chegar, e so nessa.
   *
   * Nao existe `followsUserLocation` no Android — a propriedade e do iOS, e no
   * Android ela e ignorada em silencio. Sem isto o mapa ficava parado no centro
   * da cidade enquanto o ponto azul aparecia fora da tela.
   *
   * Centralizar uma vez so e proposital: seguir a posicao para sempre tiraria o
   * mapa do lugar toda vez que o motoboy tentasse arrastar para olhar o
   * caminho.
   */
  function aoReceberPosicao(evento: UserLocationChangeEvent) {
    if (jaCentralizou.current) return;
    const coordenada = evento.nativeEvent.coordinate;
    if (!coordenada) return;

    jaCentralizou.current = true;
    mapa.current?.animateToRegion(
      {
        latitude: coordenada.latitude,
        longitude: coordenada.longitude,
        latitudeDelta: ESCALA_DE_BAIRRO,
        longitudeDelta: ESCALA_DE_BAIRRO,
      },
      600,
    );
  }

  return (
    <View style={styles.map}>
      <MapView
        ref={mapa}
        provider={PROVIDER_GOOGLE}
        style={StyleSheet.absoluteFill}
        initialRegion={CENTRO_DA_OPERACAO}
        showsUserLocation
        showsMyLocationButton={false}
        onUserLocationChange={interactive ? aoReceberPosicao : undefined}
        // Empurra o centro do mapa para a metade visivel.
        mapPadding={{ top: 0, right: 0, bottom: alturaDaFolha, left: 0 }}
        toolbarEnabled={false}
        scrollEnabled={interactive}
        zoomEnabled={interactive}
        rotateEnabled={false}
        pitchEnabled={false}
        // O mapa e leitura de apoio: sem transporte publico nem pontos
        // comerciais, que so poluem a tela na moto.
        showsIndoors={false}
        showsTraffic={false}
      />

      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  map: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    overflow: 'hidden',
    backgroundColor: colors.mapLand,
  },
});
