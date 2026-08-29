import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  AppState,
  BackHandler,
  Linking,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ApiError } from '@motoboycity/api-client';
import type {
  AvailableDeliveryItem,
  DriverDispatchQueueResult,
  DriverPresenceItem,
} from '@motoboycity/types';
import { ActiveToggle } from '../components/ActiveToggle';
import { BottomSheet } from '../components/BottomSheet';
import { DeliveryCard } from '../components/DeliveryCard';
import { DriverQueueSheet } from '../components/DriverQueueSheet';
import { DrawerMenu } from '../components/DrawerMenu';
import { EmptyIconCircle, Icon } from '../components/Icon';
import { MapBackdrop } from '../components/MapBackdrop';
import { PendingDeliveryCard } from '../components/PendingDeliveryCard';
import type { RouteStop } from '../components/RouteTimeline';
import { SegmentedTabs } from '../components/SegmentedTabs';
import { colors } from '../theme/colors';
import { deliveryOffersApi, driverPresenceApi } from '../lib/apiClient';
import { formatarDinheiro, formatarDistancia, formatarHora } from '../lib/format';
import { findNewlyAcceptedDelivery, getActiveDeliveries } from '../lib/activeDeliveries';
import { activeDeliveryStops, pickupCountdownLabel } from '../lib/activeDeliveryPresentation';
import { reconcileAcceptedAssignment } from '../lib/acceptanceReconciliation';
import { clearExpiredDriverSession } from '../lib/clearExpiredDriverSession';
import {
  completionNeedsFreshReturnLocation,
  getPendingDeliveryCompletions,
  retryDeliveryCompletionQueue,
  subscribeDeliveryCompletionOutbox,
  synchronizePendingDeliveryCompletions,
  type PendingDeliveryCompletion,
} from '../lib/deliveryCompletionOutbox';
import { deliveryPaymentLabel, formatDeliveryAddress } from '../lib/deliveryOperation';
import { stopDeliveryTracking, syncDeliveryTracking } from '../lib/deliveryTracking';
import { getDriverProfile } from '../lib/driverProfileCache';
import {
  captureCompletionLocation,
  capturePresenceLocation,
  ensureBackgroundTrackingPermission,
  LocationError,
} from '../lib/location';
import { DRIVER_APP_VERSION } from '../lib/appVersion';
import { isTransientPresenceError, restoreDesiredPresence } from '../lib/presencePersistence';
import { session } from '../lib/session';
import { API_BASE_URL } from '../lib/config';
import {
  abrirAjusteDeSobreposicao,
  abrirAjusteDeTelaCheia,
  consultarApresentacaoNativa,
  dispensarOfertaNativa,
  salvarSessaoNativa,
} from '../lib/offerSession';
import { ativarPush } from '../lib/push';
import { connectDriverSocket, disconnectDriverSocket } from '../lib/socket';
import { useDispatchStore } from '../store/dispatchStore';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

type Aba = 'andamento' | 'pendentes';

const ABAS = [
  { value: 'andamento' as const, label: 'Em Andamento' },
  { value: 'pendentes' as const, label: 'Pendentes' },
];

type NotificationReadiness =
  'ready' | 'unavailable' | 'disabled' | 'overlay-disabled' | 'full-screen-disabled';

function notificacaoBloqueiaPresenca(status: NotificationReadiness): boolean {
  // A permissao do Android e indispensavel para exibir ofertas. Falhas
  // temporarias de registro no FCM e recursos extras de apresentacao nao
  // podem impedir o motoboy de ficar online; o socket continua como fallback.
  return status === 'disabled';
}

async function verificarNotificacaoObrigatoria(): Promise<NotificationReadiness> {
  const pushAtivo = await ativarPush().catch(() => false);
  if (!pushAtivo) return 'unavailable';
  if (Platform.OS !== 'android') return 'ready';

  const apresentacao = await consultarApresentacaoNativa();
  if (!apresentacao?.notificationsEnabled) return 'disabled';
  if (apresentacao.overlayNeedsManualGrant && !apresentacao.overlayGranted) {
    return 'overlay-disabled';
  }
  if (apresentacao.fullScreenNeedsManualGrant && !apresentacao.fullScreenGranted) {
    return 'full-screen-disabled';
  }
  return 'ready';
}

function mensagemNotificacaoObrigatoria(status: NotificationReadiness): string {
  if (status === 'overlay-disabled') {
    return 'Autorize Exibir sobre outros apps para o cartão completo aparecer com o aplicativo minimizado.';
  }
  if (status === 'full-screen-disabled') {
    return 'Autorize a tela cheia para as ofertas aparecerem mesmo com o celular bloqueado.';
  }
  if (status === 'disabled') {
    return 'Ative as notificacoes e mantenha o canal Ofertas de entrega em prioridade alta.';
  }
  return 'Nao foi possivel ativar e registrar as notificacoes deste aparelho.';
}

function alertarNotificacaoObrigatoria(status: NotificationReadiness) {
  const abrirAjustes = () => {
    if (status === 'overlay-disabled') {
      abrirAjusteDeSobreposicao().catch(() => undefined);
      return;
    }
    if (status === 'full-screen-disabled') {
      abrirAjusteDeTelaCheia().catch(() => undefined);
      return;
    }
    Linking.openSettings().catch(() => undefined);
  };

  Alert.alert(
    'Notificacoes obrigatorias',
    `${mensagemNotificacaoObrigatoria(status)} Voce so pode ficar online depois de liberar esse acesso.`,
    [
      { text: 'Agora nao', style: 'cancel' },
      { text: 'Abrir ajustes', onPress: abrirAjustes },
    ],
  );
}

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

