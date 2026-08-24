import { StyleSheet, Text, View } from 'react-native';
import { EmptyIconCircle } from './Icon';
import { colors } from '../theme/colors';

export function EmptyState({ message, description }: { message: string; description?: string }) {
  return (
    <View style={styles.container}>
      <EmptyIconCircle size={88} />
      <Text style={styles.message}>{message}</Text>
      {description ? <Text style={styles.description}>{description}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 24,
    paddingVertical: 44,
  },
  message: {
    color: colors.ink,
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
  },
  description: {
    color: colors.inkMuted,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
});
