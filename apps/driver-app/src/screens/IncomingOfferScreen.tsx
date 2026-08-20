import { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View, useColorScheme } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ApiError } from '@motoboycity/api-client';
import type { DeliveryOfferAddress, DeliveryOfferItem } from '@motoboycity/types';
import { PrimaryButton } from '../components/PrimaryButton';
import { colors } from '../theme/colors';
import { deliveryOffersApi } from '../lib/apiClient';
import { syncDeliveryTracking } from '../lib/deliveryTracking';
import { LocationError } from '../lib/location';
import { session } from '../lib/session';
import { useDispatchStore } from '../store/dispatchStore';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'IncomingOffer'>;

const currencyFormatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

function formatAddress(address: DeliveryOfferAddress | null): string {
  if (!address) return 'Destino informado no momento da entrega';
  const structured = [
    address.street,
    address.number,
    address.complement,
    address.city,
    address.state,
  ]
    .filter(Boolean)
    .join(', ');
  if (!structured) return 'Endereco nao informado';
  return address.referenceNote ? `${structured} - Ref.: ${address.referenceNote}` : structured;
}

function paymentMethodLabel(paymentMethod: 'BILLED' | 'ONLINE'): string {
  return paymentMethod === 'ONLINE' ? 'Pago online' : 'Faturado para a empresa';
}

function deliveryLabel(item: DeliveryOfferItem, isBatch: boolean): string {
  return isBatch ? `Pedido #${item.displayNumber} - ${item.serviceTypeName}` : item.serviceTypeName;
}

