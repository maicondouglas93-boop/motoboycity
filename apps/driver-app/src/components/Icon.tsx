import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors';

/**
 * Icones do aplicativo, sem biblioteca.
 *
 * Uma biblioteca de icones (react-native-svg, vector-icons) e dependencia
 * NATIVA: exige rebuild do Gradle a cada `pnpm install` em maquina nova, e foi
 * o build do Gradle que encheu o disco e corrompeu o node_modules antes. Como
 * os icones da referencia sao poucos e simples, eles saem daqui — parte como
 * glifo unicode monocromatico, parte desenhados com View.
 *
 * As medidas sao proporcionais ao `size` e por isso vao inline; o que e fixo
 * mora no StyleSheet do fim do arquivo.
 */
export type IconName =
  | 'menu'
  | 'check'
  | 'close'
  | 'pin'
  | 'flag'
  | 'store'
  | 'house'
  | 'return'
  | 'person'
  | 'clock'
  | 'wallet'
  | 'basket'
  | 'phone'
  | 'chevron'
  | 'settings'
  | 'logout'
  | 'calendar'
  | 'trophy'
  | 'support'
  | 'list'
  | 'info'
  | 'shield'
  | 'money';

type Props = {
  name: IconName;
  size?: number;
  color?: string;
};

/** Glifos que ja sao monocromaticos e alinham bem em qualquer Android. */
const GLIFOS: Partial<Record<IconName, string>> = {
  check: '\u2713',
  close: '\u00d7',
  flag: '\u2691',
  house: '\u2302',
  return: '\u21bb',
  clock: '\u25f7',
  chevron: '\u203a',
  settings: '\u2699',
  logout: '\u21aa',
  calendar: '\u25a3',
  trophy: '\u2605',
  support: '?',
  list: '\u2630',
  info: 'i',
  shield: '\u25c8',
  money: '$',
};

