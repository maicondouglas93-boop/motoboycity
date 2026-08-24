import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  PanResponder,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
  type ViewStyle,
} from 'react-native';
import { colors } from '../theme/colors';

/**
 * A folha branca que cobre a parte de baixo do mapa.
 *
 * E a superficie principal do aplicativo: o mapa fica atras, e tudo que se le e
 * se toca acontece aqui.
 *
 * A folha ARRASTA entre duas alturas. Recolhida deixa o mapa a vista, que e o
 * que o motoboy quer quando esta rodando; expandida cobre quase tudo, para ler
 * a lista quando ha varias entregas aceitas.
 *
 * O gesto usa `PanResponder` e `Animated`, ambos do proprio React Native.
 * Poderia usar reanimated e gesture-handler, que dariam animacao mais macia,
 * mas sao dependencias NATIVAS: cada uma exige rebuild do Gradle, e o custo
 * disso neste projeto ja se mostrou alto. Duas paradas fixas nao precisam de
 * tanto.
 */

/** Alturas em fracao da tela. A recolhida e a mesma da referencia. */
const ALTURA_RECOLHIDA = 0.52;
const ALTURA_EXPANDIDA = 0.9;

/**
 * Quanto o dedo precisa andar para trocar de parada.
 *
 * Baixo demais e a folha muda de altura em qualquer encostada; alto demais e a
 * pessoa arrasta e nada acontece. 60px cobre o toque desajeitado de quem esta
 * de luva.
 */
const DISTANCIA_PARA_TROCAR = 60;

export type SheetPosition = 'recolhida' | 'expandida';

export function BottomSheet({
  children,
  draggable = false,
  style,
  onPositionChange,
}: {
  children: React.ReactNode;
  /**
   * So a tela principal arrasta. Nas telas de detalhe a folha e o proprio
   * conteudo da tela, e arrastar ali nao levaria a lugar nenhum — atras dela ha
   * so o mapa de fundo.
   */
  draggable?: boolean;
  /** Usado pelas telas de altura fixa. Ignorado quando a folha arrasta. */
  style?: ViewStyle;
  /** Avisa quem desenha o mapa para ele reposicionar o ponto azul. */
  onPositionChange?: (fracaoOcupada: number) => void;
}) {
  const { height } = useWindowDimensions();
  const [posicao, setPosicao] = useState<SheetPosition>('recolhida');

  const alturaRecolhida = useMemo(() => Math.round(height * ALTURA_RECOLHIDA), [height]);
  const alturaExpandida = useMemo(() => Math.round(height * ALTURA_EXPANDIDA), [height]);

  const altura = useRef(new Animated.Value(alturaRecolhida)).current;
  /** Altura no instante em que o dedo encostou, base para somar o arrasto. */
  const alturaAoTocar = useRef(alturaRecolhida);

  function irPara(destino: SheetPosition) {
    const alvo = destino === 'expandida' ? alturaExpandida : alturaRecolhida;
    setPosicao(destino);
    Animated.spring(altura, {
      toValue: alvo,
      useNativeDriver: false,
      // Sem balanco: a folha carrega texto, e o texto tremendo atrapalha a
      // leitura de quem so quer conferir o endereco.
      bounciness: 0,
      speed: 14,
    }).start();
  }

  useEffect(() => {
    onPositionChange?.(posicao === 'expandida' ? ALTURA_EXPANDIDA : ALTURA_RECOLHIDA);
  }, [posicao, onPositionChange]);

  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_evento, gesto) => Math.abs(gesto.dy) > 4,
        onPanResponderGrant: () => {
          alturaAoTocar.current = posicao === 'expandida' ? alturaExpandida : alturaRecolhida;
        },
        onPanResponderMove: (_evento, gesto) => {
          // dy negativo = dedo subindo = folha crescendo.
          const nova = alturaAoTocar.current - gesto.dy;
          altura.setValue(Math.min(alturaExpandida, Math.max(alturaRecolhida, nova)));
        },
        onPanResponderRelease: (_evento, gesto) => {
          if (gesto.dy < -DISTANCIA_PARA_TROCAR) {
            irPara('expandida');
            return;
          }
          if (gesto.dy > DISTANCIA_PARA_TROCAR) {
            irPara('recolhida');
            return;
          }
          // Arrasto curto: volta para onde estava, sem trocar de parada.
          irPara(posicao);
        },
        onPanResponderTerminate: () => irPara(posicao),
      }),
    // `posicao` entra porque o gesto precisa saber de onde parte.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [posicao, alturaRecolhida, alturaExpandida],
  );

  if (!draggable) {
    return (
      <View style={[styles.base, style]}>
        <View style={styles.areaDaAlca}>
          <View style={styles.alca} />
        </View>
        {children}
      </View>
    );
  }

  return (
    <Animated.View style={[styles.base, styles.ancorada, { height: altura }]}>
      <View {...pan.panHandlers} style={styles.areaDaAlca}>
        {/*
          Tocar tambem alterna. Arrastar e o gesto natural, mas de luva e com a
          moto ligada um toque acerta mais que um arrasto.
        */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            posicao === 'expandida' ? 'Recolher a lista' : 'Expandir a lista de entregas'
          }
          onPress={() => irPara(posicao === 'expandida' ? 'recolhida' : 'expandida')}
          hitSlop={16}
        >
          <View style={styles.alca} />
        </Pressable>
      </View>
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    // A sombra levanta a folha do mapa; no Android quem faz isso e o elevation.
    elevation: 12,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: -3 },
  },
  ancorada: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  /** Area generosa em volta da alca: e o alvo do arrasto, e dedo com luva erra. */
  areaDaAlca: {
    paddingTop: 10,
    paddingBottom: 14,
    alignItems: 'center',
  },
  alca: {
    width: 54,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#d6dae0',
  },
});
