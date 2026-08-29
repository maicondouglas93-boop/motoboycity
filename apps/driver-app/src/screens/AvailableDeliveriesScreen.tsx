import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ApiError } from '@motoboycity/api-client';
import type { AvailableDeliveryItem } from '@motoboycity/types';
import { Card } from '../components/Card';
import { EmptyState } from '../components/EmptyState';
import { Icon } from '../components/Icon';
import { RouteTimeline, type RouteStop } from '../components/RouteTimeline';
import { ScreenHeader } from '../components/ScreenHeader';
import { deliveryOffersApi } from '../lib/apiClient';
import { reconcileAcceptedAssignment } from '../lib/acceptanceReconciliation';
import { syncDeliveryTracking } from '../lib/deliveryTracking';
import { formatDeliveryAddress } from '../lib/deliveryOperation';
import { formatarDinheiro, formatarDistancia, formatarHora } from '../lib/format';
import { session } from '../lib/session';
import { useDispatchStore } from '../store/dispatchStore';
import type { RootStackParamList } from '../navigation/types';
import { colors } from '../theme/colors';

type Props = NativeStackScreenProps<RootStackParamList, 'AvailableDeliveries'>;

const timeFormatter = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  hour: '2-digit',
  minute: '2-digit',
});

function availableDeliveryStops(delivery: AvailableDeliveryItem): RouteStop[] {
  const pickup = delivery.addresses.find((address) => address.type === 'PICKUP');
  const dropoff = delivery.addresses.find((address) => address.type === 'DROPOFF');
  const stops: RouteStop[] = [
    {
      icon: 'store',
      label: 'Coleta',
      address: formatDeliveryAddress(pickup),
    },
    {
      icon: 'flag',
      label: 'Entrega',
      address: delivery.destinationKnownAtCreation
        ? formatDeliveryAddress(dropoff)
        : 'Endereço definido no momento da entrega',
    },
  ];

  if (delivery.requiresReturn) {
    stops.push({
      icon: 'return',
      label: 'Retorno',
      address: formatDeliveryAddress(pickup),
    });
  }

  return stops;
}

