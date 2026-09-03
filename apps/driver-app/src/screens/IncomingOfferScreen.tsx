import { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ApiError } from '@motoboycity/api-client';
import type { DeliveryOfferAddress, DeliveryOfferItem } from '@motoboycity/types';
import { Icon } from '../components/Icon';
import { MapBackdrop } from '../components/MapBackdrop';
import { RouteTimeline, type RouteStop } from '../components/RouteTimeline';
import { colors } from '../theme/colors';
import { deliveryOffersApi } from '../lib/apiClient';
import { reconcileAcceptedAssignment } from '../lib/acceptanceReconciliation';
import { syncDeliveryTracking } from '../lib/deliveryTracking';
import { formatarDinheiro } from '../lib/format';
import { LocationError } from '../lib/location';
import {
  dispensarOfertaNativa,
  iniciarAlarmeDaOfertaNativa,
  pararAlarmeDaOfertaNativa,
} from '../lib/offerSession';
import { remainingOfferSeconds } from '../lib/offerDeadline';
import { session } from '../lib/session';
import { useDispatchStore } from '../store/dispatchStore';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'IncomingOffer'>;

function formatAddress(address: DeliveryOfferAddress | null): string {
  if (!address) return 'Endereço informado no momento da entrega';
  const structured = [
    address.street,
    address.number,
    address.complement,
    address.city,
    address.state,
  ]
    .filter(Boolean)
    .join(', ');
  if (!structured) return 'Endereço não informado';
  return address.referenceNote ? `${structured} - Ref.: ${address.referenceNote}` : structured;
}

function paymentMethodLabel(paymentMethod: 'BILLED' | 'ONLINE'): string {
  return paymentMethod === 'ONLINE' ? 'Pago online' : 'Faturado';
}

/** `00:00:28`, no mesmo formato do cronometro da referencia. */
function formatarCronometro(segundos: number): string {
  const seguro = Math.max(0, segundos);
  const h = Math.floor(seguro / 3600);
  const m = Math.floor((seguro % 3600) / 60);
  const s = seguro % 60;
  return [h, m, s].map((parte) => String(parte).padStart(2, '0')).join(':');
}

/**
 * Monta as paradas do pedido para a linha do tempo.
 *
 * Em lote, cada pedido entra com o proprio par coleta/entrega, e o numero do
 * pedido vira rotulo — sem isso o motoboy nao consegue dizer qual endereco e de
 * qual pedido.
 */
function paradasDaOferta(deliveries: readonly DeliveryOfferItem[], emLote: boolean): RouteStop[] {
  return deliveries.flatMap((delivery) => {
    const prefixo = emLote ? `Pedido #${delivery.displayNumber} — ` : '';
    const paradas: RouteStop[] = [
      {
        icon: 'store',
        label: `${prefixo}Coleta`,
        address: formatAddress(delivery.pickupAddress),
      },
      {
        icon: 'flag',
        label: `${prefixo}Entrega`,
        address: delivery.destinationKnownAtCreation
          ? formatAddress(delivery.dropoffAddress)
          : 'Endereço informado no momento da entrega',
      },
    ];

    if (delivery.requiresReturn) {
      paradas.push({
        icon: 'return',
        label: 'Retorno',
        address: formatAddress(delivery.pickupAddress),
      });
    }

    return paradas;
  });
}

