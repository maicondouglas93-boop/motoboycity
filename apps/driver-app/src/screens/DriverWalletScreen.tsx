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
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ApiError } from '@motoboycity/api-client';
import type {
  DriverWalletSummary,
  WalletTransactionItem,
  WalletTransactionStatus,
  WithdrawalRequestItem,
} from '@motoboycity/types';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Badge } from '../components/Badge';
import { Card } from '../components/Card';
import { EmptyState } from '../components/EmptyState';
import { ScreenHeader } from '../components/ScreenHeader';
import { driverWalletApi } from '../lib/apiClient';
import { session } from '../lib/session';
import type { RootStackParamList } from '../navigation/types';
import { colors } from '../theme/colors';

type Props = NativeStackScreenProps<RootStackParamList, 'Wallet'>;
type TransactionFilter = 'ALL' | WalletTransactionStatus;
type PeriodFilter = { from?: string; to?: string };

const currencyFormatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const dateFormatter = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short' });
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

const FILTERS: { id: TransactionFilter; label: string }[] = [
  { id: 'ALL', label: 'Todos' },
  { id: 'PENDING', label: 'A liberar' },
  { id: 'RELEASED', label: 'Liberados' },
  { id: 'CANCELLED', label: 'Cancelados' },
];

const transactionLabels: Record<WalletTransactionItem['type'], string> = {
  CREDIT_REPASSE: 'Repasse da entrega',
  DEBIT_WITHDRAWAL: 'Saque solicitado',
  DEBIT_FEE: 'Taxa financeira',
  CREDIT_ADVANCE_RELEASE: 'Liberacao de antecipacao',
  CREDIT_ADJUSTMENT: 'Ajuste de credito',
  DEBIT_ADJUSTMENT: 'Ajuste de debito',
  CREDIT_REFUND: 'Estorno',
};

const transactionStatus: Record<
  WalletTransactionStatus,
  { label: string; tone: 'warning' | 'success' | 'danger' }
> = {
  PENDING: { label: 'A liberar', tone: 'warning' },
  RELEASED: { label: 'Liberado', tone: 'success' },
  CANCELLED: { label: 'Cancelado', tone: 'danger' },
};

const withdrawalStatus: Record<
  WithdrawalRequestItem['status'],
  { label: string; tone: 'warning' | 'success' | 'danger' }
> = {
  PENDING: { label: 'Em análise', tone: 'warning' },
  APPROVED: { label: 'Aprovado', tone: 'success' },
  PAID: { label: 'Pago', tone: 'success' },
  REJECTED: { label: 'Rejeitado', tone: 'danger' },
};

function isValidPeriod(from: string, to: string): boolean {
  return (
    (!from || datePattern.test(from)) &&
    (!to || datePattern.test(to)) &&
    (!from || !to || from <= to)
  );
}

