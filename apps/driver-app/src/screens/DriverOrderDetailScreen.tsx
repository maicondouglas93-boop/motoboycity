import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ApiError } from '@motoboycity/api-client';
import type { DeliveryAddressItem, DeliveryDetail, DeliveryStatus } from '@motoboycity/types';
import { Badge } from '../components/Badge';
import { Card } from '../components/Card';
import { EmptyState } from '../components/EmptyState';
import { ScreenHeader } from '../components/ScreenHeader';
import { deliveriesApi } from '../lib/apiClient';
import { session } from '../lib/session';
import type { RootStackParamList } from '../navigation/types';
import { colors } from '../theme/colors';

type Props = NativeStackScreenProps<RootStackParamList, 'OrderDetail'>;

const currencyFormatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const dateFormatter = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short' });

const statusLabel: Record<DeliveryStatus, string> = {
  SCHEDULED: 'Agendado',
  AWAITING_DRIVER: 'Buscando entregador',
  ACCEPTED: 'Aceito',
  COLLECTED: 'Coletado',
  DELIVERED: 'Entregue',
  FAILED: 'Sem sucesso — devolver na loja',
  COMPLETED: 'Concluído',
  CANCELLED: 'Cancelado',
  AWAITING_PAYMENT: 'Aguardando pagamento',
};

const statusTone: Record<DeliveryStatus, 'neutral' | 'warning' | 'success' | 'danger'> = {
  SCHEDULED: 'neutral',
  AWAITING_DRIVER: 'warning',
  ACCEPTED: 'warning',
  COLLECTED: 'warning',
  DELIVERED: 'warning',
  // Ambar, nao vermelho: o motoboy ainda tem trabalho a fazer (devolver a
  // mercadoria), e ele vai receber a corrida normal. Vermelho diria "deu
  // errado, acabou", que e falso nos dois sentidos.
  FAILED: 'warning',
  COMPLETED: 'success',
  CANCELLED: 'danger',
  AWAITING_PAYMENT: 'warning',
};

const invoiceStatusLabel = {
  PENDING: 'Pendente',
  PAID: 'Paga',
  OVERDUE: 'Vencida',
  CANCELLED: 'Cancelada',
} as const;

const lightTheme = StyleSheet.create({
  safeArea: { backgroundColor: colors.background },
  text: { color: colors.text },
  muted: { color: colors.muted },
  historyBorder: { borderLeftColor: colors.border },
});

const darkTheme = StyleSheet.create({
  safeArea: { backgroundColor: colors.backgroundDark },
  text: { color: colors.textDark },
  muted: { color: colors.mutedDark },
  historyBorder: { borderLeftColor: colors.borderDark },
});

function formatAddress(address: DeliveryAddressItem | undefined): string {
  if (!address) return 'Não informado';
  const structured = [
    address.street,
    address.number,
    address.complement,
    address.city,
    address.state,
  ]
    .filter(Boolean)
    .join(', ');
  if (structured) {
    return [structured, address.zip, address.referenceNote].filter(Boolean).join(' · ');
  }
  if (address.lat !== null && address.lng !== null) return 'Destino definido no local da entrega';
  return 'Não informado';
}

