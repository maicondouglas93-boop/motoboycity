import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ApiError } from '@motoboycity/api-client';
import type { DeliveryDetail, DeliveryStatus } from '@motoboycity/types';
import { BottomSheet } from '../components/BottomSheet';
import { EmptyState } from '../components/EmptyState';
import { Icon } from '../components/Icon';
import { MapBackdrop } from '../components/MapBackdrop';
import { PrimaryButton } from '../components/PrimaryButton';
import { RouteTimeline } from '../components/RouteTimeline';
import { SheetHeader } from '../components/SheetHeader';
import { deliveriesApi } from '../lib/apiClient';
import {
  completeDeliveryRouteUrl,
  deliveryPaymentLabel,
  formatDeliveryAddress,
  formatOperationDateTime,
} from '../lib/deliveryOperation';
import { session } from '../lib/session';
import type { RootStackParamList } from '../navigation/types';
import { colors } from '../theme/colors';

type Props = NativeStackScreenProps<RootStackParamList, 'OrderDetail'>;

const currencyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

const statusLabel: Record<DeliveryStatus, string> = {
  SCHEDULED: 'Agendado',
  AWAITING_DRIVER: 'Buscando entregador',
  ACCEPTED: 'Aceito',
  COLLECTED: 'Coletado',
  DELIVERED: 'Entregue',
  FAILED: 'Devolução pendente',
  COMPLETED: 'Concluído',
  CANCELLED: 'Cancelado',
  AWAITING_PAYMENT: 'Aguardando pagamento',
};

const invoiceStatusLabel = {
  PENDING: 'Pendente',
  PAID: 'Paga',
  OVERDUE: 'Vencida',
  CANCELLED: 'Cancelada',
} as const;

function customerPaymentLabel(method: DeliveryDetail['customerPaymentMethod']): string | null {
  switch (method) {
    case 'PREPAID':
      return 'Pré-pago';
    case 'CARD':
      return 'Cartão na entrega';
    case 'CASH':
      return 'Dinheiro na entrega';
    case 'PIX':
      return 'Pix na entrega';
    default:
      return null;
  }
}

async function openRecipientPhone(phone: string) {
  const normalized = phone.replace(/[^+\d]/g, '');
  if (!normalized) return;
  try {
    await Linking.openURL(`tel:${normalized}`);
  } catch {
    Alert.alert('Ligação indisponível', 'Não foi possível abrir o telefone neste aparelho.');
  }
}

