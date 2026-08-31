import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ApiError } from '@motoboycity/api-client';
import type {
  DriverWalletSummary,
  WalletTransactionItem,
  WalletTransactionStatus,
  WithdrawalRequestItem,
} from '@motoboycity/types';
import { Badge } from '../components/Badge';
import { Card } from '../components/Card';
import { EmptyState } from '../components/EmptyState';
import { Icon } from '../components/Icon';
import { PrimaryButton } from '../components/PrimaryButton';
import { ScreenHeader } from '../components/ScreenHeader';
import { driverWalletApi } from '../lib/apiClient';
import { formatarDinheiro } from '../lib/format';
import { session } from '../lib/session';
import type { RootStackParamList } from '../navigation/types';
import { colors } from '../theme/colors';

type Props = NativeStackScreenProps<RootStackParamList, 'Wallet'>;
type TransactionFilter = 'ALL' | WalletTransactionStatus;

const FILTERS: { id: TransactionFilter; label: string }[] = [
  { id: 'ALL', label: 'Todos' },
  { id: 'PENDING', label: 'A liberar' },
  { id: 'RELEASED', label: 'Liberados' },
  { id: 'CANCELLED', label: 'Cancelados' },
];

const transactionLabels: Record<WalletTransactionItem['type'], string> = {
  CREDIT_REPASSE: 'Repasse automático',
  DEBIT_WITHDRAWAL: 'Saque solicitado',
  DEBIT_FEE: 'Taxa financeira',
  CREDIT_ADVANCE_RELEASE: 'Liberação financeira',
  CREDIT_ADJUSTMENT: 'Ajuste de crédito',
  DEBIT_ADJUSTMENT: 'Ajuste de débito',
  CREDIT_REFUND: 'Estorno',
};

const transactionStatus: Record<
  WalletTransactionStatus,
  { label: string; tone: 'warning' | 'success' | 'danger' }