export function IncomingOfferScreen({ navigation }: Props) {
  const offer = useDispatchStore((state) => state.incomingOffer);
  const offerExpiresAtMs = useDispatchStore((state) => state.incomingOfferExpiresAtMs);
  const setIncomingOffer = useDispatchStore((state) => state.setIncomingOffer);
  const [secondsLeft, setSecondsLeft] = useState(offer?.expiresInSeconds ?? 0);
  const [status, setStatus] = useState<'idle' | 'accepting' | 'declining'>('idle');
  const responseInFlight = useRef(false);
  const activeOfferId = offer?.offerId;

  useEffect(() => {
    if (!activeOfferId) return;
    iniciarAlarmeDaOfertaNativa(activeOfferId).catch(() => undefined);
    return () => {
      pararAlarmeDaOfertaNativa(activeOfferId).catch(() => undefined);
    };
  }, [activeOfferId]);

  useEffect(() => {
    if (!offer) {
      navigation.goBack();
    }
  }, [offer, navigation]);

  useEffect(() => {
    if (!activeOfferId || offerExpiresAtMs === null) return;
    const offerId = activeOfferId;

    const updateCountdown = () => {
      const remaining = remainingOfferSeconds(offerExpiresAtMs);
      setSecondsLeft(remaining);
      if (remaining === 0) {
        dispensarOfertaNativa(offerId).catch(() => undefined);
        setIncomingOffer(null);
      }
    };

    updateCountdown();

    const interval = setInterval(updateCountdown, 1_000);

    return () => clearInterval(interval);
  }, [activeOfferId, offerExpiresAtMs, setIncomingOffer]);

  if (!offer) return null;

  async function respond(action: 'accept' | 'decline') {
    const currentOffer = offer;
    if (!currentOffer || responseInFlight.current) return;
    responseInFlight.current = true;
    setStatus(action === 'accept' ? 'accepting' : 'declining');
    let token: string | null = null;
    try {
      token = await session.getToken();
      if (!token) {
        setStatus('idle');
        return;
      }
      await pararAlarmeDaOfertaNativa(currentOffer.offerId);

      if (action === 'accept') {
        const accepted = await deliveryOffersApi.accept(token, currentOffer.offerId);
        await dispensarOfertaNativa(currentOffer.offerId);
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
      await dispensarOfertaNativa(currentOffer.offerId);
      setIncomingOffer(null);
      navigation.goBack();
    } catch (error) {
      if (action === 'accept' && token) {
        const reconciled = await reconcileAcceptedAssignment(
          token,
          currentOffer.deliveries.map((item) => item.deliveryId),
        ).catch(() => null);
        if (reconciled) {
          await dispensarOfertaNativa(currentOffer.offerId);
          setIncomingOffer(null);
          await syncDeliveryTracking(
            token,
            reconciled.activeDeliveries.map((item) => item.id),
          ).catch(() => undefined);
          navigation.replace('DeliveryOperation', { deliveryId: reconciled.delivery.id });
          return;
        }
      }
      setStatus('idle');
      if (useDispatchStore.getState().incomingOffer?.offerId === currentOffer.offerId) {
        await iniciarAlarmeDaOfertaNativa(currentOffer.offerId);
      }
      Alert.alert(
        'Oferta não respondida',
        error instanceof ApiError ? error.message : 'Não foi possível responder a esta oferta.',
      );
    } finally {
      responseInFlight.current = false;
    }
  }

  const busy = status !== 'idle';
  const emLote = offer.deliveries.length > 1;
  const valorACalcular = offer.driverValue === null;

  return (
    <View style={styles.tela}>
      <MapBackdrop />
      <View style={styles.cortina} />

      <View style={styles.centro}>
        <View style={styles.cartao}>
          <View style={styles.topo}>
            {valorACalcular ? (
              <Text style={styles.avisoValor}>
                O valor será calculado conforme as entregas ocorrerem.
              </Text>
            ) : (
              <View style={styles.blocoValor}>
                <Text style={styles.rotuloValor}>Você recebe</Text>
                <Text style={styles.valor}>{formatarDinheiro(offer.driverValue)}</Text>
              </View>
            )}

            <View style={styles.quantidade}>
              <Icon name="pin" size={24} color={colors.link} />
              <Text style={styles.quantidadeTexto}>
                {offer.deliveries.length} {offer.deliveries.length === 1 ? 'entrega' : 'entregas'}
              </Text>
            </View>
          </View>

          <View style={styles.identificacao}>
            <Icon name="person" size={22} color={colors.actionSoft} />
            <Text style={styles.empresa} numberOfLines={1}>
              {offer.companyName}
            </Text>
            <Text style={styles.cronometro}>{formatarCronometro(secondsLeft)}</Text>
          </View>

          <View style={styles.separador} />

          <ScrollView style={styles.rota} showsVerticalScrollIndicator={false}>
            <RouteTimeline stops={paradasDaOferta(offer.deliveries, emLote)} />
          </ScrollView>

          <View style={styles.separador} />

          <View style={styles.rodape}>
            <View style={styles.selo}>
              <Text style={styles.seloTexto}>
                {paymentMethodLabel(offer.paymentMethod)}
                {offer.distanceKm !== null ? ` · ${offer.distanceKm.toFixed(1)} km` : ''}
              </Text>
            </View>
          </View>

          <View style={styles.acoes}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Recusar oferta"
              disabled={busy}
              onPress={() => respond('decline')}
              style={[styles.botao, styles.botaoRecusar, busy && styles.botaoOcupado]}
            >
              <Icon name="close" size={40} color={colors.surface} />
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Aceitar oferta"
              disabled={busy}
              onPress={() => respond('accept')}
              style={[styles.botao, styles.botaoAceitar, busy && styles.botaoOcupado]}
            >
              <Icon name="check" size={40} color={colors.surface} />
            </Pressable>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tela: { flex: 1, backgroundColor: colors.mapBackdrop },
  cortina: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  centro: { flex: 1, justifyContent: 'center', paddingHorizontal: 16 },
  cartao: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    paddingTop: 16,
    paddingBottom: 18,
    maxHeight: '82%',
    elevation: 16,
    shadowColor: '#000',
    shadowOpacity: 0.28,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
  },
  topo: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 16,
  },
  avisoValor: { flex: 1, fontSize: 15, lineHeight: 21, fontWeight: '700', color: colors.danger },
  blocoValor: { flex: 1 },
  rotuloValor: { fontSize: 13, fontWeight: '700', color: colors.inkMuted },
  valor: { fontSize: 28, fontWeight: '700', color: colors.success },
  quantidade: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  quantidadeTexto: { fontSize: 21, fontWeight: '700', color: colors.ink },
  identificacao: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 12,
  },
  empresa: { flex: 1, fontSize: 20, fontWeight: '700', color: colors.ink },
  cronometro: { fontSize: 19, fontWeight: '600', color: colors.inkSoft },
  separador: { height: 1, backgroundColor: colors.divider },
  rota: { paddingHorizontal: 16, paddingTop: 16 },
  rodape: { paddingHorizontal: 16, paddingTop: 14 },
  selo: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: colors.divider,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  seloTexto: { fontSize: 16, color: colors.inkSoft },
  acoes: { flexDirection: 'row', justifyContent: 'center', gap: 56, paddingTop: 20 },
  botao: {
    width: 84,
    height: 84,
    borderRadius: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  botaoRecusar: { backgroundColor: colors.danger },
  botaoAceitar: { backgroundColor: colors.success },
  botaoOcupado: { opacity: 0.5 },
});
