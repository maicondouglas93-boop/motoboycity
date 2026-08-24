import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Icon, type IconName } from './Icon';
import { colors } from '../theme/colors';

/**
 * Cabecalho das telas que abrem dentro da folha: seta a esquerda, e o titulo
 * com o icone da secao centralizado.
 *
 * O titulo fica centralizado na TELA, nao no espaco que sobra depois da seta.
 * Por isso a seta e posicionada por cima em vez de entrar no fluxo — sem isso
 * o titulo desloca alguns pixels para a direita e desalinha entre uma tela e
 * outra.
 */
export function SheetHeader({
  title,
  icon,
  onBack,
}: {
  title: string;
  icon?: IconName;
  onBack?: () => void;
}) {
  return (
    <View style={styles.cabecalho}>
      {onBack && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Voltar"
          onPress={onBack}
          hitSlop={14}
          style={styles.voltar}
        >
          <Text style={styles.seta}>←</Text>
        </Pressable>
      )}

      <View style={styles.titulo}>
        {icon && <Icon name={icon} size={26} color={colors.ink} />}
        <Text style={styles.textoTitulo} numberOfLines={1}>
          {title}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  cabecalho: {
    height: 52,
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  voltar: { position: 'absolute', left: 18, zIndex: 1 },
  seta: { fontSize: 30, lineHeight: 34, color: colors.ink },
  titulo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  textoTitulo: { fontSize: 24, fontWeight: '700', color: colors.ink },
});
