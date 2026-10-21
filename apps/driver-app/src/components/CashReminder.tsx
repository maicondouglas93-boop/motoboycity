import { StyleSheet, Text, View } from 'react-native';
import { Icon } from './Icon';
import { colors } from '../theme/colors';

/**
 * "Devolva R$ 85,00 em dinheiro à loja", no rodapé do card do pedido.
 *
 * Fica à vista enquanto ele volta para a loja — é para isso que o valor foi
 * pedido. Sem texto, não ocupa espaço.
 */
export function CashReminder({ texto }: { texto: string | null }) {
  if (!texto) return null;
  return (
    <View style={styles.faixa} accessibilityRole="text">
      <Icon name="money" size={18} color={colors.ink} />
      <Text style={styles.texto}>{texto}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  faixa: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: colors.warningSoft,
  },
  texto: { flex: 1, color: colors.ink, fontSize: 14, fontWeight: '800' },
});
