import { useState } from 'react';
import { Pressable, StyleSheet, Text, View, useColorScheme } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { EmptyState } from '../components/EmptyState';
import { ScreenHeader } from '../components/ScreenHeader';
import { colors } from '../theme/colors';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'ScheduledOrders'>;

export function ScheduledOrdersScreen({ navigation }: Props) {
  const isDark = useColorScheme() === 'dark';
  const [tab, setTab] = useState<'pending' | 'accepted'>('pending');
  const muted = isDark ? colors.mutedDark : colors.muted;

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: isDark ? colors.backgroundDark : colors.background }}
    >
      <ScreenHeader title="Pedidos Agendados" onBack={() => navigation.goBack()} />
      <View style={styles.tabs}>
        <Pressable onPress={() => setTab('pending')}>
          <Text style={[styles.tabLabel, tab === 'pending' && styles.tabActive]}>Pendentes</Text>
        </Pressable>
        <Pressable onPress={() => setTab('accepted')}>
          <Text style={[styles.tabLabel, { color: muted }, tab === 'accepted' && styles.tabActive]}>
            Já aceitos
          </Text>
        </Pressable>
      </View>
      <View style={{ flex: 1 }}>
        <EmptyState message="Você não tem nenhuma entrega" />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  tabs: {
    flexDirection: 'row',
    gap: 24,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  tabLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.muted,
  },
  tabActive: {
    color: colors.primary,
  },
});
