import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { AuthUser } from '@motoboycity/types';
import { Icon, type IconName } from './Icon';
import { colors } from '../theme/colors';
import { authApi, driverPresenceApi, driverWalletApi } from '../lib/apiClient';
import { DRIVER_APP_VERSION } from '../lib/appVersion';
import { stopDeliveryTracking } from '../lib/deliveryTracking';
import { formatarDinheiro } from '../lib/format';
import { limparSessaoNativa } from '../lib/offerSession';
import { desativarPush } from '../lib/push';
import { session } from '../lib/session';
import type { RootStackParamList, ScreenNavigator } from '../navigation/types';

type DrawerMenuProps = {
  visible: boolean;
  onClose: () => void;
  navigation: ScreenNavigator;
};

type MenuItem = {
  label: string;
  icon: IconName;
  screen: keyof RootStackParamList;
};

/** Somente destinos que possuem operacao real no app/API. */
const MENU_ITEMS: MenuItem[] = [
  { label: 'Pedidos disponíveis', icon: 'clock', screen: 'AvailableDeliveries' },
  { label: 'Histórico de pedidos', icon: 'pin', screen: 'History' },
  { label: 'Perfil', icon: 'person', screen: 'Profile' },
];

export function DrawerMenu({ visible, onClose, navigation }: DrawerMenuProps) {
  const [profile, setProfile] = useState<AuthUser | null>(null);
  const [balance, setBalance] = useState<number | null>(null);

  useEffect(() => {
    if (!visible) return;
    let mounted = true;

    async function load() {
      const token = await session.getToken();
      if (!token) return;

      const [currentProfile, wallet] = await Promise.all([
        authApi.me(token).catch(() => null),
        driverWalletApi.get(token, { limit: 1 }).catch(() => null),
      ]);

      if (!mounted) return;
      if (currentProfile) setProfile(currentProfile);
      if (wallet) setBalance(wallet.availableBalance);
    }

    load().catch(() => undefined);
    return () => {
      mounted = false;
    };
  }, [visible]);

  function open(screen: keyof RootStackParamList) {
    onClose();
    navigation.navigate(screen);
  }

  async function signOut() {
    const token = await session.getToken();
    if (token) {
      await driverPresenceApi.set(token, { availability: 'UNAVAILABLE' }).catch(() => undefined);
    }
    await stopDeliveryTracking();
    await desativarPush();
    await limparSessaoNativa();
    await session.clearToken();
    onClose();
    navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
  }

  const initial = profile?.name.trim().charAt(0).toUpperCase() || '?';

  return (
    <Modal
      visible={visible}
      transparent
      statusBarTranslucent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Fechar menu"
        style={styles.backdrop}
        onPress={onClose}
      />

      <View style={styles.panel}>
        <View style={styles.handle} />

        <View style={styles.topActions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Fechar menu"
            onPress={onClose}
            hitSlop={12}
            style={styles.actionButton}
          >
            <Icon name="close" size={31} color={colors.ink} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Abrir ajustes"
            onPress={() => open('Settings')}
            hitSlop={12}
            style={styles.actionButton}
          >
            <Icon name="settings" size={29} color={colors.ink} />
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.profile}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initial}</Text>
            </View>
            <View style={styles.profileText}>
              <Text style={styles.name} numberOfLines={1}>
                {profile?.name ?? 'Entregador'}
              </Text>
              <Text style={styles.email} numberOfLines={1}>
                {profile?.email ?? 'Carregando perfil...'}
              </Text>
            </View>
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Abrir carteira"
            style={({ pressed }) => [styles.item, pressed && styles.itemPressed]}
            onPress={() => open('Wallet')}
          >
            <View style={styles.iconBox}>
              <Icon name="wallet" size={25} color={colors.actionSoft} />
            </View>
            <Text style={styles.label}>Carteira</Text>
            {balance !== null ? (
              <View style={styles.balancePill}>
                <Text style={styles.balanceText}>{formatarDinheiro(balance)}</Text>
              </View>
            ) : null}
          </Pressable>

          {MENU_ITEMS.map((item) => (
            <Pressable
              key={item.screen}
              accessibilityRole="button"
              accessibilityLabel={`Abrir ${item.label}`}
              style={({ pressed }) => [styles.item, pressed && styles.itemPressed]}
              onPress={() => open(item.screen)}
            >
              <View style={styles.iconBox}>
                <Icon name={item.icon} size={25} color={colors.actionSoft} />
              </View>
              <Text style={styles.label}>{item.label}</Text>
              <Icon name="chevron" size={21} color={colors.inkMuted} />
            </Pressable>
          ))}

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Sair da conta"
            style={({ pressed }) => [styles.item, pressed && styles.itemPressed]}
            onPress={() => signOut().catch(() => undefined)}
          >
            <View style={styles.iconBox}>
              <Icon name="logout" size={25} color={colors.actionSoft} />
            </View>
            <Text style={styles.label}>Sair</Text>
          </Pressable>

          <Text style={styles.version}>Versão {DRIVER_APP_VERSION}</Text>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(18, 25, 31, 0.55)',
  },
  panel: {
    position: 'absolute',
    top: 92,
    left: 0,
    right: 0,
    bottom: 0,
    overflow: 'hidden',
    backgroundColor: colors.surface,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    elevation: 18,
    shadowColor: '#000000',
    shadowOpacity: 0.22,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: -4 },
  },
  handle: {
    width: 52,
    height: 5,
    alignSelf: 'center',
    marginTop: 10,
    borderRadius: 3,
    backgroundColor: '#d7dbe1',
  },
  topActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: 10,
  },
  actionButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  content: { paddingBottom: 28 },
  profile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 24,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.actionSoftTint,
    borderWidth: 2,
    borderColor: '#d9e1ec',
  },
  avatarText: { color: colors.actionSoft, fontSize: 28, fontWeight: '800' },
  profileText: { flex: 1, gap: 2 },
  name: { color: colors.ink, fontSize: 21, fontWeight: '800' },
  email: { color: colors.inkSoft, fontSize: 14 },
  item: {
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    paddingHorizontal: 22,
    paddingVertical: 11,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  itemPressed: { backgroundColor: colors.surfaceMuted },
  iconBox: { width: 34, alignItems: 'center' },
  label: { flex: 1, color: colors.inkSoft, fontSize: 17, fontWeight: '600' },
  balancePill: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 9,
    backgroundColor: colors.success,
  },
  balanceText: { color: colors.surface, fontSize: 15, fontWeight: '800' },
  version: { marginTop: 28, color: '#c8cdd5', fontSize: 14, textAlign: 'center' },
});
