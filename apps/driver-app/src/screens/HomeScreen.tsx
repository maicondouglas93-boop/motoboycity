import { useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View, useColorScheme } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { DrawerMenu } from '../components/DrawerMenu';
import { EmptyState } from '../components/EmptyState';
import { colors } from '../theme/colors';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

export function HomeScreen({ navigation }: Props) {
  const isDark = useColorScheme() === 'dark';
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [active, setActive] = useState(false);
  const [tab, setTab] = useState<'ongoing' | 'pending'>('ongoing');

  const text = isDark ? colors.textDark : colors.text;
  const muted = isDark ? colors.mutedDark : colors.muted;
  const background = isDark ? colors.backgroundDark : colors.background;

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
          <Switch value={active} onValueChange={setActive} />
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
