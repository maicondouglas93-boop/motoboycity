import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors';

/**
 * O interruptor de ficar online, centralizado, do jeito da referencia:
 * pilula grande e a palavra "Ativo" ao lado, em corpo grande.
 *
 * Nao usa o `Switch` do sistema de proposito. O `Switch` do Android sai com a
 * cara do fabricante — no aparelho de teste ele aparecia pequeno e com o verde
 * do sistema — e este e o controle mais importante do aplicativo: e ele que
 * decide se o motoboy recebe pedido ou nao. Ele precisa ser grande, obvio, e
 * igual em qualquer celular.
 */
export function ActiveToggle({
  value,
  onChange,
  disabled = false,
}: {
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      accessibilityLabel={value ? 'Ativo, tocar para ficar offline' : 'Inativo, tocar para ficar online'}
      style={[styles.area, disabled && styles.desabilitado]}
      onPress={() => !disabled && onChange(!value)}
      hitSlop={8}
    >
      <View style={[styles.pilula, value ? styles.pilulaLigada : styles.pilulaDesligada]}>
        <View style={[styles.bolinha, value ? styles.bolinhaLigada : styles.bolinhaDesligada]} />
      </View>
      <Text style={[styles.rotulo, value ? styles.rotuloLigado : styles.rotuloDesligado]}>
        {value ? 'Ativo' : 'Inativo'}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  area: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    paddingVertical: 6,
  },
  desabilitado: { opacity: 0.5 },
  pilula: {
    width: 76,
    height: 40,
    borderRadius: 20,
    padding: 4,
    justifyContent: 'center',
  },
  pilulaLigada: { backgroundColor: colors.success },
  pilulaDesligada: { backgroundColor: '#9aa2ab' },
  bolinha: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surface,
  },
  bolinhaLigada: { alignSelf: 'flex-end' },
  bolinhaDesligada: { alignSelf: 'flex-start' },
  rotulo: { fontSize: 30, fontWeight: '400' },
  rotuloLigado: { color: colors.ink },
  rotuloDesligado: { color: colors.inkMuted },
});
