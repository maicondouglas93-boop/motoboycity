import { StyleSheet, Text, View, useColorScheme } from 'react-native';
import { colors } from '../theme/colors';

export function NotSpecifiedNotice({ screenName }: { screenName: string }) {
  const isDark = useColorScheme() === 'dark';
  const text = isDark ? colors.textDark : colors.text;
  const muted = isDark ? colors.mutedDark : colors.muted;

  return (
    <View style={styles.container}>
      <Text style={styles.icon}>ℹ️</Text>
      <Text style={[styles.title, { color: text }]}>
        Tela &quot;{screenName}&quot; não especificada na Fase 0
      </Text>
      <Text style={[styles.description, { color: muted }]}>
        O item aparece no menu lateral da referência visual, mas nenhuma captura de tela do seu
        conteúdo foi fornecida. Estrutura pendente de definição.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 32,
  },
  icon: {
    fontSize: 28,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  description: {
    fontSize: 12,
    textAlign: 'center',
  },
});