export function IncomingOfferScreen({ navigation }: Props) {
  const isDark = useColorScheme() === 'dark';
  const offer = useDispatchStore((state) => state.incomingOffer);
  const setIncomingOffer = useDispatchStore((state) => state.setIncomingOffer);
  const [secondsLeft, setSecondsLeft] = useState(offer?.expiresInSeconds ?? 0);
  const [status, setStatus] = useState<'idle' | 'accepting' | 'declining'>('idle');

  useEffect(() => {
    if (!offer) {
      navigation.goBack();
    }
  }, [offer, navigation]);

  useEffect(() => {
    if (!offer) return;
    setSecondsLeft(offer.expiresInSeconds);

    const interval = setInterval(() => {
      setSecondsLeft((current) => {
        if (current <= 1) {
          clearInterval(interval);
          setIncomingOffer(null);
          return 0;
        }
        return current - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [offer, setIncomingOffer]);

  if (!offer) return null;

  async function respond(action: 'accept' | 'decline') {
    const currentOffer = offer;
    if (!currentOffer) return;
    const token = await session.getToken();
    if (!token) return;

    setStatus(action === 'accept' ? 'accepting' : 'declining');
    try {
      if (action === 'accept') {
        const accepted = await deliveryOffersApi.accept(token, currentOffer.offerId);
        setIncomingOffer(null);
        try {
          await syncDeliveryTracking(
            token,
            accepted.deliveryIds?.length ? accepted.deliveryIds : [accepted.deliveryId],
          );
        } catch (trackingError) {
          Alert.alert(
            'Rastreamento não iniciado',
            trackingError instanceof LocationError
              ? trackingError.message
              : 'Não foi possível iniciar o rastreamento desta entrega. Verifique as permissões do aplicativo.',
          );
        }
        navigation.replace('DeliveryOperation', { deliveryId: accepted.deliveryId });
        return;
      }

      await deliveryOffersApi.decline(token, currentOffer.offerId);
      setIncomingOffer(null);
      navigation.goBack();
    } catch (error) {
      setStatus('idle');
      Alert.alert(
        'Oferta nao respondida',
        error instanceof ApiError ? error.message : 'Nao foi possivel responder a esta oferta.',
      );
    }
  }

  const text = isDark ? colors.textDark : colors.text;
  const muted = isDark ? colors.mutedDark : colors.muted;
  const background = isDark ? colors.backgroundDark : colors.background;
  const surface = isDark ? colors.surfaceDark : colors.surface;
  const border = isDark ? colors.borderDark : colors.border;
  const busy = status !== 'idle';
  const isBatch = offer.deliveries.length > 1;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: background }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.countdown, { color: colors.primary }]}>{secondsLeft}s</Text>
        <Text style={[styles.title, { color: text }]}>
          {isBatch
            ? `Novo lote - ${offer.deliveries.length} pedidos`
            : `Novo pedido #${offer.displayNumber}`}
        </Text>
        <Text style={[styles.company, { color: muted }]}>{offer.companyName}</Text>

        <View style={[styles.summaryCard, { backgroundColor: surface, borderColor: border }]}>
          <Text style={[styles.summaryLabel, { color: muted }]}>Forma de pagamento</Text>
          <Text style={[styles.summaryValue, { color: text }]}>
            {paymentMethodLabel(offer.paymentMethod)}
          </Text>
          <Text style={[styles.summaryLabel, { color: muted }]}>Valor total</Text>
          <Text style={[styles.summaryValue, { color: text }]}>
            {offer.totalValue === null
              ? 'A calcular na entrega'
              : currencyFormatter.format(offer.totalValue)}
          </Text>
          <Text style={[styles.summaryLabel, { color: muted }]}>Comissao da plataforma</Text>
          <Text style={[styles.summaryValue, { color: text }]}>
            {offer.platformValue === null
              ? 'A calcular na entrega'
              : currencyFormatter.format(offer.platformValue)}
          </Text>
          <Text style={[styles.earningsLabel, { color: colors.success }]}>Voce recebe</Text>
          <Text style={[styles.earningsValue, { color: colors.success }]}>
            {offer.driverValue === null
              ? 'A calcular na entrega'
              : currencyFormatter.format(offer.driverValue)}
          </Text>
          {offer.distanceKm !== null && (
            <Text style={[styles.distance, { color: muted }]}>
              Distancia total: {offer.distanceKm.toFixed(1)} km
            </Text>
          )}
        </View>

        <Text style={[styles.sectionTitle, { color: text }]}>Rota da oferta</Text>
        {offer.deliveries.map((delivery) => (
          <View key={delivery.deliveryId} style={[styles.deliveryCard, { borderColor: border }]}>
            <Text style={[styles.deliveryTitle, { color: text }]}>
              {deliveryLabel(delivery, isBatch)}
            </Text>
            <Text style={[styles.addressLabel, { color: muted }]}>Coleta</Text>
            <Text style={[styles.address, { color: text }]}>
              {formatAddress(delivery.pickupAddress)}
            </Text>
            <Text style={[styles.addressLabel, { color: muted }]}>Destino</Text>
            <Text style={[styles.address, { color: text }]}>
              {delivery.destinationKnownAtCreation
                ? formatAddress(delivery.dropoffAddress)
                : 'Destino informado no momento da entrega'}
            </Text>
            {delivery.requiresReturn && (
              <Text style={[styles.returnNotice, { color: colors.warning }]}>
                Exige retorno a coleta
              </Text>
            )}
          </View>
        ))}
      </ScrollView>

      <View style={styles.actions}>
        <PrimaryButton
          label={status === 'declining' ? 'Recusando...' : 'Recusar'}
          variant="outline"
          onPress={busy ? undefined : () => respond('decline')}
        />
        <PrimaryButton
          label={status === 'accepting' ? 'Aceitando...' : 'Aceitar'}
          onPress={busy ? undefined : () => respond('accept')}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 20, gap: 12 },
  countdown: { fontSize: 36, fontWeight: '700', textAlign: 'center' },
  title: { fontSize: 20, fontWeight: '700', textAlign: 'center' },
  company: { fontSize: 14, textAlign: 'center' },
  summaryCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    padding: 16,
    gap: 3,
  },
  summaryLabel: { fontSize: 12, marginTop: 4 },
  summaryValue: { fontSize: 15, fontWeight: '600' },
  earningsLabel: { fontSize: 13, fontWeight: '700', marginTop: 8 },
  earningsValue: { fontSize: 24, fontWeight: '700' },
  distance: { fontSize: 12, marginTop: 4 },
  sectionTitle: { fontSize: 15, fontWeight: '700', marginTop: 4 },
  deliveryCard: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, padding: 14, gap: 4 },
  deliveryTitle: { fontSize: 14, fontWeight: '700', marginBottom: 4 },
  addressLabel: { fontSize: 12, marginTop: 4 },
  address: { fontSize: 14, lineHeight: 19 },
  returnNotice: { fontSize: 12, fontWeight: '700', marginTop: 6 },
  actions: { padding: 16, gap: 12 },
});