/** Pedidos livres que o entregador autenticado pode assumir agora. */
export function AvailableDeliveriesScreen({ navigation }: Props) {
  const punishment = useDispatchStore((state) => state.punishment);
  const [deliveries, setDeliveries] = useState<AvailableDeliveryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const claimInFlight = useRef(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const token = await session.getToken();
    if (!token) {
      setError('Sua sessão expirou. Entre novamente para consultar os pedidos.');
      setLoading(false);
      setRefreshing(false);
      return;
    }

    try {
      setDeliveries(await deliveryOffersApi.listAvailable(token));
      setError(null);
    } catch (loadError) {
      setError(
        loadError instanceof ApiError
          ? loadError.message
          : 'Não foi possível carregar os pedidos disponíveis.',
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load().catch(() => undefined);
  }, [load]);

  async function claim(delivery: AvailableDeliveryItem) {
    if (claimInFlight.current) return;

    claimInFlight.current = true;
    setClaimingId(delivery.id);
    let token: string | null = null;
    try {
      token = await session.getToken();
      if (!token) return;

      await deliveryOffersApi.claim(token, delivery.id);
      navigation.replace('DeliveryOperation', { deliveryId: delivery.id });
    } catch (claimError) {
      const reconciled = token
        ? await reconcileAcceptedAssignment(token, [delivery.id]).catch(() => null)
        : null;
      if (reconciled && token) {
        await syncDeliveryTracking(
          token,
          reconciled.activeDeliveries.map((item) => item.id),
        ).catch(() => undefined);
        navigation.replace('DeliveryOperation', { deliveryId: reconciled.delivery.id });
        return;
      }
      Alert.alert(
        'Pedido indisponível',
        claimError instanceof ApiError
          ? claimError.message
          : 'Não foi possível assumir este pedido.',
      );
      await load();
    } finally {
      claimInFlight.current = false;
      setClaimingId(null);
    }
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <ScreenHeader title="Pedidos disponíveis" icon="clock" onBack={() => navigation.goBack()} />

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.actionSoft} />
          <Text style={styles.loadingText}>Buscando pedidos na sua região...</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                load().catch(() => undefined);
              }}
              tintColor={colors.actionSoft}
              colors={[colors.actionSoft]}
            />
          }
        >
          <View style={styles.intro}>
            <Icon name="info" size={18} color={colors.actionSoft} />
            <Text style={styles.introText}>
              Estes pedidos estão livres agora. Ao assumir, a corrida fica reservada para você.
            </Text>
          </View>

          {error ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Tentar carregar pedidos novamente"
              style={styles.errorBox}
              onPress={() => load().catch(() => undefined)}
            >
              <Text style={styles.errorText}>{error}</Text>
              <Text style={styles.retryText}>Tocar para tentar novamente</Text>
            </Pressable>
          ) : null}

          {deliveries.length === 0 && !error ? (
            /*
              Durante a punicao a API devolve lista vazia de proposito. Sem
              dizer isso aqui, a tela repete "quando um pedido ficar livre ele
              aparece" — uma explicacao errada que manda o motoboy esperar por
              algo que nao vem.
            */
            punishment ? (
              <EmptyState
                message={`Você está fora do despacho até ${formatarHora(punishment.expiresAt)}`}
                description="Nesse período você não recebe oferta nem consegue pegar pedido nesta lista. Os pedidos que você já aceitou continuam valendo."
              />
            ) : (
              <EmptyState
                message="Nenhum pedido disponível agora"
                description="Quando um pedido ficar livre na sua região e modalidade, ele aparecerá aqui. Puxe a tela para atualizar."
              />
            )
          ) : (
            deliveries.map((delivery) => {
              const destination = delivery.destinationKnownAtCreation
                ? formatarDistancia(delivery.distanceKm) || 'Distância a calcular'
                : 'Destino definido na entrega';
              const value =
                delivery.driverValue === null
                  ? 'A calcular na entrega'
                  : formatarDinheiro(delivery.driverValue);
              const busy = claimingId !== null;
              const stops = availableDeliveryStops(delivery);

              return (
                <Card key={delivery.id} style={styles.card}>
                  <View style={styles.cardHeader}>
                    <View>
                      <Text style={styles.orderNumber}>Pedido #{delivery.displayNumber}</Text>
                      <Text style={styles.createdAt}>
                        Entrou às {timeFormatter.format(new Date(delivery.createdAt))}
                      </Text>
                    </View>
                    <View style={styles.availablePill}>
                      <View style={styles.availableDot} />
                      <Text style={styles.availableText}>Livre</Text>
                    </View>
                  </View>

                  <View style={styles.companyRow}>
                    <View style={styles.companyIcon}>
                      <Icon name="store" size={20} color={colors.actionSoft} />
                    </View>
                    <View style={styles.companyText}>
                      <Text style={styles.companyName} numberOfLines={1}>
                        {delivery.companyName}
                      </Text>
                      <Text style={styles.serviceName}>{delivery.serviceTypeName}</Text>
                    </View>
                  </View>

                  <View style={styles.metaRow}>
                    <View style={styles.metaItem}>
                      <Icon name="pin" size={18} color={colors.inkMuted} />
                      <Text style={styles.metaLabel}>{destination}</Text>
                    </View>
                    <View style={styles.metaItem}>
                      <Icon name="money" size={18} color={colors.success} />
                      <Text style={styles.valueLabel}>{value}</Text>
                    </View>
                  </View>

                  {delivery.batchId || delivery.requiresReturn ? (
                    <View style={styles.tags}>
                      {delivery.batchId ? <Text style={styles.tag}>Pedido em lote</Text> : null}
                      {delivery.requiresReturn ? <Text style={styles.tag}>Com retorno</Text> : null}
                    </View>
                  ) : null}

                  <View style={styles.routeBlock}>
                    <RouteTimeline stops={stops} />
                  </View>

                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Assumir pedido ${delivery.displayNumber}`}
                    accessibilityState={{ disabled: busy }}
                    disabled={busy}
                    onPress={() => claim(delivery).catch(() => undefined)}
                    style={({ pressed }) => [
                      styles.claimButton,
                      busy && styles.claimButtonDisabled,
                      pressed && !busy && styles.claimButtonPressed,
                    ]}
                  >
                    <Text style={styles.claimButtonText}>
                      {claimingId === delivery.id ? 'Aceitando pedido...' : 'Aceitar pedido'}
                    </Text>
                  </Pressable>
                </Card>
              );
            })
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
  list: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 28, gap: 14 },
  intro: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 13,
    borderRadius: 13,
    backgroundColor: colors.actionSoftTint,
  },
  introText: { flex: 1, color: colors.inkSoft, fontSize: 13, lineHeight: 19 },
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
  card: { gap: 14 },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  orderNumber: { color: colors.ink, fontSize: 16, fontWeight: '800' },
  createdAt: { marginTop: 2, color: colors.inkMuted, fontSize: 12 },
  availablePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    backgroundColor: colors.successSoft,
  },
  availableDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.success },
  availableText: { color: colors.success, fontSize: 12, fontWeight: '800' },
  companyRow: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  companyIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.actionSoftTint,
  },
  companyText: { flex: 1, gap: 2 },
  companyName: { color: colors.ink, fontSize: 16, fontWeight: '700' },
  serviceName: { color: colors.inkMuted, fontSize: 13 },
  metaRow: { flexDirection: 'row', gap: 10 },
  metaItem: {
    flex: 1,
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 11,
    paddingVertical: 9,
    borderRadius: 11,
    backgroundColor: colors.surfaceMuted,
  },
  metaLabel: { flex: 1, color: colors.inkSoft, fontSize: 12, lineHeight: 17 },
  valueLabel: { flex: 1, color: colors.ink, fontSize: 13, fontWeight: '800' },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  tag: {
    overflow: 'hidden',
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 8,
    color: colors.actionSoft,
    backgroundColor: colors.actionSoftTint,
    fontSize: 11,
    fontWeight: '700',
  },
  routeBlock: {
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  claimButton: {
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: colors.action,
  },
  claimButtonDisabled: { opacity: 0.45 },
  claimButtonPressed: { opacity: 0.86 },
  claimButtonText: { color: colors.actionText, fontSize: 15, fontWeight: '800' },
});
