import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Icon, type IconName } from './Icon';
import { colors } from '../theme/colors';

type ScreenHeaderProps = {
  title: string;
  icon?: IconName;
  onBack?: () => void;
  rightIcon?: string;
  onRightPress?: () => void;
  rightAccessibilityLabel?: string;
};

/**
 * Cabecalho claro e centralizado usado nas telas do entregador.
 *
 * Os lados sempre reservam a mesma largura. Assim o titulo fica no centro da
 * tela, e nao no centro do espaco que sobra depois da seta.
 */
export function ScreenHeader({
  title,
  icon,
  onBack,
  rightIcon,
  onRightPress,
  rightAccessibilityLabel,
}: ScreenHeaderProps) {
  return (
    <View style={styles.container}>
      {onBack ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Voltar"
          onPress={onBack}
          hitSlop={12}
          style={styles.iconButton}
        >
          <Text style={styles.backIcon}>{'\u2190'}</Text>
        </Pressable>
      ) : (
        <View style={styles.iconPlaceholder} />
      )}

      <View style={styles.titleRow}>
        {icon ? <Icon name={icon} size={27} color={colors.ink} /> : null}
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
      </View>

      {rightIcon ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={rightAccessibilityLabel}
          onPress={onRightPress}
          hitSlop={12}
          style={styles.iconButton}
        >
          <Text style={styles.rightIcon}>{rightIcon}</Text>
        </Pressable>
      ) : (
        <View style={styles.iconPlaceholder} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 10,
    backgroundColor: colors.surface,
  },
  iconButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconPlaceholder: { width: 40 },
  backIcon: {
    fontSize: 30,
    lineHeight: 34,
    color: colors.ink,
    textAlign: 'center',
  },
  titleRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
  },
  title: {
    flexShrink: 1,
    fontSize: 22,
    fontWeight: '700',
    color: colors.ink,
  },
  rightIcon: { fontSize: 22, color: colors.ink, textAlign: 'center' },
});