export function DriverOrderDetailScreen({ navigation, route }: Props) {
  const [delivery, setDelivery] = useState<DeliveryDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadDetail = useCallback(async () => {
    const token = await session.getToken();
    if (!token) {
      setError('Sua sessão expirou. Entre novamente para consultar este pedido.');
      setLoading(false);
      return;
    }

    try {
      setError(null);
      setDelivery(await deliveriesApi.detail(token, route.params.orderId));
    } catch (requestError) {
      setError(
        requestError instanceof ApiError
          ? requestError.message
          : 'Não foi possível carregar este pedido.',
      );
    } finally {
      setLoading(false);
    }
  }, [route.params.orderId]);

  useEffect(() => {
    loadDetail().catch(() => undefined);
  }, [loadDetail]);

  const pickup = delivery?.addresses.find((address) => address.type === 'PICKUP');
  const dropoff = delivery?.addresses.find((address) => address.type === 'DROPOFF');
  const hadFailure = delivery?.statusHistory.some((entry) => entry.toStatus === 'FAILED') ?? false;
  const hasReturnLeg = Boolean(delivery?.requiresReturn || hadFailure);
  const fullRouteUrl = delivery ? completeDeliveryRouteUrl(pickup, dropoff, hasReturnLeg) : null;
  const pickupDone = Boolean(
    delivery?.statusHistory.some((entry) => entry.toStatus === 'COLLECTED'),
  );
  const dropoffDone = Boolean(
    delivery?.statusHistory.some((entry) => entry.toStatus === 'DELIVERED'),
  );
  const returnDone = Boolean(hasReturnLeg && delivery?.status === 'COMPLETED');

  async function openFullRoute() {
    if (!fullRouteUrl) return;
    try {
      await Linking.openURL(fullRouteUrl);
    } catch {
      Alert.alert(
        'Não foi possível abrir a rota',
        'Verifique se existe um aplicativo de mapas instalado.',
      );
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <MapBackdrop />
      <BottomSheet style={styles.sheet}>
        <SheetHeader
          title={delivery ? `Pedido #${delivery.displayNumber}` : 'Detalhes do pedido'}
          onBack={() => navigation.goBack()}
        />

        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={colors.actionSoft} />
            <Text style={styles.loadingText}>Carregando o pedido...</Text>
          </View>
        ) : error || !delivery ? (
          <View style={styles.errorState}>
            <EmptyState message={error ?? 'Pedido não encontrado'} />
            <PrimaryButton label="Tentar novamente" onPress={() => loadDetail()} />
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            <View style={styles.dateRow}>
              <Icon name="calendar" size={23} color={colors.inkMuted} />
              <Text style={styles.dateText}>
                {formatOperationDateTime(delivery.statusChangedAt)}
              </Text>
            </View>

            <View style={styles.statusRow}>
              <View style={styles.statusGroup}>
                <Icon
                  name={delivery.status === 'COMPLETED' ? 'check' : 'pin'}
                  size={24}
                  color={delivery.status === 'COMPLETED' ? colors.success : colors.actionSoft}
                />
                <Text style={styles.statusText}>{statusLabel[delivery.status]}</Text>
              </View>
              <Text style={styles.brand}>motoboy</Text>
            </View>

            {delivery.batchId ? <Text style={styles.batchLabel}>Pedido em lote</Text> : null}

            <DetailSection icon="money" title="Valores">
              <View style={styles.primaryValueRow}>
                <Text style={styles.primaryValueLabel}>Valor do entregador</Text>
                <View style={styles.dots} />
                <Text style={styles.primaryValue}>
                  {delivery.driverValue === null
                    ? 'A calcular'
                    : currencyFormatter.format(delivery.driverValue)}
                </Text>
              </View>
              <View style={styles.valueGrid}>
                <ValueItem
                  label="Valor total"
                  value={
                    delivery.totalValue === null
                      ? 'A calcular'
                      : currencyFormatter.format(delivery.totalValue)
                  }
                />
                <ValueItem
                  label="Distância"
                  value={
                    delivery.distanceKm === null
                      ? 'A calcular'
                      : `${delivery.distanceKm.toFixed(1)} km`
                  }
                />
                {delivery.platformValue !== null ? (
                  <ValueItem
                    label="Comissão"
                    value={currencyFormatter.format(delivery.platformValue)}
                  />
                ) : null}
                {delivery.returnValue !== null ? (
                  <ValueItem
                    label="Inclui retorno"
                    value={currencyFormatter.format(delivery.returnValue)}
                  />
                ) : null}
              </View>
            </DetailSection>

            <DetailSection icon="list" title="Método de pagamento">
              <View style={styles.paymentRow}>
                <Icon name="list" size={27} color={colors.actionSoft} />
                <View style={styles.paymentText}>
                  <Text style={styles.paymentValue}>
                    {deliveryPaymentLabel(delivery.paymentMethod)}
                  </Text>
                  {customerPaymentLabel(delivery.customerPaymentMethod) ? (
                    <Text style={styles.paymentDetail}>
                      Cliente: {customerPaymentLabel(delivery.customerPaymentMethod)}
                    </Text>
                  ) : null}
                </View>
              </View>
            </DetailSection>

            <DetailSection icon="pin" title="Endereços">
              <RouteTimeline
                stops={[
                  {
                    icon: 'store',
                    done: pickupDone,
                    label: delivery.companyName,
                    address: formatDeliveryAddress(pickup),
                  },
                  {
                    icon: 'pin',
                    done: dropoffDone,
                    label: 'Entrega',
                    address: delivery.destinationKnownAtCreation
                      ? formatDeliveryAddress(dropoff)
                      : dropoff
                        ? formatDeliveryAddress(dropoff)
                        : 'Destino definido no momento da entrega',
                  },
                  ...(hasReturnLeg
                    ? [
                        {
                          icon: 'return' as const,
                          done: returnDone,
                          label: 'Retorno',
                          address: formatDeliveryAddress(pickup),
                        },
                      ]
                    : []),
                ]}
              />

              {fullRouteUrl ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Abrir rota completa"
                  onPress={() => openFullRoute().catch(() => undefined)}
                  style={({ pressed }) => [styles.routeButton, pressed && styles.pressed]}
                >
                  <Icon name="pin" size={19} color={colors.actionText} />
                  <Text style={styles.routeButtonText}>Abrir rota completa</Text>
                </Pressable>
              ) : null}
            </DetailSection>

            <DetailSection icon="person" title="Cliente">
              <View style={styles.clientRow}>
                <Icon name="person" size={22} color={colors.actionSoft} />
                <Text style={styles.clientName}>
                  {delivery.recipientName || 'Destinatário não informado'}
                </Text>
              </View>
              {delivery.recipientPhone ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Ligar para ${delivery.recipientName || 'o cliente'}`}
                  onPress={() =>
                    openRecipientPhone(delivery.recipientPhone ?? '').catch(() => undefined)
                  }
                  style={({ pressed }) => [styles.phoneRow, pressed && styles.pressed]}
                >
                  <Icon name="phone" size={21} color={colors.link} />
                  <Text style={styles.phoneText}>{delivery.recipientPhone}</Text>
                </Pressable>
              ) : null}
            </DetailSection>

            <View style={styles.operationCard}>
              <Text style={styles.operationTitle}>Operação e faturamento</Text>
              <OperationRow label="Empresa" value={delivery.companyName} />
              <OperationRow label="Modalidade" value={delivery.serviceTypeName} />
              <OperationRow
                label="Retorno à coleta"
                value={hasReturnLeg ? 'Realizado' : 'Não exigido'}
              />
              {delivery.externalOrderNumber ? (
                <OperationRow label="Pedido da loja" value={delivery.externalOrderNumber} />
              ) : null}
              {delivery.invoice ? (
                <OperationRow
                  label="Fatura"
                  value={`${delivery.invoice.number} · ${invoiceStatusLabel[delivery.invoice.status]}`}
                />
              ) : delivery.paymentMethod === 'BILLED' ? (
                <OperationRow label="Fatura" value="Aguardando fechamento" />
              ) : null}
            </View>

            {delivery.driverNote ? (
              <View style={styles.noteCard}>
                <Text style={styles.noteTitle}>Observação da loja</Text>
                <Text style={styles.noteText}>{delivery.driverNote}</Text>
              </View>
            ) : null}

            <DetailSection icon="list" title="Histórico operacional">
              <View style={styles.historyList}>
                {delivery.statusHistory.map((entry, index) => (
                  <View key={`${entry.changedAt}-${index}`} style={styles.historyEntry}>
                    <View style={styles.historyDot} />
                    <View style={styles.historyCopy}>
                      <Text style={styles.historyTitle}>
                        {entry.fromStatus ? statusLabel[entry.fromStatus] : 'Criação'} →{' '}
                        {statusLabel[entry.toStatus]}
                      </Text>
                      <Text style={styles.historyMeta}>
                        {formatOperationDateTime(entry.changedAt)} ·{' '}
                        {entry.changedBy?.name ?? 'Sistema'}
                      </Text>
                      {entry.note ? <Text style={styles.historyNote}>{entry.note}</Text> : null}
                    </View>
                  </View>
                ))}
              </View>
            </DetailSection>
          </ScrollView>
        )}
      </BottomSheet>
    </SafeAreaView>
  );
}

function DetailSection({
  icon,
  title,
  children,
}: {
  icon: 'money' | 'list' | 'pin' | 'person';
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Icon name={icon} size={27} color={colors.actionSoft} />
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

function ValueItem({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.valueItem}>
      <Text style={styles.valueItemLabel}>{label}</Text>
      <Text style={styles.valueItemValue}>{value}</Text>
    </View>
  );
}

function OperationRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.operationRow}>
      <Text style={styles.operationLabel}>{label}</Text>
      <Text style={styles.operationValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.mapBackdrop },
  sheet: { flex: 1, marginTop: 74, overflow: 'hidden' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { color: colors.inkMuted, fontSize: 14 },
  errorState: { flex: 1, justifyContent: 'center', padding: 22, gap: 14 },
  content: { paddingHorizontal: 20, paddingBottom: 36, gap: 21 },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dateText: { color: colors.ink, fontSize: 16, fontWeight: '700' },
  statusRow: {
    minHeight: 55,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 38,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  statusGroup: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  statusText: { color: colors.ink, fontSize: 18, fontWeight: '800' },
  brand: { color: colors.danger, fontSize: 18, fontWeight: '800' },
  batchLabel: {
    alignSelf: 'center',
    marginTop: -12,
    color: colors.inkMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  section: { gap: 13 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
  },
  sectionTitle: { color: colors.ink, fontSize: 22, fontWeight: '800' },
  primaryValueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 7 },
  primaryValueLabel: { color: colors.ink, fontSize: 15, fontWeight: '700' },
  dots: {
    flex: 1,
    borderBottomWidth: 2,
    borderStyle: 'dotted',
    borderBottomColor: colors.inkSoft,
  },
  primaryValue: { maxWidth: '44%', color: colors.ink, fontSize: 16, fontWeight: '800' },
  valueGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  valueItem: {
    minWidth: '47%',
    flexGrow: 1,
    gap: 4,
    padding: 11,
    borderRadius: 11,
    backgroundColor: colors.surfaceMuted,
  },
  valueItemLabel: { color: colors.inkMuted, fontSize: 11, fontWeight: '700' },
  valueItemValue: { color: colors.ink, fontSize: 14, fontWeight: '800' },
  paymentRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  paymentText: { flex: 1, gap: 2 },
  paymentValue: { color: colors.ink, fontSize: 17, fontWeight: '800' },
  paymentDetail: { color: colors.inkSoft, fontSize: 13 },
  routeButton: {
    minHeight: 54,
    borderRadius: 11,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    paddingHorizontal: 16,
    backgroundColor: colors.action,
  },
  routeButtonText: { color: colors.actionText, fontSize: 17, fontWeight: '800' },
  clientRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  clientName: { flex: 1, color: colors.ink, fontSize: 17, fontWeight: '700' },
  phoneRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginLeft: 31 },
  phoneText: { color: colors.link, fontSize: 16, fontWeight: '800' },
  operationCard: {
    gap: 10,
    padding: 15,
    borderRadius: 13,
    backgroundColor: colors.actionSoftTint,
  },
  operationTitle: { color: colors.ink, fontSize: 16, fontWeight: '800' },
  operationRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 18 },
  operationLabel: { color: colors.inkMuted, fontSize: 12 },
  operationValue: {
    flex: 1,
    color: colors.ink,
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'right',
  },
  noteCard: { gap: 6, padding: 14, borderRadius: 12, backgroundColor: colors.warningSoft },
  noteTitle: { color: colors.ink, fontSize: 13, fontWeight: '800' },
  noteText: { color: colors.inkSoft, fontSize: 13, lineHeight: 19 },
  historyList: { gap: 0 },
  historyEntry: { minHeight: 58, flexDirection: 'row', gap: 11 },
  historyDot: {
    width: 9,
    height: 9,
    marginTop: 5,
    borderRadius: 5,
    backgroundColor: colors.actionSoft,
  },
  historyCopy: {
    flex: 1,
    gap: 3,
    paddingBottom: 13,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  historyTitle: { color: colors.ink, fontSize: 13, fontWeight: '700' },
  historyMeta: { color: colors.inkMuted, fontSize: 11, lineHeight: 16 },
  historyNote: { color: colors.inkSoft, fontSize: 12, lineHeight: 17 },
  pressed: { opacity: 0.82 },
});