export function Icon({ name, size = 20, color = colors.ink }: Props) {
  const glifo = GLIFOS[name];
  if (glifo) {
    return (
      <Text
        allowFontScaling={false}
        style={[styles.glifo, { fontSize: size, lineHeight: size * 1.2, color, width: size }]}
      >
        {glifo}
      </Text>
    );
  }

  if (name === 'menu') {
    const barra = { height: Math.max(2, size * 0.11), backgroundColor: color };
    return (
      <View style={{ width: size, gap: size * 0.16 }}>
        <View style={[styles.barra, barra]} />
        <View style={[styles.barra, barra]} />
        <View style={[styles.barra, barra]} />
      </View>
    );
  }

  if (name === 'pin') {
    // Gota: circulo com furo no meio e uma ponta girada 45 graus embaixo.
    return (
      <View style={[styles.colunaCentro, { width: size, height: size }]}>
        <View
          style={[
            styles.centro,
            {
              width: size * 0.8,
              height: size * 0.8,
              borderRadius: size * 0.4,
              borderWidth: Math.max(1.5, size * 0.09),
              borderColor: color,
            },
          ]}
        >
          <View
            style={{
              width: size * 0.22,
              height: size * 0.22,
              borderRadius: size * 0.11,
              backgroundColor: color,
            }}
          />
        </View>
        <View
          style={[
            styles.pontaPin,
            {
              width: size * 0.3,
              height: size * 0.3,
              backgroundColor: color,
              marginTop: -size * 0.22,
            },
          ]}
        />
      </View>
    );
  }

  if (name === 'store') {
    // Toldo sobre a caixa, que e como a referencia marca a coleta.
    return (
      <View style={[styles.colunaMeio, { width: size, height: size }]}>
        <View style={{ height: size * 0.24, borderRadius: size * 0.06, backgroundColor: color }} />
        <View
          style={{
            height: size * 0.5,
            marginTop: size * 0.08,
            borderWidth: Math.max(1.5, size * 0.09),
            borderColor: color,
            borderRadius: size * 0.06,
          }}
        />
      </View>
    );
  }

  if (name === 'person') {
    return (
      <View style={[styles.centro, { width: size, height: size }]}>
        <View
          style={{
            width: size * 0.42,
            height: size * 0.42,
            borderRadius: size * 0.21,
            backgroundColor: color,
          }}
        />
        <View
          style={{
            width: size * 0.78,
            height: size * 0.34,
            borderTopLeftRadius: size * 0.39,
            borderTopRightRadius: size * 0.39,
            backgroundColor: color,
            marginTop: size * 0.08,
          }}
        />
      </View>
    );
  }

  if (name === 'phone') {
    return (
      <View style={[styles.centro, { width: size, height: size }]}>
        <View
          style={[
            styles.fone,
            {
              width: size * 0.36,
              height: size * 0.82,
              borderRadius: size * 0.14,
              borderWidth: Math.max(1.5, size * 0.09),
              borderColor: color,
            },
          ]}
        />
      </View>
    );
  }

  if (name === 'wallet') {
    return (
      <View style={[styles.colunaMeio, { width: size, height: size }]}>
        <View
          style={[
            styles.carteira,
            {
              height: size * 0.68,
              borderRadius: size * 0.12,
              borderWidth: Math.max(1.5, size * 0.09),
              borderColor: color,
              paddingRight: size * 0.12,
            },
          ]}
        >
          <View
            style={{
              width: size * 0.18,
              height: size * 0.18,
              borderRadius: size * 0.09,
              backgroundColor: color,
            }}
          />
        </View>
      </View>
    );
  }

  // basket — usado no estado vazio, dentro de um circulo cinza.
  //
  // A alca e um quadrado com duas bordas, girado 45 graus, o que desenha um
  // "V" invertido. O corpo e um trapezio feito pelo truque das bordas
  // transparentes: `borderBottom` pinta a faixa, e as laterais transparentes
  // cortam as quinas em diagonal. E como se desenha forma nao retangular sem
  // svg no React Native.
  return (
    <View style={[styles.colunaBase, { width: size, height: size }]}>
      <View
        style={[
          styles.alcaCesta,
          {
            width: size * 0.34,
            height: size * 0.34,
            borderTopWidth: Math.max(2, size * 0.09),
            borderLeftWidth: Math.max(2, size * 0.09),
            borderColor: color,
            marginBottom: -size * 0.1,
          },
        ]}
      />
      <View
        style={[
          styles.corpoCesta,
          {
            width: size * 0.58,
            borderBottomWidth: size * 0.38,
            borderBottomColor: color,
            borderLeftWidth: size * 0.13,
            borderRightWidth: size * 0.13,
          },
        ]}
      />
      <View
        style={[
          styles.furoCesta,
          {
            bottom: size * 0.12,
            width: size * 0.12,
            height: size * 0.12,
            borderRadius: size * 0.06,
            backgroundColor: colors.surface,
          },
        ]}
      />
    </View>
  );
}

/** Circulo cinza grande com o icone dentro, do estado vazio da referencia. */
export function EmptyIconCircle({ size = 96 }: { size?: number }) {
  return (
    <View style={[styles.circuloVazio, { width: size, height: size, borderRadius: size / 2 }]}>
      <Icon name="basket" size={size * 0.44} color={colors.surface} />
    </View>
  );
}

const styles = StyleSheet.create({
  glifo: { textAlign: 'center' },
  barra: { borderRadius: 2 },
  centro: { alignItems: 'center', justifyContent: 'center' },
  /** Trapezio: as laterais transparentes cortam as quinas da faixa de baixo. */
  corpoCesta: { borderLeftColor: 'transparent', borderRightColor: 'transparent' },
  furoCesta: { position: 'absolute' },
  colunaCentro: { alignItems: 'center' },
  colunaMeio: { justifyContent: 'center' },
  colunaBase: { alignItems: 'center', justifyContent: 'flex-end' },
  pontaPin: { transform: [{ rotate: '45deg' }] },
  fone: { transform: [{ rotate: '35deg' }] },
  carteira: { justifyContent: 'center', alignItems: 'flex-end' },
  alcaCesta: { transform: [{ rotate: '45deg' }] },
  circuloVazio: {
    backgroundColor: '#9aa2ab',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
