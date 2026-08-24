import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ApiError } from '@motoboycity/api-client';
import type { DriverWalletSummary } from '@motoboycity/types';
import { Icon } from '../components/Icon';
import { PrimaryButton } from '../components/PrimaryButton';
import { ScreenHeader } from '../components/ScreenHeader';
import { driverWalletApi } from '../lib/apiClient';
import { formatarDinheiro } from '../lib/format';
import { idempotencyAttemptFor, type IdempotencyAttempt } from '../lib/idempotency';
import { session } from '../lib/session';
import { isWithdrawalDay, parseWithdrawalAmount } from '../lib/withdrawal';
import type { RootStackParamList } from '../navigation/types';
import { colors } from '../theme/colors';

type Props = NativeStackScreenProps<RootStackParamList, 'Withdrawal'>;

export function WithdrawalScreen({ navigation }: Props) {
  const [wallet, setWallet] = useState<DriverWalletSummary | null>(null);
  const [amountText, setAmountText] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const withdrawalAttempt = useRef<IdempotencyAttempt | null>(null);

  const load = useCallback(async () => {
    const token = await session.getToken();
    if (!token) {
      setError('Sua sessão expirou. Entre novamente para solicitar o saque.');
      setLoading(false);
      return;
    }
    try {
      setWallet(await driverWalletApi.get(token, { limit: 1 }));
      setError(null);
    } catch (requestError) {
      setError(
        requestError instanceof ApiError
          ? requestError.message
          : 'Não foi possível consultar seu saldo agora.',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load().catch(() => undefined);
    }, [load]),
  );

  const amount = parseWithdrawalAmount(amountText);
  const monday = isWithdrawalDay();
  const hasValidAmount =
    Number.isFinite(amount) && amount > 0 && Boolean(wallet) && amount <= (wallet?.availableBalance ?? 0);
  const canSubmit = monday && hasValidAmount && !submitting;

  async function requestWithdrawal() {
    if (!wallet || !hasValidAmount) {
      setError('Informe um valor maior que zero e dentro do saldo disponível.');
      return;
    }

    const token = await session.getToken();
    if (!token) {
      setError('Sua sessão expirou. Entre novamente para solicitar o saque.');
      return;
    }

    setSubmitting(true);
    setError(null);
    const attempt = idempotencyAttemptFor(withdrawalAttempt.current, { amount });
    withdrawalAttempt.current = attempt;
    try {
      await driverWalletApi.requestWithdrawal(token, {
        amount,
        idempotencyKey: attempt.key,
      });
      withdrawalAttempt.current = null;
      Alert.alert(
        'Saque solicitado',
        'A solicitação foi enviada para análise. Você pode acompanhar o status na carteira.',
        [{ text: 'Voltar para a carteira', onPress: () => navigation.goBack() }],
      );
    } catch (requestError) {
      setError(
        requestError instanceof ApiError
          ? requestError.message
          : 'Não foi possível solicitar o saque agora.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <ScreenHeader title="Resgatar saldo" icon="money" onBack={() => navigation.goBack()} />

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.actionSoft} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.balanceCard}>
            <Text style={styles.balanceLabel}>Valor disponível para saque</Text>
            <Text style={styles.balanceValue}>
              {formatarDinheiro(wallet?.availableBalance ?? 0)}
            </Text>
          </View>

          <View style={[styles.ruleBox, monday ? styles.ruleBoxOpen : styles.ruleBoxClosed]}>
            <Icon name={monday ? 'check' : 'calendar'} size={22} color={monday ? colors.success : colors.warning} />
            <View style={styles.ruleText}>
              <Text style={styles.ruleTitle}>
                {monday ? 'Solicitações abertas hoje' : 'Solicitações disponíveis às segundas'}
              </Text>
              <Text style={styles.ruleDescription}>
                O saque não possui taxa nem valor mínimo. O servidor confirma o dia e o saldo no
                momento da solicitação.
              </Text>
            </View>
          </View>

          {wallet && wallet.pendingWithdrawalAmount > 0 ? (
            <View style={styles.pendingBox}>
              <Icon name="clock" size={20} color={colors.warning} />
              <Text style={styles.pendingText}>
                Você já possui {formatarDinheiro(wallet.pendingWithdrawalAmount)} em processamento.
              </Text>
            </View>
          ) : null}

          <View style={styles.destinationBox}>
            <View style={styles.destinationIcon}>
              <Icon name="shield" size={22} color={colors.actionSoft} />
            </View>
            <View style={styles.destinationText}>
              <Text style={styles.destinationTitle}>Destino protegido</Text>
              <Text style={styles.destinationDescription}>
                O pagamento usa a chave PIX validada no seu cadastro. Ela não pode ser trocada por
                esta tela durante uma solicitação.
              </Text>
            </View>
          </View>

          <View style={styles.field}>
            <View style={styles.fieldHeader}>
              <Text style={styles.fieldLabel}>Valor a resgatar</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Usar todo o saldo disponível"
                disabled={!wallet || wallet.availableBalance <= 0}
                onPress={() =>
                  setAmountText((wallet?.availableBalance ?? 0).toFixed(2).replace('.', ','))
                }
              >
                <Text style={styles.useAll}>Usar saldo total</Text>
              </Pressable>
            </View>
            <View style={styles.inputShell}>
              <Text style={styles.currencyPrefix}>R$</Text>
              <TextInput
                accessibilityLabel="Valor do saque"
                value={amountText}
                onChangeText={(value) => {
                  setAmountText(value);
                  setError(null);
                }}
                placeholder="0,00"
                placeholderTextColor={colors.inkMuted}
                keyboardType="decimal-pad"
                style={styles.input}
              />
            </View>
            {amountText.length > 0 && !hasValidAmount ? (
              <Text style={styles.fieldError}>
                Informe um valor válido dentro do saldo disponível.
              </Text>
            ) : null}
          </View>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <PrimaryButton
            label={submitting ? 'Solicitando...' : monday ? 'Solicitar saque' : 'Disponível na segunda-feira'}
            disabled={!canSubmit}
            onPress={() => requestWithdrawal().catch(() => undefined)}
          />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 34, gap: 18 },
  balanceCard: {
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 22,
    borderWidth: 1,
    borderColor: colors.divider,
    borderRadius: 15,
    backgroundColor: colors.surfaceMuted,
  },
  balanceLabel: { color: colors.inkSoft, fontSize: 14, fontWeight: '700' },
  balanceValue: { color: colors.success, fontSize: 30, fontWeight: '800' },
  ruleBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 14,
    borderWidth: 1,
    borderRadius: 13,
  },
  ruleBoxOpen: { borderColor: colors.success, backgroundColor: colors.successSoft },
  ruleBoxClosed: { borderColor: colors.warning, backgroundColor: colors.warningSoft },
  ruleText: { flex: 1, gap: 3 },
  ruleTitle: { color: colors.ink, fontSize: 14, fontWeight: '800' },
  ruleDescription: { color: colors.inkSoft, fontSize: 12, lineHeight: 18 },
  pendingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 13,
    borderRadius: 12,
    backgroundColor: colors.surfaceMuted,
  },
  pendingText: { flex: 1, color: colors.inkSoft, fontSize: 12, lineHeight: 18 },
  destinationBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 15,
    borderRadius: 13,
    backgroundColor: colors.actionSoftTint,
  },
  destinationIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  destinationText: { flex: 1, gap: 3 },
  destinationTitle: { color: colors.ink, fontSize: 14, fontWeight: '800' },
  destinationDescription: { color: colors.inkSoft, fontSize: 12, lineHeight: 18 },
  field: { gap: 8 },
  fieldHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  fieldLabel: { color: colors.ink, fontSize: 17, fontWeight: '700' },
  useAll: { color: colors.actionSoft, fontSize: 12, fontWeight: '800', textDecorationLine: 'underline' },
  inputShell: {
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: colors.divider,
    borderRadius: 13,
    backgroundColor: colors.surface,
  },
  currencyPrefix: { color: colors.inkSoft, fontSize: 18, fontWeight: '700' },
  input: { flex: 1, color: colors.ink, fontSize: 21, fontWeight: '700' },
  fieldError: { color: colors.danger, fontSize: 12 },
  errorText: {
    padding: 12,
    borderRadius: 10,
    color: colors.danger,
    backgroundColor: colors.dangerSoft,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '600',
  },
});