export function HomeScreen({ navigation }: Props) {
  const isFocused = useIsFocused();
  const acceptingPendingRef = useRef(false);
  const presenceRecoveryRef = useRef<Promise<DriverPresenceItem | null> | null>(null);
  const pendingListVersionRef = useRef(0);
  const queueRequestVersionRef = useRef(0);
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [queueVisible, setQueueVisible] = useState(false);
  const [driverQueue, setDriverQueue] = useState<DriverDispatchQueueResult | null>(null);
  const [queueLoading, setQueueLoading] = useState(false);
  const [queueError, setQueueError] = useState<string | null>(null);
  const [presenceLoading, setPresenceLoading] = useState(true);
  const [presenceError, setPresenceError] = useState<string | null>(null);
  const [trackingError, setTrackingError] = useState<string | null>(null);
  const [aba, setAba] = useState<Aba>('andamento');
  const [pendentes, setPendentes] = useState<AvailableDeliveryItem[]>([]);
  const [carregandoPendentes, setCarregandoPendentes] = useState(false);
  /**
   * Quanto da tela a folha esta cobrindo. Vem da propria folha ao arrastar, e
   * serve para o mapa reposicionar o ponto azul na parte que sobrou a vista.
   */
  const [fracaoDaFolha, setFracaoDaFolha] = useState(0.52);
  const [pendentesError, setPendentesError] = useState<string | null>(null);
  const [aceitandoPendenteId, setAceitandoPendenteId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [completionQueue, setCompletionQueue] = useState<PendingDeliveryCompletion[]>([]);
  const [completionSyncing, setCompletionSyncing] = useState(false);
  const completionRetryInFlight = useRef(false);
  const [pickupCountdownNow, setPickupCountdownNow] = useState(() => Date.now());

  const availability = useDispatchStore((state) => state.availability);
  const wantsToBeAvailable = useDispatchStore((state) => state.wantsToBeAvailable);
  const activeDeliveries = useDispatchStore((state) => state.activeDeliveries);
  const socketConnected = useDispatchStore((state) => state.socketConnected);
  const setPresence = useDispatchStore((state) => state.setPresence);
  const punishment = useDispatchStore((state) => state.punishment);
  const setPunishment = useDispatchStore((state) => state.setPunishment);
  const setWantsToBeAvailable = useDispatchStore((state) => state.setWantsToBeAvailable);
  const setIncomingOffer = useDispatchStore((state) => state.setIncomingOffer);
  const setActiveDeliveries = useDispatchStore((state) => state.setActiveDeliveries);

  const isAvailable = availability === 'AVAILABLE';
  const queuedCompletionForBanner =
    completionQueue.find((item) => item.state === 'NEEDS_REVIEW') ??
    completionQueue.find((item) => item.lastError) ??
    completionQueue[0] ??
    null;

  useEffect(() => {
    const hasPickupCountdown = activeDeliveries.some(
      (delivery) => delivery.status === 'ACCEPTED' && Boolean(delivery.pickupDeadlineAt),
    );
    if (!hasPickupCountdown) return undefined;

    setPickupCountdownNow(Date.now());
    const timer = setInterval(() => setPickupCountdownNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, [activeDeliveries]);

  const resolveOwnerUserId = useCallback(async (token: string): Promise<string | null> => {
    const persisted = await session.getUserId();
    if (persisted) return persisted;
    const profile = await getDriverProfile(token).catch(() => null);
    if (!profile) return null;
    await session.setUserId(profile.id);
    return profile.id;
  }, []);

  const refreshCompletionQueue = useCallback(async () => {
    const ownerUserId = await session.getUserId();
    setCompletionQueue(ownerUserId ? await getPendingDeliveryCompletions(ownerUserId) : []);
  }, []);

  const clearDriverQueue = useCallback(() => {
    queueRequestVersionRef.current += 1;
    setDriverQueue(null);
    setQueueError(null);
    setQueueLoading(false);
    setQueueVisible(false);
  }, []);

  const loadDriverQueue = useCallback(async (knownToken?: string, silent = false) => {
    const requestVersion = queueRequestVersionRef.current + 1;
    queueRequestVersionRef.current = requestVersion;
    const token = knownToken ?? (await session.getToken());
    if (!token) return;

    if (!silent) setQueueLoading(true);
    try {
      const result = await driverPresenceApi.queue(token);
      if (requestVersion !== queueRequestVersionRef.current) return;
      setDriverQueue(result);
      setQueueError(null);
    } catch (error) {
      if (requestVersion !== queueRequestVersionRef.current) return;
      setQueueError(
        error instanceof ApiError
          ? error.message
          : 'Não foi possível carregar a fila de entregadores.',
      );
    } finally {
      if (!silent && requestVersion === queueRequestVersionRef.current) {
        setQueueLoading(false);
      }
    }
  }, []);

  const syncCompletionQueue = useCallback(
    async (token: string, retryItem?: { id: string; needsFreshReturnLocation: boolean }) => {
      const ownerUserId = await resolveOwnerUserId(token);
      if (!ownerUserId) return null;
      setCompletionSyncing(true);
      try {
        if (retryItem) {
          // So recaptura no toque manual. Fazer isso automaticamente ao abrir o
          // app mudaria a prova de local sem uma acao consciente do motoboy.
          const freshFix = retryItem.needsFreshReturnLocation
            ? await captureCompletionLocation()
            : null;
          await retryDeliveryCompletionQueue(
            ownerUserId,
            retryItem.id,
            freshFix
              ? { lat: freshFix.lat, lng: freshFix.lng, accuracy: freshFix.accuracy }
              : undefined,
          );
        }
        const result = await synchronizePendingDeliveryCompletions(token, ownerUserId);
        setCompletionQueue(await getPendingDeliveryCompletions(ownerUserId));
        if (result.authRequired && (await session.getToken()) === token) {
          await clearExpiredDriverSession();
          setCompletionQueue([]);
          Alert.alert(
            'Sessao expirada',
            'A finalizacao continua salva neste aparelho. Entre novamente para sincronizar.',
          );
          navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
        }
        return result;
      } finally {
        setCompletionSyncing(false);
      }
    },
    [navigation, resolveOwnerUserId],
  );

  useEffect(() => {
    refreshCompletionQueue().catch(() => undefined);
    return subscribeDeliveryCompletionOutbox(() => {
      refreshCompletionQueue().catch(() => undefined);
    });
  }, [refreshCompletionQueue]);

  useFocusEffect(
    useCallback(() => {
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        if (queueVisible) {
          setQueueVisible(false);
          return true;
        }

        if (drawerVisible) {
          setDrawerVisible(false);
          return true;
        }

        // Com uma corrida em andamento, a Home e o limite seguro da pilha:
        // o botao fisico nao pode encerrar o aplicativo e interromper o fluxo.
        return activeDeliveries.length > 0;
      });

      return () => subscription.remove();
    }, [activeDeliveries.length, drawerVisible, queueVisible]),
  );

  async function syncPresence(token: string) {
    try {
      const presence = await driverPresenceApi.get(token);
      setPresence(presence.availability, presence.since);
      // Ele fica sabendo do castigo ao abrir o aplicativo, e nao so depois de
      // ficar ativo e estranhar o silencio.
      setPunishment(presence.punishment);
      setPresenceError(null);
      return presence;
    } catch {
      setPresenceError('Nao foi possivel confirmar sua disponibilidade. Verifique a conexao.');
      return null;
    } finally {
      setPresenceLoading(false);
    }
  }

  async function recoverDesiredOnlinePresence(
    token: string,
    knownPresence?: DriverPresenceItem | null,
  ): Promise<DriverPresenceItem | null> {
    if (presenceRecoveryRef.current) return presenceRecoveryRef.current;

    const recovery = (async () => {
      const desiredAvailability = await session.getDesiredAvailability();
      const shouldStayOnline = desiredAvailability === true;
      setWantsToBeAvailable(shouldStayOnline);
      let currentPresence = knownPresence;
      if (!shouldStayOnline) {
        await stopDeliveryTracking().catch(() => undefined);
        if (currentPresence === undefined) {
          currentPresence = await driverPresenceApi.get(token).catch(() => null);
        }
        if (currentPresence?.availability === 'AVAILABLE') {
          await driverPresenceApi
            .set(token, { availability: 'UNAVAILABLE' })
            .catch(() => undefined);
        }
        // A punicao nao termina por ele ficar offline: o prazo continua correndo,
        // entao o estado local preserva o que a ultima leitura trouxe.
        const unavailable = {
          availability: 'UNAVAILABLE' as const,
          since: null,
          punishment: currentPresence?.punishment ?? null,
        };
        setPresence(unavailable.availability, unavailable.since);
        setPunishment(unavailable.punishment);
        return unavailable;
      }

      if (currentPresence === undefined) {
        currentPresence = await driverPresenceApi.get(token).catch(() => null);
        if (currentPresence) {
          setPresence(currentPresence.availability, currentPresence.since);
        }
      }

      try {
        const restored = await restoreDesiredPresence(currentPresence ?? null, {
          captureLocation: capturePresenceLocation,
          startTracking: () =>
            syncDeliveryTracking(
              token,
              useDispatchStore.getState().activeDeliveries.map((delivery) => delivery.id),
              true,
            ),
          stopTracking: stopDeliveryTracking,
          activate: (location) =>
            driverPresenceApi.set(token, {
              availability: 'AVAILABLE',
              location,
              appVersion: DRIVER_APP_VERSION,
              trackingCapability: 'BACKGROUND_V1',
            }),
        });
        setPresence(restored.availability, restored.since);
        setWantsToBeAvailable(true);
        setPresenceError(null);
        setTrackingError(null);
        return restored;
      } catch (error) {
        const retryAutomatically =
          !(error instanceof LocationError) && isTransientPresenceError(error);
        if (retryAutomatically) {
          setPresenceError(
            'Sinal instavel. O aplicativo continuara tentando manter voce online automaticamente.',
          );
          return currentPresence ?? null;
        }

        await session.setDesiredAvailability(false);
        setWantsToBeAvailable(false);
        setPresence('UNAVAILABLE', null);
        clearDriverQueue();
        setPresenceError(
          error instanceof ApiError || error instanceof LocationError
            ? error.message
            : 'Nao foi possivel restaurar sua disponibilidade automaticamente.',
        );
        return null;
      }
    })();

    presenceRecoveryRef.current = recovery;
    try {
      return await recovery;
    } finally {
      if (presenceRecoveryRef.current === recovery) presenceRecoveryRef.current = null;
    }
  }

  async function retirarDaFilaSemNotificacao(
    token: string,
    readiness: NotificationReadiness,
    mostrarAlerta: boolean,
  ) {
    if (
      !notificacaoBloqueiaPresenca(readiness) ||
      (useDispatchStore.getState().availability !== 'AVAILABLE' &&
        !useDispatchStore.getState().wantsToBeAvailable)
    ) {
      return;
    }

    await driverPresenceApi.set(token, { availability: 'UNAVAILABLE' }).catch(() => undefined);
    await stopDeliveryTracking().catch(() => undefined);
    await session.setDesiredAvailability(false);
    setWantsToBeAvailable(false);
    setPresence('UNAVAILABLE', null);
    clearDriverQueue();
    setPresenceError(mensagemNotificacaoObrigatoria(readiness));
    if (mostrarAlerta) alertarNotificacaoObrigatoria(readiness);
  }

  const carregarPendentes = useCallback(async (silencioso = false) => {
    if (acceptingPendingRef.current) return;

    const listVersion = pendingListVersionRef.current;
    const token = await session.getToken();
    if (!token) return;
    if (!silencioso) setCarregandoPendentes(true);
    try {
      const availableDeliveries = await deliveryOffersApi.listAvailable(token);
      if (listVersion === pendingListVersionRef.current && !acceptingPendingRef.current) {
        setPendentes(availableDeliveries);
        setPendentesError(null);
      }
    } catch (error) {
      if (listVersion === pendingListVersionRef.current && !acceptingPendingRef.current) {
        setPendentesError(
          error instanceof ApiError
            ? error.message
            : 'Não foi possível carregar os pedidos disponíveis.',
        );
      }
    } finally {
      if (!silencioso) setCarregandoPendentes(false);
    }
  }, []);

  useEffect(() => {
    if (aba !== 'pendentes' || !isFocused) return undefined;
    carregarPendentes().catch(() => undefined);
    const timer = setInterval(() => {
      if (AppState.currentState === 'active') {
        carregarPendentes(true).catch(() => undefined);
      }
    }, 10_000);

    return () => clearInterval(timer);
  }, [aba, carregarPendentes, isFocused]);

  async function aceitarPendente(delivery: AvailableDeliveryItem) {
    if (acceptingPendingRef.current) return;
    acceptingPendingRef.current = true;
    pendingListVersionRef.current += 1;
    setAceitandoPendenteId(delivery.id);
    let token: string | null = null;
    try {
      token = await session.getToken();
      if (!token) {
        Alert.alert('Sessão expirada', 'Entre novamente para aceitar este pedido.');
        return;
      }

      const result = await deliveryOffersApi.claim(token, delivery.id);

      // Ao assumir uma corrida, a vitrine inteira deixa de ser elegível para
      // este motoboy. Limpar todos evita oferecer visualmente um segundo pedido.
      setPendentes([]);

      const deliveries = await getActiveDeliveries(token).catch(() => null);
      if (deliveries) setActiveDeliveries(deliveries);
      const trackingIds = deliveries?.map((item) => item.id) ?? [result.deliveryId];
      syncDeliveryTracking(token, trackingIds)
        .then(() => setTrackingError(null))
        .catch((error: unknown) =>
          setTrackingError(
            error instanceof LocationError
              ? error.message
              : 'Não foi possível ativar o rastreamento da entrega aceita.',
          ),
        );

      setAba('andamento');
      navigation.navigate('DeliveryOperation', { deliveryId: result.deliveryId });
    } catch (error) {
      const reconciled = token
        ? await reconcileAcceptedAssignment(token, [delivery.id]).catch(() => null)
        : null;
      if (reconciled && token) {
        setPendentes([]);
        setActiveDeliveries(reconciled.activeDeliveries);
        await syncDeliveryTracking(
          token,
          reconciled.activeDeliveries.map((item) => item.id),
        ).catch(() => undefined);
        setAba('andamento');
        navigation.navigate('DeliveryOperation', { deliveryId: reconciled.delivery.id });
        return;
      }
      Alert.alert(
        'Pedido indisponível',
        error instanceof ApiError
          ? error.message
          : 'Não foi possível aceitar este pedido. Tente novamente.',
      );
      await carregarPendentes(true);
    } finally {
      acceptingPendingRef.current = false;
      setAceitandoPendenteId(null);
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

      /**
       * A sessao nativa precisa existir antes de qualquer oferta: sao os
       * botoes Android que respondem quando o React Native esta suspenso.
       */
      await salvarSessaoNativa(API_BASE_URL, token);
      const notificationReadiness = await verificarNotificacaoObrigatoria();
      // Uma finalizacao salva antes de o app fechar precisa ser enviada antes
      // de reconstruir a lista operacional vinda do servidor.
      const completionSync = await syncCompletionQueue(token).catch(() => null);
      if (completionSync?.authRequired) return;

      let presence = await syncPresence(token);
      if (cancelled) return;

      let desiredAvailability = await session.getDesiredAvailability();
      if (desiredAvailability === null && presence) {
        desiredAvailability = presence.availability === 'AVAILABLE';
        await session.setDesiredAvailability(desiredAvailability);
      }
      setWantsToBeAvailable(desiredAvailability === true);

      if (
        (presence?.availability === 'AVAILABLE' || desiredAvailability === true) &&
        notificacaoBloqueiaPresenca(notificationReadiness)
      ) {
        presence = await driverPresenceApi
          .set(token, { availability: 'UNAVAILABLE' })
          .catch(() => null);
        await stopDeliveryTracking().catch(() => undefined);
        await session.setDesiredAvailability(false);
        setWantsToBeAvailable(false);
        setPresence('UNAVAILABLE', null);
        setPresenceError(mensagemNotificacaoObrigatoria(notificationReadiness));
        alertarNotificacaoObrigatoria(notificationReadiness);
      } else {
        presence = await recoverDesiredOnlinePresence(token, presence);
      }

      try {
        const deliveries = await getActiveDeliveries(token);
        if (!cancelled) {
          setActiveDeliveries(deliveries);
          try {
            await syncDeliveryTracking(
              token,
              deliveries.map((delivery) => delivery.id),
              useDispatchStore.getState().wantsToBeAvailable &&
                !notificacaoBloqueiaPresenca(notificationReadiness),
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
        }
      } catch {
        // A disponibilidade continua utilizavel; a proxima abertura recarrega as entregas ativas.
      }

      if (presence?.availability === 'AVAILABLE') {
        await loadDriverQueue(token, true);
      } else {
        clearDriverQueue();
      }

      if (cancelled) return;

      connectDriverSocket(token, {
        onConnected: () => {
          verificarNotificacaoObrigatoria()
            .then(async (readiness) => {
              const reconnectCompletionSync = await syncCompletionQueue(token).catch(() => null);
              if (reconnectCompletionSync?.authRequired) return;
              let reconnectedPresence = await syncPresence(token);
              await retirarDaFilaSemNotificacao(token, readiness, false);
              if (!notificacaoBloqueiaPresenca(readiness)) {
                reconnectedPresence = await recoverDesiredOnlinePresence(
                  token,
                  reconnectedPresence,
                );
              }
              if (
                reconnectedPresence?.availability === 'AVAILABLE' &&
                useDispatchStore.getState().availability === 'AVAILABLE'
              ) {
                await loadDriverQueue(token, true);
              } else {
                clearDriverQueue();
              }
              const deliveries = await getActiveDeliveries(token).catch(() => null);
              if (deliveries && !cancelled) {
                setActiveDeliveries(deliveries);
                await syncDeliveryTracking(
                  token,
                  deliveries.map((delivery) => delivery.id),
                  useDispatchStore.getState().wantsToBeAvailable,
                ).catch(() => undefined);
              }
            })
            .catch(() => undefined);
        },
        onOffer: (offer) => {
          /**
           * Em segundo plano, o FCM abre o cartão Android nativo. Navegar a
           * pilha React ao mesmo tempo deixaria outra oferta escondida por
           * baixo e permitiria uma segunda resposta ao desbloquear.
           */
          if (AppState.currentState !== 'active') return;
          setIncomingOffer(offer);
          navigation.navigate('IncomingOffer');
        },
        onOfferExpired: (offerId) => {
          if (useDispatchStore.getState().incomingOffer?.offerId === offerId) {
            dispensarOfertaNativa(offerId).catch(() => undefined);
            setIncomingOffer(null);
          }
        },
        onOfferCancelled: (offerId) => {
          if (useDispatchStore.getState().incomingOffer?.offerId === offerId) {
            dispensarOfertaNativa(offerId).catch(() => undefined);
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
            useDispatchStore.getState().wantsToBeAvailable,
          ).catch(() => undefined);
          Alert.alert('Pedido cancelado', 'Este pedido foi cancelado pela administracao.');
          navigation.popToTop();
        },
        onPickupExpired: (deliveryIds) => {
          const remainingDeliveries = useDispatchStore
            .getState()
            .activeDeliveries.filter((delivery) => !deliveryIds.includes(delivery.id));
          setActiveDeliveries(remainingDeliveries);
          syncDeliveryTracking(
            token,
            remainingDeliveries.map((delivery) => delivery.id),
            useDispatchStore.getState().wantsToBeAvailable,
          ).catch(() => undefined);
          Alert.alert(
            'Prazo de coleta encerrado',
            'O pedido voltou para a fila e sera enviado a outro motoboy.',
          );
          navigation.popToTop();
        },
        onAccountStatusChanged: (accountStatus) => {
          if (accountStatus === 'ACTIVE') return;
          const offerId = useDispatchStore.getState().incomingOffer?.offerId;
          if (offerId) dispensarOfertaNativa(offerId).catch(() => undefined);
          setIncomingOffer(null);
          session.setDesiredAvailability(false).catch(() => undefined);
          setWantsToBeAvailable(false);
          setPresence('UNAVAILABLE', null);
          clearDriverQueue();
          stopDeliveryTracking().catch(() => undefined);
          Alert.alert(
            'Conta indisponivel',
            'Sua conta foi suspensa ou bloqueada. Entre em contato com o suporte.',
          );
          navigation.popToTop();
        },
        onPunishmentApplied: (aplicada) => {
          setPunishment(aplicada);
          Alert.alert(
            'Voce esta fora do despacho',
            `Voce ${aplicada.reason === 'DECLINED_OFFER' ? 'recusou' : 'deixou passar'} ` +
              `${aplicada.offerCount} ofertas seguidas. Nenhum pedido novo chega ate ` +
              `${formatarHora(aplicada.expiresAt)}. Os pedidos que voce ja aceitou seguem normalmente.`,
          );
        },
        onPunishmentLifted: () => {
          setPunishment(null);
          Alert.alert('Voce voltou ao despacho', 'A administracao liberou voce antes do prazo.');
        },
        onPresenceExpired: () => {
          setPresence('UNAVAILABLE', null);
          clearDriverQueue();
          setPresenceError(
            'O sinal foi interrompido. Estamos tentando colocar voce online novamente.',
          );
          recoverDesiredOnlinePresence(token).catch(() => undefined);
        },
        onQueueUpdated: () => {
          if (useDispatchStore.getState().availability !== 'AVAILABLE') return;
          loadDriverQueue(token, true).catch(() => undefined);
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
        .then(async (atual) => {
          if (!atual) return;
          const completionSync = await syncCompletionQueue(atual).catch(() => null);
          if (completionSync?.authRequired) return;
          /**
           * O aceite feito pela tela nativa acontece fora do React Native. Ao
           * fechar aquela Activity, a Home ja montada precisa descobrir o novo
           * pedido; sem esta consulta ela continuava vazia ate um refresh.
           */
          const previousDeliveryIds = new Set(
            useDispatchStore.getState().activeDeliveries.map((delivery) => delivery.id),
          );
          const deliveries = await getActiveDeliveries(atual).catch(() => null);
          if (deliveries && !cancelled) {
            setActiveDeliveries(deliveries);
            await syncDeliveryTracking(
              atual,
              deliveries.map((delivery) => delivery.id),
              useDispatchStore.getState().wantsToBeAvailable,
            )
              .then(() => setTrackingError(null))
              .catch((error: unknown) =>
                setTrackingError(
                  error instanceof LocationError
                    ? error.message
                    : 'Não foi possível atualizar o rastreamento das entregas ativas.',
                ),
              );

            const newlyAccepted = findNewlyAcceptedDelivery(deliveries, previousDeliveryIds);
            if (newlyAccepted) {
              navigation.navigate('DeliveryOperation', { deliveryId: newlyAccepted.id });
            }
          }
          await mostrarOfertaPendente(atual);
          const readiness = await verificarNotificacaoObrigatoria();
          await retirarDaFilaSemNotificacao(atual, readiness, true);
          if (!notificacaoBloqueiaPresenca(readiness)) {
            await recoverDesiredOnlinePresence(atual);
          }
          if (useDispatchStore.getState().availability === 'AVAILABLE') {
            await loadDriverQueue(atual, true);
          } else {
            clearDriverQueue();
          }
        })
        .catch(() => undefined);
    });

    async function mostrarOfertaPendente(token: string) {
      if (cancelled) return;
      const current = useDispatchStore.getState().incomingOffer;
      let pendente;
      try {
        pendente = await deliveryOffersApi.pending(token);
      } catch {
        // Sem resposta, o estado local continua sendo a melhor informação.
        return;
      }
      if (cancelled) return;
      if (!pendente) {
        if (current) {
          await dispensarOfertaNativa(current.offerId);
          setIncomingOffer(null);
        }
        return;
      }

      setIncomingOffer(pendente);
      if (!current || current.offerId !== pendente.offerId) {
        navigation.navigate('IncomingOffer');
      }
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
    let presence = await syncPresence(token);
    presence = await recoverDesiredOnlinePresence(token, presence);
    if (presence?.availability === 'AVAILABLE') {
      await loadDriverQueue(token);
    } else {
      clearDriverQueue();
    }
  }

  async function handleToggleAvailability(value: boolean) {
    const token = await session.getToken();
    if (!token) return;

    setPresenceLoading(true);
    try {
      if (!value) {
        await session.setDesiredAvailability(false);
        setWantsToBeAvailable(false);
        await stopDeliveryTracking().catch(() => undefined);
        setPresence('UNAVAILABLE', null);
        clearDriverQueue();
        setPresenceError(null);
        await driverPresenceApi
          .set(token, { availability: 'UNAVAILABLE' })
          .catch(() =>
            setPresenceError(
              'Voce saiu da fila neste aparelho. O servidor concluira a saida assim que a conexao voltar.',
            ),
          );
        return;
      }

      const notificationReadiness = await verificarNotificacaoObrigatoria();
      if (notificacaoBloqueiaPresenca(notificationReadiness)) {
        setPresenceError(mensagemNotificacaoObrigatoria(notificationReadiness));
        alertarNotificacaoObrigatoria(notificationReadiness);
        return;
      }

      await ensureBackgroundTrackingPermission();
      await session.setDesiredAvailability(true);
      setWantsToBeAvailable(true);
      const result = await recoverDesiredOnlinePresence(token);
      if (result?.availability === 'AVAILABLE') await loadDriverQueue(token);
    } catch (error) {
      await session.setDesiredAvailability(false);
      setWantsToBeAvailable(false);
      await stopDeliveryTracking().catch(() => undefined);
      setPresence('UNAVAILABLE', null);
      Alert.alert(
        'Disponibilidade nao atualizada',
        error instanceof ApiError || error instanceof LocationError
          ? error.message
          : 'Nao foi possivel atualizar sua disponibilidade. Tente novamente.',
      );
    } finally {
      setPresenceLoading(false);
    }
  }

  function reativarRastreamento() {
    session.getToken().then((token) => {
      if (!token) return;
      syncDeliveryTracking(
        token,
        useDispatchStore.getState().activeDeliveries.map((delivery) => delivery.id),
        useDispatchStore.getState().wantsToBeAvailable,
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
  }

  async function retryQueuedCompletions() {
    const token = await session.getToken();
    if (!token || completionSyncing || completionRetryInFlight.current) return;
    completionRetryInFlight.current = true;
    try {
      const retryReview = completionQueue.find((item) => item.state === 'NEEDS_REVIEW');
      const legacyReturn = completionQueue.find(completionNeedsFreshReturnLocation);
      const retryItem = retryReview ?? legacyReturn;
      const result = await syncCompletionQueue(
        token,
        retryItem
          ? {
              id: retryItem.id,
              needsFreshReturnLocation: completionNeedsFreshReturnLocation(retryItem),
            }
          : undefined,
      );
      if (result?.authRequired) return;
      const deliveries = await getActiveDeliveries(token).catch(() => null);
      if (deliveries) {
        setActiveDeliveries(deliveries);
        await syncDeliveryTracking(
          token,
          deliveries.map((delivery) => delivery.id),
          useDispatchStore.getState().wantsToBeAvailable,
        ).catch(() => undefined);
      }
    } finally {
      completionRetryInFlight.current = false;
    }
  }

  async function refreshCurrentTab() {
    const token = await session.getToken();
    if (!token) return;

    setRefreshing(true);
    try {
      if (aba === 'pendentes') {
        await carregarPendentes();
        return;
      }
      const result = await syncCompletionQueue(token);
      if (result?.authRequired) return;
      const presence = await recoverDesiredOnlinePresence(token);
      const deliveries = await getActiveDeliveries(token);
      setActiveDeliveries(deliveries);
      if (presence?.availability === 'AVAILABLE') {
        await loadDriverQueue(token, true);
      }
      await syncDeliveryTracking(
        token,
        deliveries.map((delivery) => delivery.id),
        useDispatchStore.getState().wantsToBeAvailable,
      ).catch(() => undefined);
    } catch {
      // Os avisos persistentes acima continuam sendo a fonte de erro da tela.
    } finally {
      setRefreshing(false);
    }
  }

  /**
   * Os avisos que valem a tela, do mais caro de ignorar para o menos.
   *
   * `completionQueue` vem primeiro porque e dinheiro que o servidor ainda nao
   * confirmou. A punicao vem por ultimo: ela informa, mas nao ha nada que o
   * motoboy possa fazer a respeito.
   */
  const avisos = [
    completionQueue.length > 0 && queuedCompletionForBanner
      ? {
          chave: 'sincronizacao',
          titulo:
            queuedCompletionForBanner.state === 'NEEDS_REVIEW'
              ? `Pedido #${queuedCompletionForBanner.displayNumber} precisa de atencao`
              : `${completionQueue.length} finalizacao(oes) aguardando confirmacao`,
          texto: completionSyncing
            ? 'Sincronizando com o servidor...'
            : queuedCompletionForBanner.lastError
              ? `${queuedCompletionForBanner.companyName}: ${queuedCompletionForBanner.lastError}`
              : 'A acao esta salva neste celular. Toque para tentar sincronizar agora.',
          rotulo: 'Sincronizar finalizacoes salvas no aparelho',
          estilo: [
            styles.avisoSincronizacao,
            queuedCompletionForBanner.state === 'NEEDS_REVIEW' && styles.avisoSincronizacaoReview,
          ],
          estiloTitulo: styles.avisoSincronizacaoTitulo,
          onPress: completionSyncing
            ? undefined
            : () => retryQueuedCompletions().catch(() => undefined),
        }
      : null,
    trackingError
      ? {
          chave: 'rastreamento',
          titulo: trackingError,
          texto: 'Tocar para ativar o rastreamento',
          estilo: styles.avisoAtencao,
          estiloTitulo: styles.avisoAtencaoTexto,
          onPress: () => reativarRastreamento(),
        }
      : null,
    presenceError
      ? {
          chave: 'presenca',
          titulo: presenceError,
          texto: 'Tocar para tentar novamente',
          estilo: styles.avisoErro,
          estiloTitulo: styles.avisoErroTexto,
          onPress: () => refreshPresence(),
        }
      : null,
    aba === 'pendentes' && pendentesError
      ? {
          chave: 'pendentes',
          titulo: pendentesError,
          texto: 'Tocar para tentar novamente',
          rotulo: 'Tentar carregar pedidos disponiveis novamente',
          estilo: styles.avisoErro,
          estiloTitulo: styles.avisoErroTexto,
          onPress: () => carregarPendentes().catch(() => undefined),
        }
      : null,
    punishment
      ? {
          chave: 'punicao',
          titulo: `Fora do despacho ate ${formatarHora(punishment.expiresAt)}`,
          texto:
            `${punishment.offerCount} ` +
            (punishment.reason === 'DECLINED_OFFER'
              ? 'ofertas recusadas seguidas'
              : 'ofertas sem resposta seguidas') +
            '. Pedido novo nao chega ate la; o que voce ja aceitou continua valendo.',
          estilo: styles.avisoAtencao,
          estiloTitulo: styles.avisoAtencaoTexto,
          onPress: undefined,
        }
      : null,
  ].filter((aviso): aviso is NonNullable<typeof aviso> => aviso !== null);
  const avisoAtivo = avisos[0] ?? null;
  const avisosEmEspera = avisos.length - 1;

  return (
    <View style={styles.tela}>
      <MapBackdrop interactive sheetFraction={fracaoDaFolha} />

      <SafeAreaView style={styles.sobreposicao} edges={['top']} pointerEvents="box-none">
        <View style={styles.barraSuperior} pointerEvents="box-none">
          <View style={styles.menuActions} pointerEvents="box-none">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Abrir menu"
              style={styles.botaoMenu}
              onPress={() => setDrawerVisible(true)}
              hitSlop={10}
            >
              <Icon name="menu" size={24} color={colors.ink} />
            </Pressable>

            {isAvailable ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  driverQueue?.currentPosition
                    ? `Abrir fila de entregadores. Sua posição é ${driverQueue.currentPosition}`
                    : 'Abrir fila de entregadores'
                }
                style={styles.queueButton}
                onPress={() => {
                  setQueueVisible(true);
                  loadDriverQueue().catch(() => undefined);
                }}
                hitSlop={8}
              >
                <Text style={styles.queueButtonText}>
                  {driverQueue?.currentPosition ? `#${driverQueue.currentPosition}` : '#--'}
                </Text>
              </Pressable>
            ) : null}
          </View>

          {!socketConnected && (
            <View style={styles.avisoConexao}>
              <Text style={styles.avisoConexaoTexto}>Reconectando...</Text>
            </View>
          )}
        </View>
      </SafeAreaView>

      <BottomSheet draggable onPositionChange={setFracaoDaFolha}>
        <View style={styles.conteudo}>
          <SegmentedTabs options={ABAS} value={aba} onChange={setAba} />

          {aba === 'andamento' && (
            <View style={styles.areaToggle}>
              <ActiveToggle
                value={wantsToBeAvailable}
                onChange={handleToggleAvailability}
                disabled={presenceLoading}
              />
            </View>
          )}

          {/*
            UM aviso por vez, por prioridade.

            Chegaram a caber cinco empilhados aqui — sincronizacao, punicao,
            presenca, rastreamento e a falha da aba — empurrando a lista de
            pedidos para fora da tela. Quem esta na moto le UM aviso; com cinco
            nao le nenhum. A ordem segue o custo de ignorar: dinheiro parado na
            frente, informacao sem acao no fim. Os demais nao somem calados, o
            contador abaixo diz quantos esperam.
          */}
          {avisoAtivo && (
            <Pressable
              accessibilityRole={avisoAtivo.onPress ? 'button' : 'text'}
              accessibilityLabel={avisoAtivo.rotulo ?? avisoAtivo.titulo}
              disabled={!avisoAtivo.onPress}
              style={avisoAtivo.estilo}
              onPress={() => avisoAtivo.onPress?.()}
            >
              <Text style={avisoAtivo.estiloTitulo}>{avisoAtivo.titulo}</Text>
              <Text style={styles.avisoAcao}>{avisoAtivo.texto}</Text>
              {avisosEmEspera > 0 && (
                <Text style={styles.avisoContador}>
                  +{avisosEmEspera} {avisosEmEspera === 1 ? 'outro aviso' : 'outros avisos'}
                </Text>
              )}
            </Pressable>
          )}

          <ScrollView
            style={styles.lista}
            contentContainerStyle={[
              styles.listaConteudo,
              aba === 'pendentes' && styles.listaPendentes,
            ]}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => refreshCurrentTab().catch(() => undefined)}
                tintColor={colors.actionSoft}
                colors={[colors.actionSoft]}
              />
            }
          >
            {aba === 'andamento' ? (
              activeDeliveries.length > 0 ? (
                activeDeliveries.map((delivery) => (
                  <DeliveryCard
                    key={delivery.id}
                    time={formatarHora(delivery.statusChangedAt)}
                    displayNumber={delivery.displayNumber}
                    companyName={delivery.companyName}
                    deliveryStatus={delivery.status}
                    supportingLabel={deliveryPaymentLabel(delivery.paymentMethod)}
                    distanceLabel={
                      delivery.distanceKm === null
                        ? 'Distância a calcular'
                        : formatarDistancia(delivery.distanceKm)
                    }
                    amountLabel={
                      delivery.driverValue === null
                        ? 'A calcular'
                        : formatarDinheiro(delivery.driverValue)
                    }
                    countdownLabel={pickupCountdownLabel(delivery, pickupCountdownNow)}
                    stops={activeDeliveryStops(delivery)}
                    onPress={() =>
                      navigation.navigate('DeliveryOperation', { deliveryId: delivery.id })
                    }
                  />
                ))
              ) : (
                <Vazio
                  mensagem={
                    isAvailable
                      ? 'Aguardando uma nova oferta'
                      : 'Fique ativo quando estiver pronto para receber ofertas'
                  }
                />
              )
            ) : pendentes.length > 0 ? (
              pendentes.map((delivery) => (
                <PendingDeliveryCard
                  key={delivery.id}
                  displayNumber={delivery.displayNumber}
                  time={formatarHora(delivery.createdAt)}
                  companyName={delivery.companyName}
                  serviceTypeName={delivery.serviceTypeName}
                  distanceLabel={
                    delivery.destinationKnownAtCreation
                      ? formatarDistancia(delivery.distanceKm) || 'Distância a calcular'
                      : 'Destino na entrega'
                  }
                  amountLabel={
                    delivery.driverValue === null
                      ? 'A calcular'
                      : formatarDinheiro(delivery.driverValue)
                  }
                  stops={availableDeliveryStops(delivery)}
                  batch={Boolean(delivery.batchId)}
                  accepting={aceitandoPendenteId === delivery.id}
                  disabled={aceitandoPendenteId !== null}
                  onAccept={() => aceitarPendente(delivery).catch(() => undefined)}
                />
              ))
            ) : (
              !pendentesError && (
                <Vazio
                  mensagem={
                    carregandoPendentes
                      ? 'Carregando pedidos...'
                      : 'Você não tem nenhuma entrega pendente'
                  }
                />
              )
            )}
          </ScrollView>
        </View>
      </BottomSheet>

      <DrawerMenu
        visible={drawerVisible}
        onClose={() => setDrawerVisible(false)}
        navigation={navigation}
      />

      <DriverQueueSheet
        visible={queueVisible}
        queue={driverQueue}
        loading={queueLoading}
        error={queueError}
        onClose={() => setQueueVisible(false)}
        onRetry={() => loadDriverQueue().catch(() => undefined)}
      />
    </View>
  );
}

function Vazio({ mensagem }: { mensagem: string }) {
  return (
    <View style={styles.vazio}>
      <EmptyIconCircle size={110} />
      <Text style={styles.vazioTexto}>{mensagem}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tela: { flex: 1, backgroundColor: colors.mapBackdrop },
  sobreposicao: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  barraSuperior: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 10,
    gap: 12,
  },
  menuActions: { alignItems: 'center', gap: 8 },
  botaoMenu: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  queueButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.action,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 5,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  queueButtonText: { color: colors.actionText, fontSize: 18, fontWeight: '900' },
  avisoConexao: {
    backgroundColor: colors.warning,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    marginTop: 8,
  },
  avisoConexaoTexto: { color: colors.surface, fontWeight: '700', fontSize: 13 },

  conteudo: { flex: 1, paddingHorizontal: 18 },
  areaToggle: { paddingVertical: 14 },

  avisoSincronizacao: {
    borderWidth: 1,
    borderColor: colors.warning,
    borderRadius: 12,
    padding: 12,
    gap: 3,
    marginBottom: 10,
    backgroundColor: colors.warningSoft,
  },
  avisoSincronizacaoReview: {
    borderColor: colors.danger,
    backgroundColor: colors.dangerSoft,
  },
  avisoSincronizacaoTitulo: { color: colors.ink, fontSize: 13, fontWeight: '800' },
  avisoSincronizacaoTexto: { color: colors.inkSoft, fontSize: 12, lineHeight: 17 },

  avisoErro: {
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: 12,
    padding: 12,
    gap: 2,
    marginBottom: 10,
  },
  avisoErroTexto: { color: colors.danger, fontSize: 13, fontWeight: '700' },
  avisoAtencao: {
    borderWidth: 1,
    borderColor: colors.warning,
    borderRadius: 12,
    padding: 12,
    gap: 2,
    marginBottom: 10,
  },
  avisoAtencaoTexto: { color: colors.warning, fontSize: 13, fontWeight: '700' },
  avisoAcao: { color: colors.inkSoft, fontSize: 12, fontWeight: '600' },
  avisoContador: { color: colors.inkSoft, fontSize: 11, fontWeight: '700', marginTop: 6 },

  lista: { flex: 1 },
  listaConteudo: { paddingBottom: 24 },
  listaPendentes: { gap: 10, paddingTop: 12 },
  vazio: { alignItems: 'center', paddingTop: 26, gap: 18 },
  vazioTexto: { fontSize: 17, color: colors.inkSoft, textAlign: 'center' },
});
