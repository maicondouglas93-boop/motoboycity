import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ApiError } from '@motoboycity/api-client';
import type { DeliveryListItem } from '@motoboycity/types';
import { EmptyState } from '../components/EmptyState';
import { Icon } from '../components/Icon';
import { ScreenHeader } from '../components/ScreenHeader';
import { deliveriesApi } from '../lib/apiClient';
import { formatarDinheiro, formatarDistancia } from '../lib/format';
import { session } from '../lib/session';
import type { RootStackParamList } from '../navigation/types';
import { colors } from '../theme/colors';

type Props = NativeStackScreenProps<RootStackParamList, 'History'>;
type PeriodFilter = { from?: string; to?: string };

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const dayFormatter = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});
const timeFormatter = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  hour: '2-digit',
  minute: '2-digit',
});
const keyFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function isValidPeriod(from: string, to: string): boolean {
  return (
    (!from || datePattern.test(from)) &&
    (!to || datePattern.test(to)) &&
    (!from || !to || from <= to)
  );
}

function groupByCompletionDay(deliveries: DeliveryListItem[]) {
  const grouped = new Map<string, DeliveryListItem[]>();
  const newestFirst = [...deliveries].sort(
    (a, b) => Date.parse(b.statusChangedAt) - Date.parse(a.statusChangedAt),
  );
  for (const delivery of newestFirst) {
    const date = new Date(delivery.statusChangedAt);
    const key = keyFormatter.format(date);
    const current = grouped.get(key) ?? [];
    current.push(delivery);
    grouped.set(key, current);
  }
  return [...grouped.entries()];
}

