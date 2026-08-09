import { Pressable, StyleSheet, Text, View, useColorScheme } from 'react-native';
import { colors } from '../theme/colors';

type ScreenHeaderProps = {
  title: string;
  onBack?: () => void;
  rightIcon?: string;
  onRightPress?: () => void;
};

export function ScreenHeader({ title, onBack, rightIcon, onRightPress }: ScreenHeaderProps) {
  const isDark = useColorScheme() === 'dark';

  return (
    <View
      style={[styles.container, { borderBottomColor: isDark ? colors.borderDark : colors.border }]}
    >
      {onBack ? (
        <Pressable onPress={onBack} hitSlop={12}>
          <Text style={[styles.icon, { color: isDark ? colors.textDark : colors.text }]}>←</Text>
        </Pressable>
      ) : (
        <View style={styles.iconPlaceholder} />
      )}

      <Text style={[styles.title, { color: isDark ? colors.textDark : colors.text }]}>{title}</Text>

      {rightIcon ? (
        <Pressable onPress={onRightPress} hitSlop={12}>
          <Text style={[styles.icon, { color: isDark ? colors.textDark : colors.text }]}>
            {rightIcon}
          </Text>
        </Pressable>
      ) : (
        <View style={styles.iconPlaceholder} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  icon: {
    fontSize: 20,
    width: 24,
    textAlign: 'center',
  },
  iconPlaceholder: {
    width: 24,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
  },
});
