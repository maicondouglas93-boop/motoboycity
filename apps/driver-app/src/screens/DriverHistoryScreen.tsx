import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useColorScheme,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ApiError } from '@motoboycity/api-client';
import type { DeliveryListItem } from '@motoboycity/types';
import { Card } from '../components/Card';
import { EmptyState } from '../components/EmptyState';
import { ScreenHeader } from '../components/ScreenHeader';
import { deliveriesApi } from '../lib/apiClient';
import { session } from '../lib/session';
import type { RootStackParamList } from '../navigation/types';
import { colors } from '../theme/colors';

type Props = NativeStackScreenProps<RootStackParamList, 'History'>;
type PeriodFilter = { from?: string; to?: string };

const currencyFormatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const dateFormatter = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short' });
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

function isValidPeriod(from: string, to: string): boolean {
  return (
    (!from || datePattern.test(from)) &&
    (!to || datePattern.test(to)) &&
    (!from || !to || from <= to)
  );
}

export function DriverHistoryScreen({ navigation }: Props) {
  const isDark = useColorScheme() === 'dark';
  const [deliveries, setDeliveries] = useState<DeliveryListItem[]>([]);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [appliedPeriod, setAppliedPeriod] = useState<PeriodFilter>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const text = isDark ? colors.textDark : colors.text;
  const muted = isDark ? colors.mutedDark : colors.muted;
  const border = isDark ? colors.borderDark : colors.border;

  const loadHistory = useCallback(async (period: PeriodFilter) => {
    const token = await session.getToken();
    if (!token) {
      setError('Sua sessao expirou. Entre novamente para consultar o historico.');
      setLoading(false);
      return;
    }

    try {
      setError(null);
      setDeliveries(await deliveriesApi.list(token, { status: 'COMPLETED', ...period }));
    } catch (requestError) {
      setError(
        requestError instanceof ApiError
          ? requestError.message
          : 'Nao foi possivel carregar seu historico agora. Verifique a conexao e tente novamente.',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    loadHistory(appliedPeriod).catch(() => undefined);
  }, [appliedPeriod, loadHistory]);

  function applyPeriod() {
    if (!isValidPeriod(from, to)) {
      setError(
        'Informe datas validas no formato AAAA-MM-DD; a data inicial nao pode ser posterior a final.',
      );
      return;
    }
    setAppliedPeriod({ ...(from && { from }), ...(to && { to }) });
  }

  function clearPeriod() {
    setFrom('');
    setTo('');
    setAppliedPeriod({});
  }

  const totalEarnings = deliveries.reduce((sum, delivery) => sum + (delivery.driverValue ?? 0), 0);

  return (
    <SafeAreaView
      style={[
        styles.safeArea,
        { backgroundColor: isDark ? colors.backgroundDark : colors.background },
      ]}
    >
      <ScreenHeader title="Historico" onBack={() => navigation.goBack()} />
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={[styles.intro, { color: muted }]}>
            Entregas concluidas e ganhos no periodo selecionado.
          </Text>

          <View style={[styles.periodCard, { borderColor: border }]}>
            <Text style={[styles.periodTitle, { color: text }]}>Periodo</Text>
            <Text style={[styles.periodHelp, { color: muted }]}>
              Use AAAA-MM-DD. Deixe em branco para consultar todo o historico.
            </Text>
            <View style={styles.periodInputs}>
              <TextInput
                accessibilityLabel="Data inicial do historico"
                placeholder="AAAA-MM-DD"
                placeholderTextColor={muted}
                value={from}
                onChangeText={setFrom}
                autoCapitalize="none"
                style={[styles.dateInput, { borderColor: border, color: text }]}
              />
              <TextInput
                accessibilityLabel="Data final do historico"
                placeholder="AAAA-MM-DD"
                placeholderTextColor={muted}
                value={to}
                onChangeText={setTo}
                autoCapitalize="none"
                style={[styles.dateInput, { borderColor: border, color: text }]}
              />
            </View>
            <View style={styles.periodActions}>
              <Pressable style={styles.applyButton} onPress={applyPeriod}>
                <Text style={styles.applyButtonText}>Aplicar periodo</Text>
              </Pressable>
              <Pressable
                style={[styles.clearButton, { borderColor: border }]}
                onPress={clearPeriod}
              >
                <Text style={[styles.clearButtonText, { color: text }]}>Limpar</Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.summaryRow}>
            <Card style={styles.summaryCard}>
              <Text style={[styles.summaryLabel, { color: muted }]}>Ganhos por entregas</Text>
              <Text style={[styles.summaryValue, { color: text }]}>
                {currencyFormatter.format(totalEarnings)}
              </Text>
            </Card>
            <Card style={styles.summaryCard}>
              <Text style={[styles.summaryLabel, { color: muted }]}>Entregas</Text>
              <Text style={[styles.summaryValue, { color: text }]}>{deliveries.length}</Text>
            </Card>
          </View>

          {error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
              <Pressable onPress={() => loadHistory(appliedPeriod).catch(() => undefined)}>
                <Text style={styles.retry}>Tentar novamente</Text>
              </Pressable>
            </View>
          ) : deliveries.length === 0 ? (
            <EmptyState message="Nenhuma entrega concluida neste periodo" />
          ) : (
            deliveries.map((delivery) => (
              <Pressable
                key={delivery.id}
                onPress={() => navigation.navigate('OrderDetail', { orderId: delivery.id })}
              >
                <Card>
                  <View style={styles.entryRow}>
                    <View style={styles.entryText}>
                      <Text style={[styles.entryTitle, { color: text }]}>
                        Pedido #{delivery.displayNumber}
                      </Text>
                      <Text style={[styles.entryMeta, { color: muted }]}>
                        {delivery.companyName}
                      </Text>
                      <Text style={[styles.entryMeta, { color: muted }]}>
                        Concluido em {dateFormatter.format(new Date(delivery.statusChangedAt))}
                      </Text>
                    </View>
                    <View style={styles.entryValue}>
                      {delivery.distanceKm !== null && (
                        <Text style={[styles.entryMeta, { color: muted }]}>
                          {delivery.distanceKm.toFixed(1)} km
                        </Text>
                      )}
                      <Text style={[styles.entryAmount, { color: text }]}>
                        {delivery.driverValue === null
                          ? 'A calcular'
                          : currencyFormatter.format(delivery.driverValue)}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.detailsLink}>Ver detalhes</Text>
                </Card>
              </Pressable>
            ))
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 16, gap: 12 },
  intro: { fontSize: 12, lineHeight: 18 },
  periodCard: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, padding: 12, gap: 8 },
  periodTitle: { fontSize: 14, fontWeight: '700' },
  periodHelp: { fontSize: 12, lineHeight: 17 },
  periodInputs: { flexDirection: 'row', gap: 8 },
  dateInput: {
    flex: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 9,
    fontSize: 13,
  },
  periodActions: { flexDirection: 'row', gap: 8 },
  applyButton: {
    flex: 1,
    backgroundColor: colors.primary,
    borderRadius: 8,
    alignItems: 'center',
    paddingVertical: 10,
  },
  applyButtonText: { color: '#ffffff', fontSize: 13, fontWeight: '700' },
  clearButton: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  clearButtonText: { fontSize: 13, fontWeight: '700' },
  summaryRow: { flexDirection: 'row', gap: 12 },
  summaryCard: { flex: 1 },
  summaryLabel: { fontSize: 12 },
  summaryValue: { fontSize: 18, fontWeight: '700' },
  errorBox: { gap: 8, paddingVertical: 12 },
  errorText: { color: colors.danger, lineHeight: 18 },
  retry: { color: colors.primary, fontWeight: '700' },
  entryRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  entryText: { flex: 1, gap: 2 },
  entryValue: { alignItems: 'flex-end', justifyContent: 'center', gap: 3 },
  entryTitle: { fontSize: 14, fontWeight: '600' },
  entryMeta: { fontSize: 12 },
  entryAmount: { fontWeight: '700' },
  detailsLink: { fontSize: 12, color: colors.primary, fontWeight: '600', marginTop: 4 },
});