export function DriverHistoryScreen({ navigation }: Props) {
  const [deliveries, setDeliveries] = useState<DeliveryListItem[]>([]);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [appliedPeriod, setAppliedPeriod] = useState<PeriodFilter>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadHistory = useCallback(async (period: PeriodFilter) => {
    const token = await session.getToken();
    if (!token) {
      setError('Sua sessão expirou. Entre novamente para consultar o histórico.');
      setLoading(false);
      setRefreshing(false);
      return;
    }

    try {
      setDeliveries(await deliveriesApi.list(token, { status: 'COMPLETED', ...period }));
      setError(null);
    } catch (requestError) {
      setError(
        requestError instanceof ApiError
          ? requestError.message
          : 'Não foi possível carregar seu histórico agora.',
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    loadHistory(appliedPeriod).catch(() => undefined);
  }, [appliedPeriod, loadHistory]);

  function applyPeriod() {
    if (!isValidPeriod(from, to)) {
      setError(
        'Informe datas no formato AAAA-MM-DD; a data inicial não pode ser posterior à final.',
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

  const totalEarnings = deliveries.reduce(
    (sum, delivery) => sum + (delivery.driverValue ?? 0),
    0,
  );
  const groups = useMemo(() => groupByCompletionDay(deliveries), [deliveries]);
  const periodLabel =
    appliedPeriod.from || appliedPeriod.to
      ? `${appliedPeriod.from ?? 'início'} até ${appliedPeriod.to ?? 'hoje'}`
      : 'Todo o histórico';

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <ScreenHeader title="Histórico" icon="pin" onBack={() => navigation.goBack()} />

      {loading && deliveries.length === 0 ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.actionSoft} />
          <Text style={styles.loadingText}>Carregando suas entregas...</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                loadHistory(appliedPeriod).catch(() => undefined);
              }}
              tintColor={colors.actionSoft}
              colors={[colors.actionSoft]}
            />
          }
        >
          <View style={styles.periodCard}>
            <View style={styles.periodTitleRow}>
              <Icon name="calendar" size={22} color={colors.actionSoft} />
              <View style={styles.periodTitleText}>
                <Text style={styles.periodTitle}>Período dos pedidos</Text>
                <Text style={styles.periodApplied}>{periodLabel}</Text>
              </View>
            </View>
            <Text style={styles.periodHelp}>
              O filtro da API considera quando o pedido foi criado. A lista abaixo mostra quando
              cada entrega foi concluída.
            </Text>
            <View style={styles.periodInputs}>
              <View style={styles.dateField}>
                <Text style={styles.dateLabel}>A partir de</Text>
                <TextInput
                  accessibilityLabel="Data inicial do histórico"
                  placeholder="AAAA-MM-DD"
                  placeholderTextColor={colors.inkMuted}
                  value={from}
                  onChangeText={setFrom}
                  autoCapitalize="none"
                  keyboardType="numbers-and-punctuation"
                  style={styles.dateInput}
                />
              </View>
              <View style={styles.dateField}>
                <Text style={styles.dateLabel}>Até</Text>
                <TextInput
                  accessibilityLabel="Data final do histórico"
                  placeholder="AAAA-MM-DD"
                  placeholderTextColor={colors.inkMuted}
                  value={to}
                  onChangeText={setTo}
                  autoCapitalize="none"
                  keyboardType="numbers-and-punctuation"
                  style={styles.dateInput}
                />
              </View>
            </View>
            <View style={styles.periodActions}>
              <Pressable
                accessibilityRole="button"
                style={styles.applyButton}
                onPress={applyPeriod}
              >
                <Text style={styles.applyButtonText}>Aplicar período</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                style={styles.clearButton}
                onPress={clearPeriod}
              >
                <Text style={styles.clearButtonText}>Limpar</Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.summaryRow}>
            <View style={styles.summaryBlock}>
              <Text style={styles.summaryLabel}>Ganhos no período</Text>
              <Text style={styles.summaryValue}>{formatarDinheiro(totalEarnings)}</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={[styles.summaryBlock, styles.summaryRight]}>
              <Text style={styles.summaryLabel}>Entregas</Text>
              <Text style={styles.summaryValue}>{deliveries.length}</Text>
            </View>
          </View>

          {error ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Tentar carregar histórico novamente"
              style={styles.errorBox}
              onPress={() => loadHistory(appliedPeriod).catch(() => undefined)}
            >
              <Text style={styles.errorText}>{error}</Text>
              <Text style={styles.retryText}>Tocar para tentar novamente</Text>
            </Pressable>
          ) : null}

          {!error && deliveries.length === 0 ? (
            <EmptyState
              message="Nenhuma entrega concluída neste período"
              description="Altere o período ou volte depois de concluir uma entrega."
            />
          ) : (
            groups.map(([day, dayDeliveries]) => (
              <View key={day} style={styles.dayGroup}>
                <Text style={styles.dayTitle}>
                  {dayFormatter.format(new Date(dayDeliveries[0].statusChangedAt))}
                </Text>
                {dayDeliveries.map((delivery) => (
                  <Pressable
                    key={delivery.id}
                    accessibilityRole="button"
                    accessibilityLabel={`Abrir detalhes do pedido ${delivery.displayNumber}`}
                    onPress={() => navigation.navigate('OrderDetail', { orderId: delivery.id })}
                    style={({ pressed }) => [
                      styles.deliveryRow,
                      pressed && styles.deliveryRowPressed,
                    ]}
                  >
                    <View style={styles.timeRail}>
                      <Text style={styles.deliveryTime}>
                        {timeFormatter.format(new Date(delivery.statusChangedAt))}
                      </Text>
                      <View style={styles.railDot} />
                      <View style={styles.railLine} />
                    </View>
                    <View style={styles.deliveryMain}>
                      <View style={styles.companyRow}>
                        <Icon name="store" size={20} color={colors.inkSoft} />
                        <Text style={styles.companyName} numberOfLines={1}>
                          {delivery.companyName}
                        </Text>
                      </View>
                      <Text style={styles.statusText}>Concluído</Text>
                      <Text style={styles.detailsLink}>Todos os detalhes</Text>
                    </View>
                    <View style={styles.deliveryValue}>
                      <Text style={styles.distanceText}>
                        {formatarDistancia(delivery.distanceKm) || '—'}
                      </Text>
                      <Text style={styles.amountText}>
                        {delivery.driverValue === null
                          ? 'A calcular'
                          : formatarDinheiro(delivery.driverValue)}
                      </Text>
                    </View>
                  </Pressable>
                ))}
              </View>
            ))
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 },
  loadingText: { color: colors.inkMuted, fontSize: 14 },
  content: { paddingHorizontal: 18, paddingTop: 10, paddingBottom: 34, gap: 18 },
  periodCard: {
    gap: 12,
    padding: 15,
    borderRadius: 15,
    backgroundColor: colors.surfaceMuted,
  },
  periodTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  periodTitleText: { flex: 1, gap: 1 },
  periodTitle: { color: colors.ink, fontSize: 15, fontWeight: '800' },
  periodApplied: { color: colors.inkMuted, fontSize: 12 },
  periodHelp: { color: colors.inkMuted, fontSize: 11, lineHeight: 16 },
  periodInputs: { flexDirection: 'row', gap: 10 },
  dateField: { flex: 1, gap: 5 },
  dateLabel: { color: colors.inkSoft, fontSize: 11, fontWeight: '700' },
  dateInput: {
    minHeight: 46,
    paddingHorizontal: 11,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: colors.divider,
    borderRadius: 10,
    color: colors.ink,
    backgroundColor: colors.surface,
    fontSize: 13,
  },
  periodActions: { flexDirection: 'row', gap: 9 },
  applyButton: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    backgroundColor: colors.action,
  },
  applyButtonText: { color: colors.actionText, fontSize: 13, fontWeight: '800' },
  clearButton: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 17,
    borderWidth: 1,
    borderColor: colors.divider,
    borderRadius: 10,
    backgroundColor: colors.surface,
  },
  clearButtonText: { color: colors.ink, fontSize: 13, fontWeight: '700' },
  summaryRow: { flexDirection: 'row', alignItems: 'stretch', paddingVertical: 6 },
  summaryBlock: { flex: 1, gap: 6 },
  summaryRight: { alignItems: 'flex-end' },
  summaryDivider: { width: 1, backgroundColor: colors.divider, marginHorizontal: 18 },
  summaryLabel: { color: colors.ink, fontSize: 14, fontWeight: '800' },
  summaryValue: { color: colors.inkSoft, fontSize: 23, fontWeight: '700' },
  errorBox: {
    gap: 4,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: 13,
    backgroundColor: colors.dangerSoft,
  },
  errorText: { color: colors.danger, fontSize: 13, fontWeight: '700' },
  retryText: { color: colors.inkSoft, fontSize: 12, fontWeight: '600' },
  dayGroup: { gap: 0 },
  dayTitle: {
    paddingVertical: 12,
    color: colors.ink,
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'center',
  },
  deliveryRow: {
    minHeight: 132,
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  deliveryRowPressed: { backgroundColor: colors.surfaceMuted },
  timeRail: { width: 54, alignItems: 'center' },
  deliveryTime: { color: colors.inkSoft, fontSize: 14, fontWeight: '800' },
  railDot: {
    width: 8,
    height: 8,
    marginTop: 8,
    borderRadius: 4,
    backgroundColor: colors.actionSoft,
  },
  railLine: { flex: 1, width: 2, marginTop: 3, backgroundColor: colors.divider },
  deliveryMain: { flex: 1, gap: 8 },
  companyRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  companyName: { flex: 1, color: colors.inkSoft, fontSize: 15, fontWeight: '600' },
  statusText: { color: colors.ink, fontSize: 14, fontWeight: '800' },
  detailsLink: {
    marginTop: 'auto',
    color: colors.ink,
    fontSize: 13,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
  deliveryValue: { alignItems: 'flex-end', gap: 5 },
  distanceText: { color: colors.ink, fontSize: 17, fontWeight: '800' },
  amountText: { color: colors.ink, fontSize: 18, fontWeight: '800' },
});