export function DriverWalletScreen({ navigation }: Props) {
  const isDark = useColorScheme() === 'dark';
  const [wallet, setWallet] = useState<DriverWalletSummary | null>(null);
  const [filter, setFilter] = useState<TransactionFilter>('ALL');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [appliedPeriod, setAppliedPeriod] = useState<PeriodFilter>({});
  const [withdrawalAmount, setWithdrawalAmount] = useState('');
  const [submittingWithdrawal, setSubmittingWithdrawal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const text = isDark ? colors.textDark : colors.text;
  const muted = isDark ? colors.mutedDark : colors.muted;
  const border = isDark ? colors.borderDark : colors.border;

  const loadWallet = useCallback(
    async (selectedFilter: TransactionFilter, period: PeriodFilter) => {
      const token = await session.getToken();
      if (!token) {
        setError('Sua sessao expirou. Entre novamente para consultar a carteira.');
        setLoading(false);
        return;
      }

      try {
        setError(null);
        setWallet(
          await driverWalletApi.get(token, {
            ...(selectedFilter !== 'ALL' && { status: selectedFilter }),
            ...period,
          }),
        );
      } catch (requestError) {
        setError(
          requestError instanceof ApiError
            ? requestError.message
            : 'Nao foi possivel carregar sua carteira agora. Verifique a conexao e tente novamente.',
        );
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    setLoading(true);
    loadWallet(filter, appliedPeriod).catch(() => undefined);
  }, [filter, appliedPeriod, loadWallet]);

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

  async function requestWithdrawal() {
    const amount = Number(withdrawalAmount.replace(',', '.'));
    if (!Number.isFinite(amount) || amount <= 0) {
      setError('Informe um valor de saque maior que zero.');
      return;
    }
    if (wallet && amount > wallet.availableBalance) {
      setError('O valor solicitado não pode superar seu saldo disponível.');
      return;
    }
    const token = await session.getToken();
    if (!token) {
      setError('Sua sessão expirou. Entre novamente para solicitar o saque.');
      return;
    }

    try {
      setSubmittingWithdrawal(true);
      setError(null);
      await driverWalletApi.requestWithdrawal(token, amount);
      setWithdrawalAmount('');
      await loadWallet(filter, appliedPeriod);
    } catch (requestError) {
      setError(
        requestError instanceof ApiError
          ? requestError.message
          : 'Não foi possível solicitar o saque agora. Tente novamente.',
      );
    } finally {
      setSubmittingWithdrawal(false);
    }
  }

  return (
    <SafeAreaView
      style={[
        styles.safeArea,
        { backgroundColor: isDark ? colors.backgroundDark : colors.background },
      ]}
    >
      <ScreenHeader title="Carteira" onBack={() => navigation.goBack()} />
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {wallet ? (
            <>
              {error && (
                <View style={styles.errorBox}>
                  <Text style={styles.errorText}>{error}</Text>
                  <Pressable
                    onPress={() => loadWallet(filter, appliedPeriod).catch(() => undefined)}
                  >
                    <Text style={styles.retry}>Tentar novamente</Text>
                  </Pressable>
                </View>
              )}
              <View style={styles.banner}>
                <Text style={styles.bannerText}>
                  Saldos sao atuais. Os filtros abaixo alteram somente as movimentacoes exibidas no
                  extrato.
                </Text>
              </View>

              <View style={styles.balanceRow}>
                <Card style={styles.balanceCard}>
                  <Text style={[styles.balanceLabel, { color: muted }]}>Saldo disponivel</Text>
                  <Text style={[styles.balanceValue, { color: text }]}>
                    {currencyFormatter.format(wallet.availableBalance)}
                  </Text>
                </Card>
                <Card style={styles.balanceCard}>
                  <Text style={[styles.balanceLabel, { color: muted }]}>Saldo a liberar</Text>
                  <Text style={[styles.balanceValue, { color: colors.warning }]}>
                    {currencyFormatter.format(wallet.blockedBalance)}
                  </Text>
                </Card>
              </View>

              {wallet.pendingWithdrawalAmount > 0 && (
                <Card>
                  <Text style={[styles.balanceLabel, { color: muted }]}>
                    Saques em processamento
                  </Text>
                  <Text style={[styles.pendingWithdrawal, { color: text }]}>
                    {currencyFormatter.format(wallet.pendingWithdrawalAmount)}
                  </Text>
                </Card>
              )}

              <Card>
                <Text style={[styles.sectionCardTitle, { color: text }]}>Solicitar saque</Text>
                <Text style={[styles.withdrawalHelp, { color: muted }]}>
                  Saques são solicitados às segundas-feiras, sem taxa e sem valor mínimo. O valor
                  fica reservado enquanto a administração analisa e registra o pagamento.
                </Text>
                <View style={styles.withdrawalActions}>
                  <TextInput
                    accessibilityLabel="Valor do saque"
                    placeholder="Valor em R$"
                    placeholderTextColor={muted}
                    value={withdrawalAmount}
                    onChangeText={setWithdrawalAmount}
                    keyboardType="decimal-pad"
                    style={[styles.withdrawalInput, { borderColor: border, color: text }]}
                  />
                  <Pressable
                    disabled={submittingWithdrawal || wallet.availableBalance <= 0}
                    onPress={() => requestWithdrawal().catch(() => undefined)}
                    style={[
                      styles.withdrawalButton,
                      (submittingWithdrawal || wallet.availableBalance <= 0) && styles.disabledButton,
                    ]}
                  >
                    <Text style={styles.withdrawalButtonText}>
                      {submittingWithdrawal ? 'Solicitando...' : 'Solicitar saque'}
                    </Text>
                  </Pressable>
                </View>
                {wallet.availableBalance <= 0 && (
                  <Text style={[styles.withdrawalHint, { color: muted }]}>
                    Você precisa ter saldo liberado para solicitar um saque.
                  </Text>
                )}
              </Card>

              {!wallet.cacheMatchesLedger && (
                <View style={styles.integrityWarning}>
                  <Text style={styles.integrityWarningText}>
                    Encontramos uma divergencia de saldo. O extrato abaixo e a referencia; a equipe
                    financeira foi sinalizada para conferencia.
                  </Text>
                </View>
              )}

              <Text style={[styles.sectionTitle, { color: text }]}>Extrato financeiro</Text>
              <View style={styles.filters}>
                {FILTERS.map((item) => {
                  const selected = item.id === filter;
                  return (
                    <Pressable
                      key={item.id}
                      onPress={() => setFilter(item.id)}
                      style={[
                        styles.filter,
                        { borderColor: border },
                        selected && styles.filterSelected,
                      ]}
                    >
                      <Text
                        style={[
                          styles.filterText,
                          selected
                            ? styles.filterTextSelected
                            : isDark
                              ? styles.filterTextDark
                              : styles.filterTextLight,
                        ]}
                      >
                        {item.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <View style={[styles.periodCard, { borderColor: border }]}>
                <Text style={[styles.periodTitle, { color: text }]}>Periodo do extrato</Text>
                <Text style={[styles.periodHelp, { color: muted }]}>
                  Use AAAA-MM-DD. Deixe em branco para ver todo o historico.
                </Text>
                <View style={styles.periodInputs}>
                  <TextInput
                    accessibilityLabel="Data inicial do extrato"
                    placeholder="AAAA-MM-DD"
                    placeholderTextColor={muted}
                    value={from}
                    onChangeText={setFrom}
                    autoCapitalize="none"
                    style={[styles.dateInput, { borderColor: border, color: text }]}
                  />
                  <TextInput
                    accessibilityLabel="Data final do extrato"
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

              {wallet.transactions.length === 0 ? (
                <EmptyState message="Nenhuma movimentacao neste filtro" />
              ) : (
                wallet.transactions.map((transaction) => (
                  <Pressable
                    key={transaction.id}
                    disabled={!transaction.relatedDelivery}
                    onPress={() =>
                      transaction.relatedDelivery &&
                      navigation.navigate('OrderDetail', {
                        orderId: transaction.relatedDelivery.id,
                      })
                    }
                  >
                    <Card>
                      <View style={styles.transactionRow}>
                        <View style={styles.transactionText}>
                          <Text style={[styles.transactionTitle, { color: text }]}>
                            {transactionLabels[transaction.type]}
                            {transaction.relatedDelivery
                              ? ` #${transaction.relatedDelivery.displayNumber}`
                              : ''}
                          </Text>
                          <Text style={[styles.transactionMeta, { color: muted }]}>
                            {transaction.relatedDelivery?.companyName ??
                              dateFormatter.format(new Date(transaction.createdAt))}
                          </Text>
                          <Text style={[styles.transactionMeta, { color: muted }]}>
                            Lancado em {dateFormatter.format(new Date(transaction.createdAt))}
                          </Text>
                          {transaction.releaseAt && (
                            <Text style={[styles.transactionMeta, { color: muted }]}>
                              Liberacao prevista:{' '}
                              {dateFormatter.format(new Date(transaction.releaseAt))}
                            </Text>
                          )}
                        </View>
                        <View style={styles.transactionAmount}>
                          <Badge {...transactionStatus[transaction.status]} />
                          <Text
                            style={[
                              styles.transactionValue,
                              {
                                color:
                                  transaction.direction === 'CREDIT'
                                    ? colors.success
                                    : colors.danger,
                              },
                            ]}
                          >
                            {transaction.direction === 'CREDIT' ? '+' : '-'}
                            {currencyFormatter.format(transaction.amount)}
                          </Text>
                          {transaction.relatedDelivery && (
                            <Text style={styles.detailsLink}>Ver pedido</Text>
                          )}
                        </View>
                      </View>
                    </Card>
                  </Pressable>
                ))
              )}

              <Text style={[styles.sectionTitle, { color: text }]}>Histórico de saques</Text>
              {wallet.withdrawalRequests.length === 0 ? (
                <EmptyState message="Nenhum saque solicitado até o momento" />
              ) : (
                wallet.withdrawalRequests.map((withdrawal) => (
                  <Card key={withdrawal.id}>
                    <View style={styles.withdrawalHistoryHeader}>
                      <View>
                        <Text style={[styles.transactionTitle, { color: text }]}>
                          Saque de {currencyFormatter.format(withdrawal.requestedAmount)}
                        </Text>
                        <Text style={[styles.transactionMeta, { color: muted }]}>
                          Solicitado em {dateFormatter.format(new Date(withdrawal.createdAt))}
                        </Text>
                      </View>
                      <Badge {...withdrawalStatus[withdrawal.status]} />
                    </View>
                    <Text style={[styles.withdrawalHistoryMeta, { color: muted }]}>
                      Líquido: {currencyFormatter.format(withdrawal.netAmount)} · Taxa:{' '}
                      {currencyFormatter.format(withdrawal.feeAmount)}
                    </Text>
                    {withdrawal.paymentReference && (
                      <Text style={[styles.withdrawalHistoryMeta, { color: muted }]}>
                        Referência de pagamento: {withdrawal.paymentReference}
                      </Text>
                    )}
                    <View style={[styles.withdrawalTimeline, { borderColor: border }]}>
                      {withdrawal.statusHistory.map((entry) => (
                        <View key={`${entry.toStatus}-${entry.changedAt}`} style={styles.timelineEntry}>
                          <Text style={[styles.timelineTitle, { color: text }]}>
                            {withdrawalStatus[entry.toStatus].label} ·{' '}
                            {dateFormatter.format(new Date(entry.changedAt))}
                          </Text>
                          {entry.note && (
                            <Text style={[styles.transactionMeta, { color: muted }]}>{entry.note}</Text>
                          )}
                        </View>
                      ))}
                    </View>
                  </Card>
                ))
              )}
            </>
          ) : error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
              <Pressable onPress={() => loadWallet(filter, appliedPeriod).catch(() => undefined)}>
                <Text style={styles.retry}>Tentar novamente</Text>
              </Pressable>
            </View>
          ) : null}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 16, gap: 12 },
  banner: { backgroundColor: '#fef3c7', borderRadius: 8, padding: 12 },
  bannerText: { color: colors.warning, fontSize: 12, textAlign: 'center', lineHeight: 18 },
  balanceRow: { flexDirection: 'row', gap: 12 },
  balanceCard: { flex: 1 },
  balanceLabel: { fontSize: 12 },
  balanceValue: { fontSize: 18, fontWeight: '700' },
  pendingWithdrawal: { fontSize: 16, fontWeight: '700' },
  sectionCardTitle: { fontSize: 15, fontWeight: '700' },
  withdrawalHelp: { marginTop: 6, fontSize: 12, lineHeight: 18 },
  withdrawalActions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  withdrawalInput: {
    flex: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 9,
    fontSize: 14,
  },
  withdrawalButton: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: colors.primary,
    paddingHorizontal: 14,
  },
  disabledButton: { opacity: 0.55 },
  withdrawalButtonText: { color: '#ffffff', fontSize: 13, fontWeight: '700' },
  withdrawalHint: { marginTop: 8, fontSize: 12, lineHeight: 17 },
  integrityWarning: { borderRadius: 8, backgroundColor: '#fee2e2', padding: 12 },
  integrityWarningText: { color: colors.danger, fontSize: 12, lineHeight: 18 },
  sectionTitle: { fontSize: 15, fontWeight: '700', marginTop: 8 },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  filter: { borderRadius: 999, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 7 },
  filterSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterText: { fontSize: 12, fontWeight: '600' },
  filterTextSelected: { color: '#ffffff' },
  filterTextLight: { color: colors.text },
  filterTextDark: { color: colors.textDark },
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
  transactionRow: { flexDirection: 'row', gap: 12, justifyContent: 'space-between' },
  transactionText: { flex: 1, gap: 2 },
  transactionTitle: { fontSize: 13, fontWeight: '700' },
  transactionMeta: { fontSize: 11 },
  transactionAmount: { alignItems: 'flex-end', gap: 5 },
  transactionValue: { fontSize: 14, fontWeight: '700' },
  detailsLink: { color: colors.primary, fontSize: 11, fontWeight: '700' },
  withdrawalHistoryHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  withdrawalHistoryMeta: { marginTop: 6, fontSize: 12 },
  withdrawalTimeline: { marginTop: 10, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 8, gap: 7 },
  timelineEntry: { gap: 2 },
  timelineTitle: { fontSize: 12, fontWeight: '700' },
  errorBox: { gap: 8, paddingVertical: 20 },
  errorText: { color: colors.danger, lineHeight: 18 },
  retry: { color: colors.primary, fontWeight: '700' },
});
