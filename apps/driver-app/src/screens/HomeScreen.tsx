import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Switch, Text, View, useColorScheme } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ApiError } from '@motoboycity/api-client';
import { DrawerMenu } from '../components/DrawerMenu';
import { EmptyState } from '../components/EmptyState';
import { colors } from '../theme/colors';
import { driverPresenceApi } from '../lib/apiClient';
import { session } from '../lib/session';
import { connectDriverSocket, disconnectDriverSocket } from '../lib/socket';
import { useDispatchStore } from '../store/dispatchStore';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

export function HomeScreen({ navigation }: Props) {
  const isDark = useColorScheme() === 'dark';
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [tab, setTab] = useState<'ongoing' | 'pending'>('ongoing');
  const [presenceLoading, setPresenceLoading] = useState(true);

  const availability = useDispatchStore((state) => state.availability);
  const setPresence = useDispatchStore((state) => state.setPresence);
  const setIncomingOffer = useDispatchStore((state) => state.setIncomingOffer);

  const text = isDark ? colors.textDark : colors.text;
  const muted = isDark ? colors.mutedDark : colors.muted;
  const background = isDark ? colors.backgroundDark : colors.background;

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      const token = await session.getToken();
      if (!token || cancelled) return;

      try {
        const presence = await driverPresenceApi.get(token);
        if (!cancelled) setPresence(presence.availability, presence.since);
      } catch {
        // Mantém UNAVAILABLE (padrão da store) se a busca inicial falhar.
      } finally {
        if (!cancelled) setPresenceLoading(false);
      }

      if (cancelled) return;

      connectDriverSocket(token, {
        onOffer: (offer) => {
          setIncomingOffer(offer);
          navigation.navigate('IncomingOffer');
        },
        onOfferExpired: (offerId) => {
          if (useDispatchStore.getState().incomingOffer?.offerId === offerId) {
            setIncomingOffer(null);
          }
        },
        onOfferCancelled: (offerId) => {
          if (useDispatchStore.getState().incomingOffer?.offerId === offerId) {
            setIncomingOffer(null);
          }
        },
      });
    }

    void bootstrap();
    return () => {
      cancelled = true;
      disconnectDriverSocket();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleToggleAvailability(value: boolean) {
    const token = await session.getToken();
    if (!token) return;

    const previous = { availability, since: useDispatchStore.getState().since };
    const nextAvailability = value ? 'AVAILABLE' : 'UNAVAILABLE';
    setPresence(nextAvailability, previous.since);

    try {
      const result = await driverPresenceApi.set(token, nextAvailability);
      setPresence(result.availability, result.since);
    } catch (error) {
      setPresence(previous.availability, previous.since);
      Alert.alert(
        'Ops',
        error instanceof ApiError ? error.message : 'Não foi possível atualizar sua disponibilidade.',
      );
    }
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: background }]} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => setDrawerVisible(true)} hitSlop={12}>
          <Text style={[styles.menuIcon, { color: text }]}>☰</Text>
        </Pressable>
      </View>

      <View style={styles.map}>
        <Text style={{ color: muted }}>🗺️ Mapa (integração com Google Maps — Fase futura)</Text>
      </View>

      <View
        style={[styles.sheet, { backgroundColor: isDark ? colors.surfaceDark : colors.surface }]}
      >
        <View style={styles.tabs}>
          <Pressable
            style={[styles.tab, tab === 'ongoing' && styles.tabActive]}
            onPress={() => setTab('ongoing')}
          >
            <Text style={[styles.tabLabel, { color: tab === 'ongoing' ? '#fff' : muted }]}>
              Em Andamento
            </Text>
          </Pressable>
          <Pressable
            style={[styles.tab, tab === 'pending' && styles.tabActive]}
            onPress={() => setTab('pending')}
          >
            <Text style={[styles.tabLabel, { color: tab === 'pending' ? '#fff' : muted }]}>
              Pendentes
            </Text>
          </Pressable>
        </View>

        <View style={styles.activeRow}>
          <Text style={{ color: text }}>Ativo</Text>
          <Switch
            value={availability === 'AVAILABLE'}
            onValueChange={handleToggleAvailability}
            disabled={presenceLoading}
          />
        </View>

        <EmptyState message="Você não tem nenhuma entrega" />
      </View>

      <DrawerMenu
        visible={drawerVisible}
        onClose={() => setDrawerVisible(false)}
        navigation={navigation}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  menuIcon: {
    fontSize: 22,
  },
  map: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 24,
    gap: 12,
  },
  tabs: {
    flexDirection: 'row',
    backgroundColor: '#e4e4e7',
    borderRadius: 999,
    padding: 3,
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 999,
    alignItems: 'center',
  },
  tabActive: {
    backgroundColor: colors.primary,
  },
  tabLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  activeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
});
