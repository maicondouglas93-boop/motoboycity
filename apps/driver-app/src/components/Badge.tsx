import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors';

const TONES = {
  neutral: { bg: '#e4e4e7', fg: '#3f3f46' },
  warning: { bg: '#fef3c7', fg: colors.warning },
  success: { bg: '#dcfce7', fg: colors.success },
  danger: { bg: '#fee2e2', fg: colors.danger },
} as const;

export function Badge({ label, tone = 'neutral' }: { label: string; tone?: keyof typeof TONES }) {
  const { bg, fg } = TONES[tone];

  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <Text style={[styles.label, { color: fg }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
  },
});
