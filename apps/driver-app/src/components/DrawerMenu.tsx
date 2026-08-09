import { Modal, Pressable, StyleSheet, Text, View, useColorScheme } from 'react-native';
import { colors } from '../theme/colors';
import { mockDriver, mockWallet } from '../lib/mockData';
import type { RootStackParamList, ScreenNavigator } from '../navigation/types';

type DrawerMenuProps = {
  visible: boolean;
  onClose: () => void;
  navigation: ScreenNavigator;
};

const MENU_ITEMS: {
  icon: string;
  label: string;
  screen: keyof RootStackParamList;
  badge?: string;
}[] = [
  { icon: '💳', label: 'Carteira', screen: 'Wallet', badge: mockWallet.availableBalance },
  { icon: '🕒', label: 'Pedidos Disponíveis', screen: 'AvailableOrders' },
  { icon: '📜', label: 'Histórico de Pedidos', screen: 'History' },
  { icon: '⏳', label: 'Pedidos Agendados', screen: 'ScheduledOrders' },
  { icon: '✅', label: 'Minhas Escalas', screen: 'MyShifts' },
  { icon: '🏆', label: 'Desafios', screen: 'Challenges' },
  { icon: '🎧', label: 'Suporte', screen: 'Support' },
  { icon: '👤', label: 'Perfil', screen: 'Profile' },
];

export function DrawerMenu({ visible, onClose, navigation }: DrawerMenuProps) {
  const isDark = useColorScheme() === 'dark';
  const surface = isDark ? colors.surfaceDark : colors.surface;
  const text = isDark ? colors.textDark : colors.text;
  const muted = isDark ? colors.mutedDark : colors.muted;
  const border = isDark ? colors.borderDark : colors.border;

  function go(screen: keyof RootStackParamList) {
    onClose();
    navigation.navigate(screen);
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[styles.panel, { backgroundColor: surface }]}>
          <View style={[styles.profileRow, { borderBottomColor: border }]}>
            <View style={styles.profileInfo}>
              <View style={[styles.avatar, { backgroundColor: border }]}>
                <Text>{mockDriver.name.charAt(0)}</Text>
              </View>
              <View>
                <Text style={[styles.profileName, { color: text }]}>{mockDriver.name}</Text>
                <Text style={[styles.profileEmail, { color: muted }]}>{mockDriver.email}</Text>
              </View>
            </View>
            <Pressable onPress={() => go('Settings')} hitSlop={12}>
              <Text style={styles.settingsIcon}>⚙️</Text>
            </Pressable>
          </View>

          {MENU_ITEMS.map((item) => (
            <Pressable key={item.screen} style={styles.menuItem} onPress={() => go(item.screen)}>
              <Text style={styles.menuIcon}>{item.icon}</Text>
              <Text style={[styles.menuLabel, { color: text }]}>{item.label}</Text>
              {item.badge && (
                <View style={[styles.badge, { backgroundColor: '#dcfce7' }]}>
                  <Text style={styles.badgeText}>{item.badge}</Text>
                </View>
              )}
            </Pressable>
          ))}

          <Pressable style={styles.menuItem} onPress={onClose}>
            <Text style={styles.menuIcon}>🚪</Text>
            <Text style={[styles.menuLabel, { color: text }]}>Sair</Text>
          </Pressable>

          <Text style={[styles.version, { color: muted }]}>Versão {mockDriver.version}</Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  panel: {
    width: '80%',
    maxWidth: 320,
    paddingTop: 56,
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 4,
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 16,
    marginBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  profileInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileName: {
    fontSize: 14,
    fontWeight: '600',
  },
  profileEmail: {
    fontSize: 12,
  },
  settingsIcon: {
    fontSize: 18,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
  },
  menuIcon: {
    fontSize: 16,
    width: 20,
  },
  menuLabel: {
    fontSize: 14,
    flex: 1,
  },
  badge: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.success,
  },
  version: {
    marginTop: 'auto',
    fontSize: 11,
    textAlign: 'center',
  },
});