export function DriverOrderDetailScreen({ navigation, route }: Props) {
  const isDark = useColorScheme() === 'dark';
  const [delivery, setDelivery] = useState<DeliveryDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const theme = isDark ? darkTheme : lightTheme;

  const loadDetail = useCallback(async () => {
    const token = await session.getToken();
    if (!token) return;

    try {
      setError(null);
      setDelivery(await deliveriesApi.detail(token, route.params.orderId));
    } catch (requestError) {
      setError(
        requestError instanceof ApiError
          ? requestError.message
          : 'Não foi possível carregar este pedido.',
      );
    }
  }, [route.params.orderId]);

  useEffect(() => {
    loadDetail().catch(() => undefined);
  }, [loadDetail]);

  return (
    <SafeAreaView style={[styles.safeArea, theme.safeArea]}>
      <ScreenHeader title="Detalhes do pedido" onBack={() => navigation.goBack()} />
      {!delivery && !error ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : error || !delivery ? (
        <EmptyState message={error ?? 'Pedido não encontrado'} />
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={[styles.orderNumber, theme.text]}>Pedido #{delivery.displayNumber}</Text>
          <View style={styles.statusRow}>
            <Badge label={statusLabel[delivery.status]} tone={statusTone[delivery.status]} />
            {delivery.batchId && <Text style={[styles.muted12, theme.muted]}>Pedido em lote</Text>}
          </View>
          <Text style={[styles.muted12, theme.muted]}>
            Criado em {dateFormatter.format(new Date(delivery.createdAt))}
          </Text>

          <Card>
            <Text style={[styles.sectionTitle, theme.text]}>Valores da entrega</Text>
            <View style={styles.line}>
              <Text style={[styles.label, theme.muted]}>Valor total</Text>
              <Text style={[styles.value, theme.text]}>
                {delivery.totalValue === null
                  ? 'A calcular'
                  : currencyFormatter.format(delivery.totalValue)}
              </Text>
            </View>
            <View style={styles.line}>
              <Text style={[styles.label, theme.muted]}>Seu ganho</Text>
              <Text style={[styles.valueStrong, theme.text]}>
                {delivery.driverValue === null
                  ? 'A calcular'
                  : currencyFormatter.format(delivery.driverValue)}
              </Text>
            </View>
            {delivery.returnValue !== null && (
              <View style={styles.line}>
                <Text style={[styles.label, theme.muted]}>Inclui retorno</Text>
                <Text style={[styles.value, theme.text]}>
                  {currencyFormatter.format(delivery.returnValue)}
                </Text>
              </View>
            )}
            <View style={styles.line}>
              <Text style={[styles.label, theme.muted]}>Comissão da plataforma</Text>
              <Text style={[styles.value, theme.text]}>
                {delivery.platformValue === null
                  ? 'A calcular'
                  : currencyFormatter.format(delivery.platformValue)}
              </Text>
            </View>
            <View style={styles.line}>
              <Text style={[styles.label, theme.muted]}>Distância</Text>
              <Text style={[styles.value, theme.text]}>
                {delivery.distanceKm === null
                  ? 'A calcular'
                  : `${delivery.distanceKm.toFixed(1)} km`}
              </Text>
            </View>
          </Card>

          <Card>
            <Text style={[styles.sectionTitle, theme.text]}>Endereços</Text>
            <Text style={[styles.muted12, theme.muted]}>Coleta</Text>
            <Text style={[styles.address, theme.text]}>
              {formatAddress(delivery.addresses.find((item) => item.type === 'PICKUP'))}
            </Text>
            <Text style={[styles.destinationLabel, theme.muted]}>Destino</Text>
            <Text style={[styles.address, theme.text]}>
              {formatAddress(delivery.addresses.find((item) => item.type === 'DROPOFF'))}
            </Text>
          </Card>

          <Card>
            <Text style={[styles.sectionTitle, theme.text]}>Operação e faturamento</Text>
            <Text style={[styles.address, theme.text]}>{delivery.companyName}</Text>
            <Text style={[styles.muted12, theme.muted]}>{delivery.serviceTypeName}</Text>
            <View style={styles.detailRows}>
              <View style={styles.line}>
                <Text style={[styles.label, theme.muted]}>Retorno à coleta</Text>
                <Text style={[styles.value, theme.text]}>
                  {delivery.requiresReturn ? 'Obrigatório' : 'Não exigido'}
                </Text>
              </View>
              <View style={styles.line}>
                <Text style={[styles.label, theme.muted]}>Cobrança</Text>
                <Text style={[styles.value, theme.text]}>
                  {delivery.paymentMethod === 'BILLED' ? 'Faturado' : 'Online'}
                </Text>
              </View>
              {delivery.paymentMethod === 'BILLED' && (
                <View style={styles.line}>
                  <Text style={[styles.label, theme.muted]}>Fatura</Text>
                  <Text style={[styles.value, theme.text]}>
                    {delivery.invoice
                      ? `${delivery.invoice.number} · ${invoiceStatusLabel[delivery.invoice.status]}`
                      : 'Aguardando fechamento'}
                  </Text>
                </View>
              )}
              <View style={styles.line}>
                <Text style={[styles.label, theme.muted]}>Última atualização</Text>
                <Text style={[styles.value, theme.text]}>
                  {dateFormatter.format(new Date(delivery.statusChangedAt))}
                </Text>
              </View>
            </View>
          </Card>

          <Card>
            <Text style={[styles.sectionTitle, theme.text]}>Histórico operacional</Text>
            {delivery.statusHistory.map((entry, index) => (
              <View
                key={`${entry.changedAt}-${index}`}
                style={[styles.historyEntry, theme.historyBorder]}
              >
                <Text style={[styles.historyTitle, theme.text]}>
                  {entry.fromStatus ? statusLabel[entry.fromStatus] : 'Criação'} →{' '}
                  {statusLabel[entry.toStatus]}
                </Text>
                <Text style={[styles.historyMeta, theme.muted]}>
                  {dateFormatter.format(new Date(entry.changedAt))} ·{' '}
                  {entry.changedBy?.name ?? 'Sistema'}
                </Text>
                {entry.note && <Text style={[styles.historyMeta, theme.muted]}>{entry.note}</Text>}
              </View>
            ))}
          </Card>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 16, gap: 12 },
  orderNumber: { fontSize: 18, fontWeight: '700' },
  muted12: { fontSize: 12 },
  statusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { fontSize: 13, fontWeight: '700', marginBottom: 4 },
  line: { flexDirection: 'row', justifyContent: 'space-between' },
  label: { fontSize: 13 },
  value: { fontWeight: '600' },
  valueStrong: { fontWeight: '700' },
  address: { fontSize: 14 },
  destinationLabel: { fontSize: 12, marginTop: 8 },
  detailRows: { gap: 8, marginTop: 12 },
  historyEntry: {
    borderLeftWidth: StyleSheet.hairlineWidth,
    gap: 3,
    paddingLeft: 10,
    paddingVertical: 4,
  },
  historyTitle: { fontSize: 13, fontWeight: '600' },
  historyMeta: { fontSize: 12, lineHeight: 17 },
});