> = {
  PENDING: { label: 'Aguardando', tone: 'warning' },
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

const dateFormatter = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

export function DriverWalletScreen({ navigation }: Props) {
  const [wallet, setWallet] = useState<DriverWalletSummary | null>(null);
  const [filter, setFilter] = useState<TransactionFilter>('ALL');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadWallet = useCallback(async (selectedFilter: TransactionFilter) => {
    const token = await session.getToken();
    if (!token) {
      setError('Sua sessão expirou. Entre novamente para consultar a carteira.');
      setLoading(false);
      setRefreshing(false);
      return;
    }

    try {
      setWallet(
        await driverWalletApi.get(token, {
          ...(selectedFilter !== 'ALL' && { status: selectedFilter }),
          limit: 100,
        }),
      );
      setError(null);
    } catch (requestError) {
      setError(
        requestError instanceof ApiError
          ? requestError.message
          : 'Não foi possível carregar sua carteira agora.',
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      loadWallet(filter).catch(() => undefined);
    }, [filter, loadWallet]),
  );

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <ScreenHeader title="Carteira" icon="wallet" onBack={() => navigation.goBack()} />

      {loading && !wallet ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.actionSoft} />
          <Text style={styles.loadingText}>Atualizando seus saldos...</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                loadWallet(filter).catch(() => undefined);
              }}
              tintColor={colors.actionSoft}
              colors={[colors.actionSoft]}
            />
          }
        >
          {error ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Tentar carregar carteira novamente"
              style={styles.errorBox}
              onPress={() => loadWallet(filter).catch(() => undefined)}
            >
              <Text style={styles.errorText}>{error}</Text>
              <Text style={styles.retryText}>Tocar para tentar novamente</Text>
            </Pressable>
          ) : null}

          {wallet ? (
            <>
              <View style={styles.processingBanner}>
                <Icon name="info" size={20} color={colors.ink} />
                <Text style={styles.processingText}>
                  {wallet.withdrawal.weekdayLabel
                    ? `Solicitações de saque são abertas ${
                        wallet.withdrawal.weekdayLabel === 'sábado' ||
                        wallet.withdrawal.weekdayLabel === 'domingo'
                          ? 'aos'
                          : 'às'
                      } ${wallet.withdrawal.weekdayLabel}s.`
                    : 'Solicitações de saque estão abertas todos os dias.'}
                </Text>
              </View>

              <View style={styles.balanceRow}>
                <View style={styles.balanceBlock}>
                  <Text style={styles.balanceLabel}>Saldo disponível</Text>
                  <Text style={styles.availableBalance}>
                    {formatarDinheiro(wallet.availableBalance)}
                  </Text>
                </View>
                <View style={styles.balanceDivider} />
                <View style={styles.balanceBlock}>
                  <Text style={styles.balanceLabel}>Saldo bloqueado</Text>
                  <Text style={styles.blockedBalance}>
                    {formatarDinheiro(wallet.blockedBalance)}
                  </Text>
                </View>
              </View>

              {wallet.pendingWithdrawalAmount > 0 ? (
                <View style={styles.pendingBox}>
                  <View style={styles.pendingIcon}>
                    <Icon name="clock" size={19} color={colors.warning} />
                  </View>
                  <View style={styles.pendingText}>
                    <Text style={styles.pendingTitle}>Saque em processamento</Text>
                    <Text style={styles.pendingDescription}>
                      {formatarDinheiro(wallet.pendingWithdrawalAmount)} aguardando análise ou
                      pagamento.
                    </Text>
                  </View>
                </View>
              ) : null}

              <PrimaryButton
                label="Solicitar saque"
                onPress={() => navigation.navigate('Withdrawal')}
              />

              {!wallet.cacheMatchesLedger ? (
                <View style={styles.integrityWarning}>
                  <Icon name="info" size={20} color={colors.danger} />
                  <Text style={styles.integrityText}>
                    Encontramos uma divergência de saldo. O extrato é a referência e a equipe
                    financeira deve conferir sua carteira.
                  </Text>
                </View>
              ) : null}

              <View style={styles.sectionHeader}>
                <Icon name="list" size={22} color={colors.ink} />
                <Text style={styles.sectionTitle}>Histórico de transações</Text>
              </View>

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.filters}
              >
                {FILTERS.map((item) => {
                  const selected = item.id === filter;
                  return (
                    <Pressable
                      key={item.id}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      onPress={() => setFilter(item.id)}
                      style={[styles.filter, selected && styles.filterSelected]}
                    >
                      <Text style={[styles.filterText, selected && styles.filterTextSelected]}>
                        {item.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>

              {wallet.transactions.length === 0 ? (
                <EmptyState
                  message="Nenhuma movimentação neste filtro"
                  description="Os repasses das entregas e os saques aparecem aqui."
                />
              ) : (
                <View style={styles.transactions}>
                  {wallet.transactions.map((transaction) => (
                    <TransactionRow
                      key={transaction.id}
                      transaction={transaction}
                      onPress={() =>
                        transaction.relatedDelivery
                          ? navigation.navigate('OrderDetail', {
                              orderId: transaction.relatedDelivery.id,
                            })
                          : undefined
                      }
                    />
                  ))}
                </View>
              )}

              {wallet.withdrawalRequests.length > 0 ? (
                <>
                  <View style={styles.sectionHeader}>
                    <Icon name="money" size={22} color={colors.ink} />
                    <Text style={styles.sectionTitle}>Solicitações de saque</Text>
                  </View>
                  <View style={styles.withdrawals}>
                    {wallet.withdrawalRequests.map((withdrawal) => (
                      <Card key={withdrawal.id} style={styles.withdrawalCard}>
                        <View style={styles.withdrawalHeader}>
                          <View style={styles.withdrawalText}>
                            <Text style={styles.withdrawalValue}>
                              {formatarDinheiro(withdrawal.requestedAmount)}
                            </Text>
                            <Text style={styles.transactionMeta}>
                              Solicitado em {dateFormatter.format(new Date(withdrawal.createdAt))}
                            </Text>
                          </View>
                          <Badge {...withdrawalStatus[withdrawal.status]} />
                        </View>
                        {withdrawal.paymentReference ? (
                          <Text style={styles.paymentReference}>
                            Referência do pagamento: {withdrawal.paymentReference}
                          </Text>
                        ) : null}
                      </Card>
                    ))}
                  </View>
                </>
              ) : null}
            </>
          ) : null}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function TransactionRow({
  transaction,
  onPress,
}: {
  transaction: WalletTransactionItem;
  onPress: () => void | undefined;
}) {
  const isCredit = transaction.direction === 'CREDIT';
  const hasOrder = Boolean(transaction.relatedDelivery);

  return (
    <Pressable
      accessibilityRole={hasOrder ? 'button' : undefined}
      accessibilityLabel={
        hasOrder ? `Abrir pedido ${transaction.relatedDelivery?.displayNumber}` : undefined
      }
      disabled={!hasOrder}
      onPress={onPress}
      style={({ pressed }) => [styles.transaction, pressed && styles.transactionPressed]}
    >
      <View
        style={[
          styles.transactionDot,
          { backgroundColor: isCredit ? colors.success : colors.danger },
        ]}
      />
      <View style={styles.transactionMain}>
        <Text style={styles.transactionTitle}>
          {transactionLabels[transaction.type]}
          {transaction.relatedDelivery
            ? ` do pedido #${transaction.relatedDelivery.displayNumber}`
            : ''}
        </Text>
        <Text style={styles.transactionMeta}>
          {transaction.relatedDelivery?.companyName ??
            dateFormatter.format(new Date(transaction.createdAt))}
        </Text>
        {transaction.releaseAt ? (
          <Text style={styles.transactionRelease}>
            Liberação em {dateFormatter.format(new Date(transaction.releaseAt))}
          </Text>
        ) : null}
      </View>
      <View style={styles.transactionSide}>
        <Badge {...transactionStatus[transaction.status]} />
        <Text style={[styles.transactionValue, isCredit ? styles.credit : styles.debit]}>
          {isCredit ? '+' : '-'} {formatarDinheiro(transaction.amount)}
        </Text>
        {hasOrder ? <Text style={styles.detailsLink}>Ver pedido</Text> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 },
  loadingText: { color: colors.inkMuted, fontSize: 14 },
  content: { paddingHorizontal: 18, paddingTop: 12, paddingBottom: 34, gap: 18 },
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
  processingBanner: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: colors.warningSoft,
    elevation: 3,
    shadowColor: colors.warning,
    shadowOpacity: 0.14,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  processingText: {
    flex: 1,
    color: colors.ink,
    fontSize: 14,
    fontWeight: '800',
    textAlign: 'center',
  },
  balanceRow: { flexDirection: 'row', alignItems: 'stretch', paddingVertical: 8 },
  balanceBlock: { flex: 1, gap: 5, paddingHorizontal: 10 },
  balanceDivider: { width: 1, backgroundColor: colors.divider },
  balanceLabel: { color: colors.inkSoft, fontSize: 15, fontWeight: '700' },
  availableBalance: { color: colors.success, fontSize: 24, fontWeight: '800' },
  blockedBalance: { color: colors.danger, fontSize: 24, fontWeight: '800' },
  pendingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 13,
    borderRadius: 13,
    backgroundColor: colors.surfaceMuted,
  },
  pendingIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.warningSoft,
  },
  pendingText: { flex: 1, gap: 2 },
  pendingTitle: { color: colors.ink, fontSize: 14, fontWeight: '800' },
  pendingDescription: { color: colors.inkMuted, fontSize: 12, lineHeight: 17 },
  integrityWarning: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 13,
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: 12,
    backgroundColor: colors.dangerSoft,
  },
  integrityText: { flex: 1, color: colors.danger, fontSize: 12, lineHeight: 18, fontWeight: '600' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 10 },
  sectionTitle: { color: colors.ink, fontSize: 19, fontWeight: '800' },
  filters: { gap: 8, paddingRight: 18 },
  filter: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: colors.divider,
    borderRadius: 18,
    backgroundColor: colors.surface,
  },
  filterSelected: { borderColor: colors.actionSoft, backgroundColor: colors.actionSoft },
  filterText: { color: colors.inkSoft, fontSize: 12, fontWeight: '700' },
  filterTextSelected: { color: colors.surface },
  transactions: { borderTopWidth: 1, borderTopColor: colors.divider },
  transaction: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 11,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  transactionPressed: { backgroundColor: colors.surfaceMuted },
  transactionDot: { width: 9, height: 9, borderRadius: 5, marginTop: 7 },
  transactionMain: { flex: 1, gap: 3 },
  transactionTitle: { color: colors.inkSoft, fontSize: 14, lineHeight: 19, fontWeight: '700' },
  transactionMeta: { color: colors.inkMuted, fontSize: 11, lineHeight: 16 },
  transactionRelease: { color: colors.inkMuted, fontSize: 11, lineHeight: 16 },
  transactionSide: { alignItems: 'flex-end', gap: 5 },
  transactionValue: { fontSize: 14, fontWeight: '800' },
  credit: { color: colors.success },
  debit: { color: colors.danger },
  detailsLink: {
    color: colors.actionSoft,
    fontSize: 11,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
  withdrawals: { gap: 10 },
  withdrawalCard: { elevation: 0, shadowOpacity: 0 },
  withdrawalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  withdrawalText: { flex: 1, gap: 3 },
  withdrawalValue: { color: colors.ink, fontSize: 17, fontWeight: '800' },
  paymentReference: { marginTop: 7, color: colors.inkSoft, fontSize: 12 },
});
