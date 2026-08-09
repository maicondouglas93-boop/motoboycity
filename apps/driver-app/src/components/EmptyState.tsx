import { StyleSheet, Text, View, useColorScheme } from 'react-native';
import { colors } from '../theme/colors';

export function EmptyState({ message }: { message: string }) {
  const isDark = useColorScheme() === 'dark';

  return (
    <View style={styles.container}>
      <View
        style={[styles.iconCircle, { backgroundColor: isDark ? colors.borderDark : colors.border }]}
      >
        <Text style={styles.iconText}>🛍️</Text>
      </View>
      <Text style={[styles.message, { color: isDark ? colors.mutedDark : colors.muted }]}>
        {message}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingVertical: 48,
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconText: {
    fontSize: 24,
  },
  message: {
    fontSize: 14,
  },
});
