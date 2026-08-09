import { ScrollView, StyleSheet, Text, View, useColorScheme } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Card } from '../components/Card';
import { ScreenHeader } from '../components/ScreenHeader';
import { colors } from '../theme/colors';
import { mockHistoryByDay, mockHistorySummary } from '../lib/mockData';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'History'>;

export function HistoryScreen({ navigation }: Props) {
  const isDark = useColorScheme() === 'dark';
  const text = isDark ? colors.textDark : colors.text;
  const muted = isDark ? colors.mutedDark : colors.muted;

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: isDark ? colors.backgroundDark : colors.background }}
    >
      <ScreenHeader title="Histórico" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={{ color: muted, fontSize: 12 }}>{mockHistorySummary.period}</Text>

        <View style={styles.summaryRow}>
          <Card style={{ flex: 1 }}>
            <Text style={{ color: muted, fontSize: 12 }}>Ganhos no Período</Text>
            <Text style={[styles.summaryValue, { color: text }]}>
              {mockHistorySummary.earnings}
            </Text>
          </Card>
          <Card style={{ flex: 1 }}>
            <Text style={{ color: muted, fontSize: 12 }}>Entregas</Text>
            <Text style={[styles.summaryValue, { color: text }]}>
              {mockHistorySummary.deliveries}
            </Text>
          </Card>
        </View>

        {mockHistoryByDay.map((day) => (
          <View key={day.date} style={styles.dayGroup}>
            <Text style={[styles.dayLabel, { color: text }]}>{day.date}</Text>
            {day.entries.map((entry, index) => (
              <Card key={index}>
                <View style={styles.entryRow}>
                  <View>
                    <Text style={{ color: text, fontSize: 13 }}>
                      {entry.time} · {entry.businessName}
                    </Text>
                    <Text style={{ color: muted, fontSize: 11 }}>{entry.distance}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={{ color: muted, fontSize: 11 }}>Faturado</Text>
                    <Text style={{ color: text, fontWeight: '600' }}>{entry.value}</Text>
                  </View>
                </View>
                <Text style={styles.detailsLink}>Todos os detalhes</Text>
              </Card>
            ))}
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 16,
    gap: 12,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: 12,
  },
  summaryValue: {
    fontSize: 18,
    fontWeight: '700',
  },
  dayGroup: {
    gap: 8,
  },
  dayLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  entryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  detailsLink: {
    fontSize: 11,
    color: colors.primary,
    textDecorationLine: 'underline',
    marginTop: 4,
  },
});
