import { useEffect, useState } from 'react';
import {
  Alert,
  AppState,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  View,
  useColorScheme,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ApiError } from '@motoboycity/api-client';
import { DrawerMenu } from '../components/DrawerMenu';
import { EmptyState } from '../components/EmptyState';
import { colors } from '../theme/colors';
import { deliveryOffersApi, driverPresenceApi } from '../lib/apiClient';
import { getActiveDeliveries } from '../lib/activeDeliveries';
import { syncDeliveryTracking } from '../lib/deliveryTracking';
import { stopDeliveryTracking } from '../lib/deliveryTracking';
import {
  captureCurrentLocation,
  ensureBackgroundTrackingPermission,
  LocationError,
} from '../lib/location';
import { DRIVER_APP_VERSION } from '../lib/appVersion';
import { session } from '../lib/session';
import { API_BASE_URL } from '../lib/config';
import { salvarSessaoNativa } from '../lib/offerSession';
import { ativarPush } from '../lib/push';
import { connectDriverSocket, disconnectDriverSocket } from '../lib/socket';
import { useDispatchStore } from '../store/dispatchStore';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

function deliveryStatusLabel(status: string): string {
  switch (status) {
    case 'ACCEPTED':
      return 'A caminho da coleta';
    case 'COLLECTED':
      return 'Em entrega';
    case 'DELIVERED':
      return 'Retorno pendente';
    default:
      return status;
  }
}

