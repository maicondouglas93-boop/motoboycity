import { Pressable, StyleSheet, Text, type ViewStyle } from 'react-native';
import { colors } from '../theme/colors';

type PrimaryButtonProps = {
  label: string;
  onPress?: () => void;
  variant?: 'primary' | 'outline';
  style?: ViewStyle;
};

export function PrimaryButton({ label, onPress, variant = 'primary', style }: PrimaryButtonProps) {
  const isOutline = variant === 'outline';

  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.button,
        isOutline
          ? { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.border }
          : { backgroundColor: colors.primary },
        style,
      ]}
    >
      <Text style={[styles.label, { color: isOutline ? colors.text : '#ffffff' }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
  },
});
