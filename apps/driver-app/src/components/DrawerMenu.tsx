import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View, useColorScheme } from 'react-native';
import type { AuthUser } from '@motoboycity/types';
import { colors } from '../theme/colors';
import { authApi, driverPresenceApi } from '../lib/apiClient';
import { stopDeliveryTracking } from '../lib/deliveryTracking';
import { session } from '../lib/session';
import type { RootStackParamList, ScreenNavigator } from '../navigation/types';

type DrawerMenuProps = {
  visible: boolean;
  onClose: () => void;
  navigation: ScreenNavigator;
};

const MENU_ITEMS: { label: string; screen: keyof RootStackParamList }[] = [
  { label: 'Carteira', screen: 'Wallet' },
  // Logo abaixo da carteira: e o que o motoboy abre quando quer trabalhar e
  // nao chegou oferta nenhuma.
  { label: 'Pedidos disponíveis', screen: 'AvailableDeliveries' },
  { label: 'Historico de pedidos', screen: 'History' },
  { label: 'Perfil', screen: 'Profile' },
];

export function DrawerMenu({ visible, onClose, navigation }: DrawerMenuProps) {
  const isDark = useColorScheme() === 'dark';
  const surface = isDark ? colors.surfaceDark : colors.surface;
  const text = isDark ? colors.textDark : colors.text;
  const muted = isDark ? colors.mutedDark : colors.muted;
  const border = isDark ? colors.borderDark : colors.border;
  const [profile, setProfile] = useState<AuthUser | null>(null);

  useEffect(() => {
    let mounted = true;

    async function loadProfile() {
      const token = await session.getToken();
      if (!token) return;

      try {
        const current = await authApi.me(token);
        if (mounted) setProfile(current);
      } catch {
        // O menu continua navegavel mesmo que a identidade nao possa ser recarregada.
      }
    }

    loadProfile();
    return () => {
      mounted = false;
    };
  }, []);

  function go(screen: keyof RootStackParamList) {
    onClose();
    navigation.navigate(screen);
  }

  async function handleSignOut() {
    const token = await session.getToken();
    if (token) {
      await driverPresenceApi.set(token, { availability: 'UNAVAILABLE' }).catch(() => undefined);
    }
    await stopDeliveryTracking();
    await session.clearToken();
    onClose();
    navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[styles.panel, { backgroundColor: surface }]}>
          <View style={[styles.profileRow, { borderBottomColor: border }]}>
            <View style={styles.profileInfo}>
              <View style={[styles.avatar, { backgroundColor: border }]}>
                <Text>{profile?.name.charAt(0).toUpperCase() ?? '?'}</Text>
              </View>
              <View>
                <Text style={[styles.profileName, { color: text }]}>
                  {profile?.name ?? 'Entregador'}
                </Text>
                <Text style={[styles.profileEmail, { color: muted }]}>
                  {profile?.email ?? 'Carregando perfil...'}
                </Text>
              </View>
            </View>
            <Pressable onPress={() => go('Settings')} hitSlop={12}>
              <Text style={[styles.settingsLabel, { color: text }]}>Ajustes</Text>
            </Pressable>
          </View>

          {MENU_ITEMS.map((item) => (
            <Pressable key={item.screen} style={styles.menuItem} onPress={() => go(item.screen)}>
              <Text style={[styles.menuLabel, { color: text }]}>{item.label}</Text>
              <Text style={[styles.chevron, { color: muted }]}>&gt;</Text>
            </Pressable>
          ))}

          <Pressable style={styles.menuItem} onPress={handleSignOut}>
            <Text style={[styles.signOutLabel, { color: colors.danger }]}>Sair da conta</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, flexDirection: 'row', backgroundColor: 'rgba(0,0,0,0.4)' },
  panel: { width: '80%', maxWidth: 320, paddingTop: 56, paddingHorizontal: 16, paddingBottom: 16 },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 16,
    marginBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  profileInfo: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileName: { fontSize: 14, fontWeight: '600' },
  profileEmail: { fontSize: 12 },
  settingsLabel: { fontSize: 12, fontWeight: '700' },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
  },
  menuLabel: { fontSize: 15, fontWeight: '600' },
  chevron: { fontSize: 16, fontWeight: '700' },
  signOutLabel: { fontSize: 15, fontWeight: '700' },
});
