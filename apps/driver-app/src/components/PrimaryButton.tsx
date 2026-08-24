import { Pressable, StyleSheet, Text, type ViewStyle } from 'react-native';
import { colors } from '../theme/colors';

type PrimaryButtonProps = {
  label: string;
  onPress?: () => void;
  variant?: 'primary' | 'outline';
  style?: ViewStyle;
  disabled?: boolean;
};

export function PrimaryButton({
  label,
  onPress,
  variant = 'primary',
  style,
  disabled = false,
}: PrimaryButtonProps) {
  const isOutline = variant === 'outline';

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      style={({ pressed }) => [
        styles.button,
        isOutline ? styles.outlineButton : styles.primaryButton,
        pressed && !disabled && styles.pressed,
        disabled && styles.disabled,
        style,
      ]}
    >
      <Text style={[styles.label, isOutline ? styles.outlineLabel : styles.primaryLabel]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 52,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButton: { backgroundColor: colors.action },
  outlineButton: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.divider },
  pressed: { opacity: 0.86 },
  disabled: { opacity: 0.45 },
  label: {
    fontSize: 16,
    fontWeight: '700',
  },
  primaryLabel: { color: colors.actionText },
  outlineLabel: { color: colors.ink },
});