export function HomeScreen({ navigation }: Props) {
  const isDark = useColorScheme() === 'dark';
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [presenceLoading, setPresenceLoading] = useState(true);
  const [presenceError, setPresenceError] = useState<string | null>(null);
  const [trackingError, setTrackingError] = useState<string | null>(null);

  const availability = useDispatchStore((state) => state.availability);
  const activeDeliveries = useDispatchStore((state) => state.activeDeliveries);
  const socketConnected = useDispatchStore((state) => state.socketConnected);
  const setPresence = useDispatchStore((state) => state.setPresence);
  const setIncomingOffer = useDispatchStore((state) => state.setIncomingOffer);
  const setActiveDeliveries = useDispatchStore((state) => state.setActiveDeliveries);

  const text = isDark ? colors.textDark : colors.text;
  const muted = isDark ? colors.mutedDark : colors.muted;
  const background = isDark ? colors.backgroundDark : colors.background;
  const surface = isDark ? colors.surfaceDark : colors.surface;
  const border = isDark ? colors.borderDark : colors.border;
  const isAvailable = availability === 'AVAILABLE';

  async function syncPresence(token: string) {
    try {
      const presence = await driverPresenceApi.get(token);
      setPresence(presence.availability, presence.since);
      setPresenceError(null);
      return presence;
    } catch {
      setPresenceError('Nao foi possivel confirmar sua disponibilidade. Verifique a conexao.');
      return null;
    } finally {
      setPresenceLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      const token = await session.getToken();
      if (!token || cancelled) {
        if (!cancelled) setPresenceLoading(false);
        return;
      }

      const presence = await syncPresence(token);
      if (cancelled) return;

      try {
        const deliveries = await getActiveDeliveries(token);
        if (!cancelled) {
          setActiveDeliveries(deliveries);
          try {
            await syncDeliveryTracking(
              token,
              deliveries.map((delivery) => delivery.id),
              presence?.availability === 'AVAILABLE',
            );
            if (!cancelled) setTrackingError(null);
          } catch (error) {
            if (!cancelled) {
              setTrackingError(
                error instanceof LocationError
                  ? error.message
                  : 'Não foi possível iniciar o rastreamento das entregas ativas.',
              );
            }
          }
          if (cancelled) return;
          const current = deliveries[0];
          if (current) navigation.navigate('DeliveryOperation', { deliveryId: current.id });
        }
      } catch {
        // A disponibilidade continua utilizavel; a proxima abertura recarrega as entregas ativas.
      }

      if (cancelled) return;

      /**
       * Push junto do socket, e nao no login: o token do FCM pode trocar entre
       * uma sessao e outra, e reregistrar a cada abertura e barato — o servidor
       * faz upsert.
       *
       * Sem `await` de proposito. Pedir permissao abre um dialogo do sistema, e
       * segurar a conexao do socket atras dele deixaria o motoboy sem fila ao
       * vivo enquanto decide.
       */
      ativarPush().catch(() => undefined);

      /**
       * Espelha a sessao para o lado nativo, onde vivem os botoes de aceitar e
       * recusar da notificacao. Sem isto eles apareceriam e nao fariam nada.
       */
      salvarSessaoNativa(API_BASE_URL, token).catch(() => undefined);

      connectDriverSocket(token, {
        onConnected: () => {
          syncPresence(token).catch(() => undefined);
        },
        onOffer: (offer) => {
          setIncomingOffer(offer);
          navigation.navigate('IncomingOffer');
        },
        onOfferExpired: (offerId) => {
          if (useDispatchStore.getState().incomingOffer?.offerId === offerId) {
            setIncomingOffer(null);
          }
        },
        onOfferCancelled: (offerId) => {
          if (useDispatchStore.getState().incomingOffer?.offerId === offerId) {
            setIncomingOffer(null);
          }
        },
        onDeliveryCancelled: (deliveryIds) => {
          const remainingDeliveries = useDispatchStore
            .getState()
            .activeDeliveries.filter((delivery) => !deliveryIds.includes(delivery.id));
          setActiveDeliveries(remainingDeliveries);
          syncDeliveryTracking(
            token,
            remainingDeliveries.map((delivery) => delivery.id),
            useDispatchStore.getState().availability === 'AVAILABLE',
          ).catch(() => undefined);
          Alert.alert('Pedido cancelado', 'Este pedido foi cancelado pela administracao.');
          navigation.popToTop();
        },
        onAccountStatusChanged: (accountStatus) => {
          if (accountStatus === 'ACTIVE') return;
          setIncomingOffer(null);
          setPresence('UNAVAILABLE', null);
          stopDeliveryTracking().catch(() => undefined);
          Alert.alert(
            'Conta indisponivel',
            'Sua conta foi suspensa ou bloqueada. Entre em contato com o suporte.',
          );
          navigation.popToTop();
        },
        /**
         * O servidor deixou de receber a posicao dele.
         *
         * Se esta mensagem chegou, o app esta VIVO — o problema e o
         * rastreamento, nao o aplicativo. Por isso o texto pede para conferir
         * permissao e GPS em vez de "reabra o app", que ja esta aberto.
         */
        onLocationLost: ({ activeDeliveryCount }) => {
          Alert.alert(
            'Não estamos recebendo sua localização',
            `Você está com ${activeDeliveryCount} pedido(s) em andamento e paramos de receber ` +
              'sua posição. Confira se a permissão de localização e o GPS estão ligados.',
          );
        },
      });

      /**
       * Recupera a oferta que chegou com o aplicativo FECHADO.
       *
       * O socket so entrega para quem esta conectado. Sem esta busca, o motoboy
       * tocava a notificacao, entrava, e encontrava a tela vazia enquanto o
       * prazo corria — que e exatamente o caso que o push existe para cobrir.
       */
      await mostrarOfertaPendente(token);
    }

    /**
     * O mesmo ao VOLTAR do segundo plano.
     *
     * Tocar a notificacao com o aplicativo suspenso nao remonta esta tela: o
     * `useEffect` acima nao roda de novo, e sem isto a oferta so apareceria na
     * proxima vez que o aplicativo fosse aberto do zero.
     */
    const assinatura = AppState.addEventListener('change', (estado) => {
      if (estado !== 'active') return;
      session
        .getToken()
        .then((atual) => (atual ? mostrarOfertaPendente(atual) : undefined))
        .catch(() => undefined);
    });

    async function mostrarOfertaPendente(token: string) {
      if (cancelled) return;
      // Ja ha uma oferta na tela: sobrescrever trocaria o cronometro por baixo
      // de quem esta decidindo.
      if (useDispatchStore.getState().incomingOffer) return;

      const pendente = await deliveryOffersApi.pending(token).catch(() => null);
      if (!pendente || cancelled) return;

      setIncomingOffer(pendente);
      navigation.navigate('IncomingOffer');
    }

    bootstrap().catch(() => {
      if (!cancelled) {
        setPresenceError('Nao foi possivel iniciar a sincronizacao do aplicativo.');
        setPresenceLoading(false);
      }
    });

    return () => {
      cancelled = true;
      assinatura.remove();
      disconnectDriverSocket();
    };
    // Esta tela e montada uma unica vez na sessao; callbacks do socket usam a store.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function refreshPresence() {
    const token = await session.getToken();
    if (!token) return;
    setPresenceLoading(true);
    await syncPresence(token);
  }

  async function handleToggleAvailability(value: boolean) {
    const token = await session.getToken();
    if (!token) return;

    setPresenceLoading(true);
    try {
      if (!value) {
        const result = await driverPresenceApi.set(token, { availability: 'UNAVAILABLE' });
        await stopDeliveryTracking();
        setPresence(result.availability, result.since);
        setPresenceError(null);
        return;
      }

      await ensureBackgroundTrackingPermission();
      const location = await captureCurrentLocation();
      const result = await driverPresenceApi.set(token, {
        availability: 'AVAILABLE',
        location,
        appVersion: DRIVER_APP_VERSION,
        trackingCapability: 'BACKGROUND_V1',
      });
      try {
        await syncDeliveryTracking(
          token,
          useDispatchStore.getState().activeDeliveries.map((delivery) => delivery.id),
          true,
        );
      } catch (trackingStartError) {
        await driverPresenceApi.set(token, { availability: 'UNAVAILABLE' }).catch(() => undefined);
        await stopDeliveryTracking();
        setPresence('UNAVAILABLE', null);
        throw trackingStartError;
      }
      setPresence(result.availability, result.since);
      setPresenceError(null);
    } catch (error) {
      await syncPresence(token);
      Alert.alert(
        'Disponibilidade nao atualizada',
        error instanceof ApiError
          ? error.message
          : 'Nao foi possivel atualizar sua disponibilidade. Tente novamente.',
      );
    } finally {
      setPresenceLoading(false);
    }
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: background }]} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => setDrawerVisible(true)} hitSlop={12}>
          <Text style={[styles.menuIcon, { color: text }]}>Menu</Text>
        </Pressable>
        <View style={styles.connection}>
          <View
            style={[
              styles.connectionDot,
              { backgroundColor: socketConnected ? colors.success : colors.warning },
            ]}
          />
          <Text style={[styles.connectionText, { color: muted }]}>
            {socketConnected ? 'Conectado' : 'Reconectando'}
          </Text>
        </View>
      </View>

      <View style={styles.content}>
        <View style={[styles.availabilityCard, { backgroundColor: surface, borderColor: border }]}>
          <View style={styles.availabilityText}>
            <Text style={[styles.availabilityTitle, { color: text }]}>
              {isAvailable ? 'Voce esta online' : 'Voce esta offline'}
            </Text>
            <Text style={[styles.availabilityDescription, { color: muted }]}>
              {isAvailable
                ? 'Disponivel para receber novas ofertas.'
                : 'Voce nao recebera novas ofertas ate ficar online.'}
            </Text>
          </View>
          <Switch
            value={isAvailable}
            onValueChange={handleToggleAvailability}
            disabled={presenceLoading}
          />
        </View>

        {presenceError && (
          <Pressable
            style={[styles.errorCard, { borderColor: colors.danger }]}
            onPress={refreshPresence}
          >
            <Text style={styles.errorText}>{presenceError}</Text>
            <Text style={styles.retryText}>Tocar para tentar novamente</Text>
          </Pressable>
        )}

        {trackingError && (
          <Pressable
            style={[styles.errorCard, { borderColor: colors.warning }]}
            onPress={() => {
              session.getToken().then((token) => {
                if (!token) return;
                syncDeliveryTracking(
                  token,
                  useDispatchStore.getState().activeDeliveries.map((delivery) => delivery.id),
                  useDispatchStore.getState().availability === 'AVAILABLE',
                )
                  .then(() => setTrackingError(null))
                  .catch((error: unknown) =>
                    setTrackingError(
                      error instanceof LocationError
                        ? error.message
                        : 'Não foi possível ativar o rastreamento agora.',
                    ),
                  );
              });
            }}
          >
            <Text style={[styles.errorText, { color: colors.warning }]}>{trackingError}</Text>
            <Text style={styles.retryText}>Tocar para ativar o rastreamento</Text>
          </Pressable>
        )}

        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: text }]}>Entregas em andamento</Text>
          {presenceLoading && (
            <Text style={[styles.loadingText, { color: muted }]}>Sincronizando...</Text>
          )}
        </View>

        {activeDeliveries.length > 0 ? (
          activeDeliveries.map((delivery) => (
            <Pressable
              key={delivery.id}
              style={[styles.deliveryCard, { backgroundColor: surface, borderColor: border }]}
              onPress={() => navigation.navigate('DeliveryOperation', { deliveryId: delivery.id })}
            >
              <Text style={[styles.deliveryNumber, { color: text }]}>
                Pedido #{delivery.displayNumber}
              </Text>
              <Text style={[styles.deliveryStatus, { color: colors.primary }]}>
                {deliveryStatusLabel(delivery.status)}
              </Text>
              <Text style={[styles.deliveryCompany, { color: muted }]}>{delivery.companyName}</Text>
            </Pressable>
          ))
        ) : (
          <EmptyState
            message={
              isAvailable
                ? 'Aguardando uma nova oferta'
                : 'Fique online quando estiver pronto para receber ofertas'
            }
          />
        )}
      </View>

      <DrawerMenu
        visible={drawerVisible}
        onClose={() => setDrawerVisible(false)}
        navigation={navigation}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  menuIcon: { fontSize: 15, fontWeight: '700' },
  connection: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  connectionDot: { width: 8, height: 8, borderRadius: 4 },
  connectionText: { fontSize: 12, fontWeight: '600' },
  content: { flex: 1, paddingHorizontal: 16, gap: 12 },
  availabilityCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    padding: 16,
    gap: 12,
  },
  availabilityText: { flex: 1, gap: 4 },
  availabilityTitle: { fontSize: 18, fontWeight: '700' },
  availabilityDescription: { fontSize: 13, lineHeight: 18 },
  errorCard: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, padding: 12, gap: 4 },
  errorText: { color: colors.danger, fontSize: 13, fontWeight: '600' },
  retryText: { color: colors.primary, fontSize: 12, fontWeight: '700' },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitle: { fontSize: 15, fontWeight: '700' },
  loadingText: { fontSize: 12 },
  deliveryCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    padding: 14,
    gap: 3,
  },
  deliveryNumber: { fontSize: 15, fontWeight: '700' },
  deliveryStatus: { fontSize: 13, fontWeight: '700' },
  deliveryCompany: { fontSize: 12 },
});
