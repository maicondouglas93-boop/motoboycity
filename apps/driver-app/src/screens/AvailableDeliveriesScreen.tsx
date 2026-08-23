import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ApiError } from '@motoboycity/api-client';
import type { AvailableDeliveryItem } from '@motoboycity/types';
import { Card } from '../components/Card';
import { EmptyState } from '../components/EmptyState';
import { ScreenHeader } from '../components/ScreenHeader';
import { deliveryOffersApi } from '../lib/apiClient';
import { session } from '../lib/session';
import type { RootStackParamList } from '../navigation/types';
import { colors } from '../theme/colors';

type Props = NativeStackScreenProps<RootStackParamList, 'AvailableDeliveries'>;

const currencyFormatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const timeFormatter = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  hour: '2-digit',
  minute: '2-digit',
});

/**
 * Pedidos que ninguém aceitou.
 *
 * O despacho empurra a oferta para um motoboy por vez, com prazo. Esgotada a
 * fila de elegíveis, o pedido para de se mexer — e como quem já recebeu fica
 * excluído da próxima rodada, quem deixou a oferta expirar nunca mais o vê.
 *
 * Esta tela é onde ele reaparece, para qualquer um. Deixar uma oferta passar às
 * 11h não é recusar aquele pedido para sempre.
 */
export function AvailableDeliveriesScreen({ navigation }: Props) {
  const isDark = useColorScheme() === 'dark';
  const palette = {
    background: isDark ? colors.backgroundDark : colors.background,
    text: isDark ? colors.textDark : colors.text,
    muted: isDark ? colors.mutedDark : colors.muted,
    accent: isDark ? colors.primaryDark : colors.primary,
    danger: colors.danger,
  };

  const [deliveries, setDeliveries] = useState<AvailableDeliveryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const token = await session.getToken();
    if (!token) return;
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
    const token = await session.getToken();
    if (!token) return;

    setClaimingId(delivery.id);
    try {
      await deliveryOffersApi.claim(token, delivery.id);
      navigation.navigate('DeliveryOperation', { deliveryId: delivery.id });
    } catch (claimError) {
      /**
       * O conflito aqui é esperado e não é falha: outro motoboy pegou entre a
       * listagem e o toque. A lista é recarregada para o pedido sumir, em vez
       * de continuar oferecendo o que já foi.
       */
      Alert.alert(
        'Pedido indisponível',
        claimError instanceof ApiError
          ? claimError.message
          : 'Não foi possível assumir este pedido.',
      );
      load().catch(() => undefined);
    } finally {
      setClaimingId(null);
    }
  }

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: palette.background }]} edges={['top']}>
      <ScreenHeader title="Pedidos disponíveis" onBack={() => navigation.goBack()} />

      {loading ? (
        <ActivityIndicator style={styles.loader} color={palette.accent} />
      ) : (
        <ScrollView
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                load().catch(() => undefined);
              }}
              tintColor={palette.accent}
            />
          }
        >
          {error && <Text style={[styles.error, { color: palette.danger }]}>{error}</Text>}

          {deliveries.length === 0 && !error ? (
            <EmptyState message="Nenhum pedido disponível agora. Quando um pedido ficar sem entregador, ele aparece aqui para você assumir." />
          ) : (
            deliveries.map((delivery) => (
              <Card key={delivery.id} style={styles.card}>
                <View style={styles.rowBetween}>
                  <Text style={[styles.number, { color: palette.text }]}>
                    #{delivery.displayNumber}
                  </Text>
                  <Text style={[styles.time, { color: palette.muted }]}>
                    {timeFormatter.format(new Date(delivery.createdAt))}
                  </Text>
                </View>

                <Text style={[styles.company, { color: palette.text }]}>
                  {delivery.companyName}
                </Text>
                <Text style={[styles.meta, { color: palette.muted }]}>
                  {delivery.serviceTypeName}
                  {delivery.batchId ? ' · faz parte de um lote' : ''}
                  {delivery.requiresReturn ? ' · exige retorno' : ''}
                </Text>

                {/*
                  Sem destino conhecido, distancia e valor so existem depois da
                  entrega — mostrar zero seria mentir sobre quanto rende.
                */}
                <Text style={[styles.meta, { color: palette.muted }]}>
                  {delivery.destinationKnownAtCreation
                    ? `${delivery.distanceKm?.toLocaleString('pt-BR') ?? '—'} km`
                    : 'Destino definido na entrega'}
                  {' · '}
                  {delivery.driverValue === null
                    ? 'valor calculado na entrega'
                    : currencyFormatter.format(delivery.driverValue)}
                </Text>

                <Pressable
                  onPress={() => claim(delivery).catch(() => undefined)}
                  disabled={claimingId !== null}
                  style={[
                    styles.button,
                    { backgroundColor: palette.accent },
                    claimingId !== null && styles.buttonBusy,
                  ]}
                >
                  <Text
                    style={[styles.buttonText, { color: isDark ? colors.text : colors.textDark }]}
                  >
                    {claimingId === delivery.id ? 'Assumindo...' : 'Assumir pedido'}
                  </Text>
                </Pressable>
              </Card>
            ))
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  loader: { marginTop: 32 },
  list: { padding: 16, gap: 12 },
  card: { gap: 6 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  number: { fontSize: 16, fontWeight: '700' },
  time: { fontSize: 13 },
  company: { fontSize: 15, fontWeight: '600' },
  meta: { fontSize: 13 },
  error: { fontSize: 14, marginBottom: 8 },
  button: {
    marginTop: 8,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  buttonBusy: { opacity: 0.6 },
  buttonText: { fontSize: 15, fontWeight: '700' },
});
