import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors';

export type SegmentedTabsProps<T extends string> = {
  options: ReadonlyArray<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
};

/**
 * As abas da folha: pilula escura correndo sobre um trilho claro.
 *
 * Duas opcoes so, e sempre visiveis — nao e menu, e um interruptor entre duas
 * listas. Por isso cada opcao ocupa metade da largura, sem rolagem.
 */
export function SegmentedTabs<T extends string>({
  options,
  value,
  onChange,
}: SegmentedTabsProps<T>) {
  return (
    <View style={styles.trilho}>
      {options.map((option) => {
        const ativa = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: ativa }}
            style={[styles.aba, ativa && styles.abaAtiva]}
            onPress={() => onChange(option.value)}
          >
            <Text style={[styles.rotulo, ativa && styles.rotuloAtivo]} numberOfLines={1}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  trilho: {
    flexDirection: 'row',
    backgroundColor: colors.track,
    borderRadius: 26,
    padding: 3,
  },
  aba: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  abaAtiva: { backgroundColor: colors.actionSoft },
  rotulo: { fontSize: 15, fontWeight: '600', color: colors.inkSoft },
  rotuloAtivo: { color: colors.surface, fontWeight: '700' },
});
