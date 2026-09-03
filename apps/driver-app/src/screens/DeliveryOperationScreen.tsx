import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  Linking,
  Modal,
  Pressable,
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
  DeliveryAddressItem,
  DeliveryDetail,
  DeliveryStatus,
  MarkDeliveredPayload,
} from '@motoboycity/types';
import { BottomSheet } from '../components/BottomSheet';
import { Icon } from '../components/Icon';
import { MapBackdrop } from '../components/MapBackdrop';
import { PrimaryButton } from '../components/PrimaryButton';
import { RouteTimeline } from '../components/RouteTimeline';
import { SheetHeader } from '../components/SheetHeader';
import { deliveriesApi } from '../lib/apiClient';
import { getActiveDeliveries } from '../lib/activeDeliveries';
import { clearExpiredDriverSession } from '../lib/clearExpiredDriverSession';
import {
  completionClosesDeliveryLocally,
  COMPLETION_QUIET_WINDOW_MS,
  completionNeedsFreshDeliveryLocation,
  discardStaleCompletionBeforeCollection,
  enqueueDeliveryCompletion,
  getPendingDeliveryCompletions,
  pendingCompletionForDelivery,
  subscribeDeliveryCompletionOutbox,
  synchronizePendingDeliveryCompletions,
  type PendingDeliveryCompletion,
} from '../lib/deliveryCompletionOutbox';
import {
  deliveryOperationCopy,
  deliveryPaymentLabel,
  formatDeliveryAddress,
  formatElapsedTime,
  formatOperationDateTime,
  navigationDestination,
} from '../lib/deliveryOperation';
import { syncDeliveryTracking } from '../lib/deliveryTracking';
import { getDriverProfile } from '../lib/driverProfileCache';
import {
  captureCompletionLocation,
  captureCurrentLocation,
  LocationError,
  type LocationFix,
} from '../lib/location';
import { session } from '../lib/session';
import type { RootStackParamList } from '../navigation/types';
import { useDispatchStore } from '../store/dispatchStore';
import { colors } from '../theme/colors';

type Props = NativeStackScreenProps<RootStackParamList, 'DeliveryOperation'>;
type Operation = 'collect' | 'deliver' | 'return' | 'fail' | 'cancel' | 'return-to-queue' | null;

const IMMEDIATE_COMPLETION_SYNC_WAIT_MS = 2_500;

/**
 * Converte o fix em payload, ou em payload VAZIO quando nao houve fix.
 *
 * Mandar vazio e deliberado: quem decide se a posicao era necessaria e o
 * servidor, olhando o raio configurado. Com o raio desligado a etapa passa;
 * com o raio ligado ele recusa com o motivo exato, em vez de o aplicativo
 * barrar sozinho por um GPS que nao fechou.
 */
function posicaoParaEnvio(fix: LocationFix | null): {
  lat?: number;
  lng?: number;
  accuracy?: number;
} {
  if (!fix) return {};
  return { lat: fix.lat, lng: fix.lng, accuracy: fix.accuracy };
}

const currencyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

function customerPaymentLabel(method: DeliveryDetail['customerPaymentMethod']): string {
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
      return 'Não informado';
  }
}

function destinationLabel(
  delivery: DeliveryDetail,
  dropoff: DeliveryAddressItem | undefined,
): string {
  if (dropoff) return formatDeliveryAddress(dropoff);
  if (!delivery.destinationKnownAtCreation) {
    return 'Endereço de entrega definido pela localização no momento da entrega';
  }
  return 'Endereço de entrega não informado';
}

function operationWasApplied(
  operation: Exclude<Operation, null>,
  delivery: DeliveryDetail,
): boolean {
  const hasTransition = (fromStatus: DeliveryStatus, toStatuses: DeliveryStatus[]) =>
    delivery.statusHistory.some(
      (item) => item.fromStatus === fromStatus && toStatuses.includes(item.toStatus),
    );

  if (operation === 'collect') {
    return ['COLLECTED', 'DELIVERED', 'FAILED', 'COMPLETED'].includes(delivery.status);
  }
  if (operation === 'deliver') {
    return hasTransition('COLLECTED', ['DELIVERED', 'COMPLETED']);
  }
  if (operation === 'fail') {
    return delivery.statusHistory.some((item) => item.toStatus === 'FAILED');
  }
  if (operation === 'return') {
    return hasTransition('DELIVERED', ['COMPLETED']) || hasTransition('FAILED', ['COMPLETED']);
  }
  if (operation === 'cancel') {
    return delivery.status === 'CANCELLED';
  }
  return false;
}

export function DeliveryOperationScreen({ navigation, route }: Props) {
  const [delivery, setDelivery] = useState<DeliveryDetail | null>(null);
  const [actionMenuOpen, setActionMenuOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [problemOpen, setProblemOpen] = useState(false);
  const [returnOpen, setReturnOpen] = useState(false);
  const [deliverConfirmationOpen, setDeliverConfirmationOpen] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(Date.now());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [operation, setOperation] = useState<Operation>(null);
  const [pendingCompletion, setPendingCompletion] = useState<PendingDeliveryCompletion | null>(
    null,
  );
  /**
   * O aviso so ocupa a tela depois da janela de silencio.
   *
   * Sem isso ele aparecia no instante do toque, e a sincronizacao normal
   * responde em um ou dois segundos — o motoboy via um alerta amarelo em TODA
   * entrega bem-sucedida e concluia que algo tinha dado errado. Recusa do
   * servidor continua aparecendo na hora: ali e problema, nao demora.
   */
  const [avisoPendenteVisivel, setAvisoPendenteVisivel] = useState(false);
  const previousPendingCompletionId = useRef<string | null>(null);
  const pendingRefreshVersion = useRef(0);
  const operationInFlight = useRef(false);
  const setActiveDeliveries = useDispatchStore((state) => state.setActiveDeliveries);

  const handleProtectedBack = useCallback(() => {
    // Nao desmonta a tela enquanto uma transicao esta sendo confirmada na API.
    if (operationInFlight.current) return true;

    if (deliverConfirmationOpen) {
      setDeliverConfirmationOpen(false);
      return true;
    }
    if (returnOpen) {
      setReturnOpen(false);
      return true;
    }
    if (cancelOpen) {
      setCancelOpen(false);
      return true;
    }
    if (problemOpen) {
      setProblemOpen(false);
      return true;
    }
    if (actionMenuOpen) {
      setActionMenuOpen(false);
      return true;
    }

    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      // A tela pode ser a raiz quando aberta por notificacao ou apos um
      // replace. Nesse caso recriamos uma pilha segura em vez de fechar o app.
      navigation.reset({ index: 0, routes: [{ name: 'Home' }] });
    }
    return true;
  }, [actionMenuOpen, cancelOpen, deliverConfirmationOpen, navigation, problemOpen, returnOpen]);

  useFocusEffect(
    useCallback(() => {
      const subscription = BackHandler.addEventListener('hardwareBackPress', handleProtectedBack);
      return () => subscription.remove();
    }, [handleProtectedBack]),
  );

  const loadDelivery = useCallback(async () => {
    const token = await session.getToken();
    if (!token) {
      setLoading(false);
      navigation.popToTop();
      return;
    }

    try {
      setDelivery(await deliveriesApi.detail(token, route.params.deliveryId));
      setLoadError(null);
    } catch (error) {
      const message =
        error instanceof ApiError ? error.message : 'Não foi possível carregar este pedido.';
      setLoadError(message);
      if (error instanceof ApiError && [401, 403, 404].includes(error.status)) {
        Alert.alert('Pedido indisponível', message);
        navigation.goBack();
      }
    } finally {
      setLoading(false);
    }
  }, [navigation, route.params.deliveryId]);

  const refreshPendingCompletion = useCallback(async () => {
    const refreshVersion = ++pendingRefreshVersion.current;
    const ownerUserId = await session.getUserId();
    if (!ownerUserId || !delivery) {
      if (refreshVersion === pendingRefreshVersion.current) setPendingCompletion(null);
      return;
    }
    const queue = await getPendingDeliveryCompletions(ownerUserId);
    const staleDelivery = queue.find(
      (item) =>
        item.action === 'DELIVER' &&
        item.deliveryId === delivery.id &&
        item.state === 'NEEDS_REVIEW',
    );

    if (delivery.status === 'ACCEPTED' && staleDelivery) {
      try {
        await discardStaleCompletionBeforeCollection(ownerUserId, delivery, staleDelivery, queue);
      } finally {
        // Nunca reutiliza o retrato anterior: outra sincronizacao pode ter
        // removido ou substituido a tentativa enquanto o AsyncStorage gravava.
        const refreshedQueue = await getPendingDeliveryCompletions(ownerUserId);
        if (refreshVersion === pendingRefreshVersion.current) {
          setPendingCompletion(pendingCompletionForDelivery(refreshedQueue, delivery) ?? null);
        }
      }
      return;
    }

    if (refreshVersion === pendingRefreshVersion.current) {
      setPendingCompletion(pendingCompletionForDelivery(queue, delivery) ?? null);
    }
  }, [delivery]);

  useEffect(() => {
    loadDelivery().catch(() => undefined);
  }, [loadDelivery]);

  useEffect(() => {
    refreshPendingCompletion().catch(() => undefined);
    return subscribeDeliveryCompletionOutbox(() => {
      refreshPendingCompletion().catch(() => undefined);
    });
  }, [refreshPendingCompletion]);

  useEffect(() => {
    const previousId = previousPendingCompletionId.current;
    previousPendingCompletionId.current = pendingCompletion?.id ?? null;
    if (previousId && !pendingCompletion) {
      loadDelivery().catch(() => undefined);
    }
  }, [loadDelivery, pendingCompletion]);

  useEffect(() => {
    if (
      pendingCompletion?.action === 'DELIVER' &&
      pendingCompletion.state === 'PENDING' &&
      delivery?.status === 'COLLECTED' &&
      delivery.requiresReturn
    ) {
      // Projecao apenas visual/operacional: permite registrar o retorno mesmo
      // durante uma queda longa. O servidor continua sendo a fonte oficial e
      // recebe DELIVER antes de COMPLETE_RETURN pela ordem da outbox.
      setDelivery({
        ...delivery,
        status: 'DELIVERED',
        statusChangedAt: pendingCompletion.queuedAt,
      });
      setActiveDeliveries(
        useDispatchStore.getState().activeDeliveries.map((activeDelivery) =>
          activeDelivery.id === delivery.id
            ? {
                ...activeDelivery,
                status: 'DELIVERED',
                statusChangedAt: pendingCompletion.queuedAt,
              }
            : activeDelivery,
        ),
      );
    }
  }, [delivery, pendingCompletion, setActiveDeliveries]);

  useEffect(() => {
    if (delivery?.status !== 'ACCEPTED') return undefined;

    setNowMs(Date.now());
    const timer = setInterval(() => setNowMs(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, [delivery?.status]);

  /**
   * Primitivos, e nao o objeto: a fila reemite `pendingCompletion` a cada
   * notificacao, e observar a referencia reiniciaria o relogio para sempre —
   * o aviso nunca apareceria, nem quando a espera fosse real.
   */
  const pendenteId = pendingCompletion?.id ?? null;
  const pendenteEstado = pendingCompletion?.state ?? null;
  const pendenteQueuedAt = pendingCompletion?.queuedAt ?? null;

  useEffect(() => {
    if (!pendenteId || !pendenteQueuedAt) {
      setAvisoPendenteVisivel(false);
      return undefined;
    }
    // Recusa do servidor aparece na hora: e problema, nao demora.
    if (pendenteEstado === 'NEEDS_REVIEW') {
      setAvisoPendenteVisivel(true);
      return undefined;
    }
    const faltando =
      COMPLETION_QUIET_WINDOW_MS - (Date.now() - new Date(pendenteQueuedAt).getTime());
    if (faltando <= 0) {
      setAvisoPendenteVisivel(true);
      return undefined;
    }
    setAvisoPendenteVisivel(false);
    const timer = setTimeout(() => setAvisoPendenteVisivel(true), faltando);
    return () => clearTimeout(timer);
  }, [pendenteId, pendenteEstado, pendenteQueuedAt]);

  useEffect(() => {
    if (!successMessage) return undefined;
    const timer = setTimeout(() => setSuccessMessage(null), 4_500);
    return () => clearTimeout(timer);
  }, [successMessage]);

  async function refreshActiveDeliveries(token: string) {
    const deliveries = await getActiveDeliveries(token);
    setActiveDeliveries(deliveries);
    return deliveries;
  }

  async function showConfirmedCompletion(
    token: string,
    projectedStatus: 'DELIVERED' | 'COMPLETED',
    message: string,
  ): Promise<void> {
    if (!delivery) return;
    const confirmed = await deliveriesApi.detail(token, delivery.id).catch(() => null);
    setDelivery(
      confirmed ?? {
        ...delivery,
        status: projectedStatus,
        statusChangedAt: new Date().toISOString(),
      },
    );
    setDeliverConfirmationOpen(false);
    setSuccessMessage(message);

    // A mutacao ja foi confirmada. Falhar neste GET auxiliar nao pode transformar
    // sucesso em erro nem recolocar a acao na fila.
    const active = await getActiveDeliveries(token).catch(() => null);
    if (!active) return;
    setActiveDeliveries(active);
    await syncDeliveryTracking(
      token,
      active.map((activeDelivery) => activeDelivery.id),
      useDispatchStore.getState().wantsToBeAvailable,
    ).catch(() => undefined);

    if (!active.some((activeDelivery) => activeDelivery.id === delivery.id)) {
      const nextDelivery = active[0];
      if (nextDelivery) {
        navigation.replace('DeliveryOperation', { deliveryId: nextDelivery.id });
      }
    }
  }

  async function resolveOwnerUserId(token: string): Promise<string | null> {
    const persisted = await session.getUserId();
    if (persisted) return persisted;

    const profile = await getDriverProfile(token).catch(() => null);
    if (!profile) return null;
    await session.setUserId(profile.id);
    return profile.id;
  }

  async function redirectExpiredSession(expectedToken: string): Promise<void> {
    if ((await session.getToken()) !== expectedToken) return;
    await clearExpiredDriverSession();
    Alert.alert(
      'Sessao expirada',
      'A finalizacao continua salva neste aparelho. Entre novamente para sincronizar.',
    );
    navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
  }

  async function queueAndSynchronizeCompletion(
    token: string,
    action: 'DELIVER' | 'COMPLETE_RETURN',
    payload: MarkDeliveredPayload = {},
  ): Promise<PendingDeliveryCompletion | null | undefined> {
    if (!delivery) return undefined;
    const ownerUserId = await resolveOwnerUserId(token);
    if (!ownerUserId) {
      Alert.alert(
        'Identidade indisponivel',
        'Abra o aplicativo uma vez com internet para proteger a sincronizacao desta conta.',
      );
      return undefined;
    }

    const queued = await enqueueDeliveryCompletion(
      action === 'DELIVER'
        ? {
            ownerUserId,
            action,
            deliveryId: delivery.id,
            batchId: delivery.batchId,
            displayNumber: delivery.displayNumber,
            companyName: delivery.companyName,
            payload,
          }
        : {
            ownerUserId,
            action,
            deliveryId: delivery.id,
            batchId: delivery.batchId,
            displayNumber: delivery.displayNumber,
            companyName: delivery.companyName,
            // O mesmo fix capturado para o retorno. Omiti-lo aqui era o defeito:
            // a posicao existia e nao chegava ao servidor.
            payload,
          },
    );

    const syncPromise = synchronizePendingDeliveryCompletions(token, ownerUserId);
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const syncAttempt = await Promise.race([
      syncPromise.then(
        (result) => ({ finished: true as const, result }),
        () => ({ finished: true as const, result: null }),
      ),
      new Promise<{ finished: false; result: null }>((resolve) => {
        timeoutId = setTimeout(
          () => resolve({ finished: false, result: null }),
          IMMEDIATE_COMPLETION_SYNC_WAIT_MS,
        );
      }),
    ]);
    if (timeoutId) clearTimeout(timeoutId);

    if (!syncAttempt.finished) {
      // A acao ja esta duravel no aparelho. Nao deixamos uma conexao degradada
      // prender o motoboy numa tela de carregamento; a mesma Promise continua
      // em segundo plano e os demais gatilhos tentam novamente depois.
      setPendingCompletion(queued);
      syncPromise
        .then(async (result) => {
          if (result.authRequired) {
            await redirectExpiredSession(token);
            return;
          }
          const queue = await getPendingDeliveryCompletions(ownerUserId);
          if (pendingCompletionForDelivery(queue, delivery)) return;
          const active = await getActiveDeliveries(token).catch(() => null);
          if (!active) return;
          setActiveDeliveries(active);
          await syncDeliveryTracking(
            token,
            active.map((activeDelivery) => activeDelivery.id),
            useDispatchStore.getState().wantsToBeAvailable,
          ).catch(() => undefined);
        })
        .catch(() => undefined);
      return queued;
    }

    if (syncAttempt.result?.authRequired) {
      setPendingCompletion(queued);
      await redirectExpiredSession(token);
      return undefined;
    }

    if (
      syncAttempt.result?.staleIds.includes(queued.id) ||
      syncAttempt.result?.discardedIds.includes(queued.id)
    ) {
      // A API confirmou que esta acao nao tem mais onde ser aplicada. Atualiza
      // o estado real sem mostrar sucesso falso nem deixar um aviso tecnico.
      setPendingCompletion(null);
      await loadDelivery();
      return undefined;
    }

    const remaining = (await getPendingDeliveryCompletions(ownerUserId)).find(
      (item) => item.id === queued.id,
    );
    setPendingCompletion(remaining ?? null);
    if (remaining) return remaining;
    if (syncAttempt.result?.syncedIds.includes(queued.id)) return null;

    // Outra sincronizacao pode ter retirado o item enquanto esta chamada
    // aguardava. Sem o resultado que prova a aplicacao, recarrega o servidor e
    // nao transforma ausencia na fila em uma confirmacao falsa.
    await loadDelivery();
    return undefined;
  }

  async function keepCompletionPendingLocally(
    token: string,
    item: PendingDeliveryCompletion,
  ): Promise<void> {
    if (!delivery) return;
    setDeliverConfirmationOpen(false);
    const finalLocally =
      item.action === 'COMPLETE_RETURN' || (item.action === 'DELIVER' && !delivery.requiresReturn);

    if (item.state === 'NEEDS_REVIEW') {
      if (completionNeedsFreshDeliveryLocation(item)) return;
      Alert.alert(
        'Finalizacao precisa de atencao',
        item.lastError ??
          'O servidor recusou a operacao. Atualize o pedido antes de tentar novamente.',
      );
      return;
    }

    // So a etapa que MANTEM o motoboy nesta tela precisa de mensagem aqui; a
    // que fecha o pedido leva ele para a Home, onde o banner assume.
    if (!finalLocally) {
      setSuccessMessage('Entrega salva no aparelho. Aguardando a confirmacao do servidor.');
    }

    if (!finalLocally) {
      if (item.action === 'DELIVER' && delivery.requiresReturn) {
        setDelivery({ ...delivery, status: 'DELIVERED', statusChangedAt: item.queuedAt });
        setActiveDeliveries(
          useDispatchStore
            .getState()
            .activeDeliveries.map((activeDelivery) =>
              activeDelivery.id === delivery.id
                ? { ...activeDelivery, status: 'DELIVERED', statusChangedAt: item.queuedAt }
                : activeDelivery,
            ),
        );
      }
      return;
    }

    const remainingDeliveries = useDispatchStore
      .getState()
      .activeDeliveries.filter(
        (activeDelivery) => !completionClosesDeliveryLocally(item, activeDelivery),
      );
    setActiveDeliveries(remainingDeliveries);
    await syncDeliveryTracking(
      token,
      remainingDeliveries.map((activeDelivery) => activeDelivery.id),
      useDispatchStore.getState().wantsToBeAvailable,
    ).catch(() => undefined);

    /*
      Sem alerta modal aqui.

      Este caminho ja levava tres avisos para o mesmo fato: uma mensagem de
      sucesso que a tela descarta ao sair, um modal que pede um toque, e o
      banner da Home — que e para onde o motoboy vai em seguida. O banner e o
      unico que persiste, diz quantas acoes esperam e sincroniza no toque; os
      outros dois so cobravam atencao para repetir o que ele ja ia ler.
    */
    navigation.popToTop();
  }

  async function runOperation(nextOperation: Exclude<Operation, null>, operationNote?: string) {
    if (!delivery || operationInFlight.current) return;
    operationInFlight.current = true;
    setOperation(nextOperation);
    let token: string | null = null;
    try {
      token = await session.getToken();
      if (!token) return;

      if (nextOperation === 'collect') {
        const result = await deliveriesApi.collect(
          token,
          delivery.id,
          posicaoParaEnvio(await captureCompletionLocation()),
        );
        setDelivery(result.deliveries.find((item) => item.id === delivery.id) ?? null);
        setSuccessMessage('O pedido foi marcado como coletado!');
      } else if (nextOperation === 'deliver') {
        // O fix e congelado ANTES de salvar a acao. Se ele define o preco, uma
        // tentativa posterior nunca pode recapturar outra rua por engano.
        const payload = posicaoParaEnvio(
          await captureCompletionLocation({
            improveImpreciseFix: !delivery.destinationKnownAtCreation,
          }),
        );
        const queued = await queueAndSynchronizeCompletion(token, 'DELIVER', payload);
        if (queued === undefined) return;
        if (queued) {
          await keepCompletionPendingLocally(token, queued);
          return;
        }
        await showConfirmedCompletion(
          token,
          delivery.requiresReturn ? 'DELIVERED' : 'COMPLETED',
          'O pedido foi marcado como entregue!',
        );
        return;
      } else if (nextOperation === 'return-to-queue') {
        await deliveriesApi.returnToQueue(token, delivery.id, {
          reason: operationNote ?? 'Devolvido à fila pelo motoboy.',
        });
        setReturnOpen(false);
        setProblemOpen(false);
        const remainingDeliveries = await refreshActiveDeliveries(token);
        await syncDeliveryTracking(
          token,
          remainingDeliveries.map((item) => item.id),
        ).catch(() => undefined);
        navigation.popToTop();
        return;
      } else if (nextOperation === 'fail') {
        const failureLocation = delivery.destinationKnownAtCreation
          ? null
          : await captureCurrentLocation();
        setDelivery(
          await deliveriesApi.fail(token, delivery.id, {
            reason: 'OTHER',
            note: operationNote ?? 'Problema informado pelo motoboy.',
            ...(failureLocation && {
              lat: failureLocation.lat,
              lng: failureLocation.lng,
              accuracy: failureLocation.accuracy,
            }),
          }),
        );
        setProblemOpen(false);
        setSuccessMessage(
          'Ocorrência registrada. O pedido continua com você; devolva à loja para concluir o repasse.',
        );
      } else if (nextOperation === 'cancel') {
        await deliveriesApi.cancel(token, delivery.id, 'Cancelado pelo motoboy.');
        setCancelOpen(false);
        const remainingDeliveries = await refreshActiveDeliveries(token);
        await syncDeliveryTracking(
          token,
          remainingDeliveries.map((item) => item.id),
        ).catch(() => undefined);
        navigation.popToTop();
        return;
      } else {
        const returnLocation = posicaoParaEnvio(await captureCompletionLocation());
        const queued = await queueAndSynchronizeCompletion(
          token,
          'COMPLETE_RETURN',
          returnLocation,
        );
        if (queued === undefined) return;
        if (queued) {
          await keepCompletionPendingLocally(token, queued);
          return;
        }
        await showConfirmedCompletion(token, 'COMPLETED', 'Retorno concluído!');
        return;
      }

      const activeDeliveries = await refreshActiveDeliveries(token);
      syncDeliveryTracking(
        token,
        activeDeliveries.map((activeDelivery) => activeDelivery.id),
      ).catch((trackingError: unknown) => {
        Alert.alert(
          'Verifique o rastreamento',
          trackingError instanceof LocationError
            ? trackingError.message
            : 'Não foi possível atualizar o rastreamento da entrega.',
        );
      });

      if (!activeDeliveries.some((activeDelivery) => activeDelivery.id === delivery.id)) {
        const nextDelivery = activeDeliveries[0];
        if (nextDelivery) {
          navigation.replace('DeliveryOperation', { deliveryId: nextDelivery.id });
        }
      }
    } catch (error) {
      if (!token) {
        Alert.alert('Sessão indisponível', 'Entre novamente para atualizar este pedido.');
        return;
      }
      if (nextOperation === 'return-to-queue' || nextOperation === 'cancel') {
        const activeDeliveries = await getActiveDeliveries(token).catch(() => null);
        if (activeDeliveries && !activeDeliveries.some((item) => item.id === delivery.id)) {
          setActiveDeliveries(activeDeliveries);
          await syncDeliveryTracking(
            token,
            activeDeliveries.map((item) => item.id),
          ).catch(() => undefined);
          navigation.popToTop();
          return;
        }
      } else {
        const reconciled = await deliveriesApi.detail(token, delivery.id).catch(() => null);
        if (reconciled && operationWasApplied(nextOperation, reconciled)) {
          setDelivery(reconciled);
          const activeDeliveries = await refreshActiveDeliveries(token).catch(() => null);
          if (activeDeliveries) {
            await syncDeliveryTracking(
              token,
              activeDeliveries.map((item) => item.id),
            ).catch(() => undefined);
          }
          setSuccessMessage('A ação já havia sido confirmada e o pedido foi sincronizado.');
          return;
        }
      }
      Alert.alert(
        'Não foi possível confirmar a ação',
        `${
          error instanceof ApiError || error instanceof LocationError
            ? error.message
            : 'A conexão foi interrompida.'
        } Atualize o pedido antes de repetir; o servidor aceita a repetição sem duplicar o registro.`,
      );
    } finally {
      operationInFlight.current = false;
      setOperation(null);
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.loading}>
        <ActivityIndicator color={colors.action} />
      </SafeAreaView>
    );
  }

  if (!delivery) {
    return (
      <SafeAreaView style={styles.loading}>
        <Text style={styles.loadErrorText}>{loadError ?? 'Pedido indisponível.'}</Text>
        <PrimaryButton
          label="Tentar novamente"
          onPress={() => {
            setLoading(true);
            loadDelivery().catch(() => undefined);
          }}
        />
      </SafeAreaView>
    );
  }

  const currentDelivery = delivery;
  const pickup = delivery.addresses.find((address) => address.type === 'PICKUP');
  const dropoff = delivery.addresses.find((address) => address.type === 'DROPOFF');
  const operationBusy = operation !== null;
  const canQueueDependentReturn =
    pendingCompletion?.action === 'DELIVER' &&
    pendingCompletion.state === 'PENDING' &&
    delivery.status === 'DELIVERED' &&
    delivery.requiresReturn;
  const canRetryDeliveryGps =
    delivery.status === 'COLLECTED' &&
    pendingCompletion !== null &&
    completionNeedsFreshDeliveryLocation(pendingCompletion);
  const controlsBusy = operationBusy || pendingCompletion !== null;
  const primaryBusy =
    operationBusy ||
    (pendingCompletion !== null && !canQueueDependentReturn && !canRetryDeliveryGps);
  const copy = deliveryOperationCopy(delivery.status);
  const primaryActionLabel = canRetryDeliveryGps ? 'Tentar GPS novamente' : copy.primaryActionLabel;
  const action =
    delivery.status === 'ACCEPTED'
      ? ('collect' as const)
      : delivery.status === 'COLLECTED'
        ? ('deliver' as const)
        : delivery.status === 'DELIVERED' || delivery.status === 'FAILED'
          ? ('return' as const)
          : null;
  const routeAddress =
    delivery.status === 'COLLECTED'
      ? dropoff
      : delivery.status === 'ACCEPTED' ||
          delivery.status === 'DELIVERED' ||
          delivery.status === 'FAILED'
        ? pickup
        : undefined;
  const routeDestination = navigationDestination(routeAddress);
  const pickupDone = delivery.status !== 'ACCEPTED';
  const dropoffDone = delivery.status === 'DELIVERED' || delivery.status === 'COMPLETED';
  const valueLabel =
    delivery.driverValue === null
      ? 'A calcular na entrega'
      : currencyFormatter.format(delivery.driverValue);

  async function openExternalNavigation() {
    if (!routeDestination) {
      Alert.alert('Rota indisponível', 'Este pedido ainda não possui um endereço para navegação.');
      return;
    }
    try {
      await Linking.openURL(
        `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(routeDestination)}`,
      );
    } catch {
      Alert.alert(
        'Não foi possível abrir a navegação',
        'Verifique se existe um aplicativo de mapas instalado.',
      );
    }
  }

  async function callRecipient() {
    const phone = currentDelivery.recipientPhone?.replace(/[^+\d]/g, '');
    if (!phone) return;
    try {
      await Linking.openURL(`tel:${phone}`);
    } catch {
      Alert.alert('Ligação indisponível', 'Não foi possível abrir o telefone neste aparelho.');
    }
  }

  function handlePrimaryAction() {
    if (!action || primaryBusy) return;
    if (canRetryDeliveryGps) {
      runOperation('deliver').catch(() => undefined);
      return;
    }
    if (action === 'deliver' && !currentDelivery.destinationKnownAtCreation) {
      setDeliverConfirmationOpen(true);
      return;
    }

    const confirmation =
      action === 'collect'
        ? {
            title: 'Confirmar coleta?',
            message: 'Confirme somente depois de receber todos os itens deste pedido na loja.',
            label: 'Confirmar coleta',
          }
        : action === 'deliver'
          ? {
              title: 'Confirmar entrega?',
              message: 'Confirme que o pedido foi entregue ao cliente.',
              label: 'Confirmar entrega',
            }
          : {
              title: 'Confirmar retorno?',
              message: 'Confirme que a mercadoria retornou ao local de coleta.',
              label: 'Confirmar retorno',
            };
    Alert.alert(confirmation.title, confirmation.message, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: confirmation.label,
        onPress: () => runOperation(action).catch(() => undefined),
      },
    ]);
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <MapBackdrop />
      <BottomSheet style={styles.sheet}>
        <SheetHeader title={`Pedido #${delivery.displayNumber}`} onBack={handleProtectedBack} />

        {successMessage ? (
          <View style={styles.successBanner} accessibilityLiveRegion="polite">
            <View style={styles.successIcon}>
              <Icon name="check" size={16} color={colors.success} />
            </View>
            <Text style={styles.successText}>{successMessage}</Text>
          </View>
        ) : null}

        {pendingCompletion && avisoPendenteVisivel ? (
          <View
            style={[
              styles.pendingBanner,
              pendingCompletion.state === 'NEEDS_REVIEW' &&
                !canRetryDeliveryGps &&
                styles.pendingBannerReview,
            ]}
            accessibilityLiveRegion="polite"
          >
            <Icon
              name={
                pendingCompletion.state === 'NEEDS_REVIEW' && !canRetryDeliveryGps
                  ? 'info'
                  : 'clock'
              }
              size={20}
              color={
                pendingCompletion.state === 'NEEDS_REVIEW' && !canRetryDeliveryGps
                  ? colors.danger
                  : colors.warning
              }
            />
            <View style={styles.pendingBannerCopy}>
              <Text style={styles.pendingBannerTitle}>
                {canRetryDeliveryGps
                  ? 'GPS sem precisao'
                  : pendingCompletion.state === 'NEEDS_REVIEW'
                    ? 'Finalizacao precisa de atencao'
                    : 'Aguardando sincronizacao'}
              </Text>
              <Text style={styles.pendingBannerText}>
                {canRetryDeliveryGps
                  ? 'Va para um local aberto e toque em "Tentar GPS novamente".'
                  : (pendingCompletion.lastError ??
                    'A acao esta salva neste aparelho e sera confirmada quando o servidor responder.')}
              </Text>
            </View>
          </View>
        ) : null}

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.dateRow}>
            <Icon name="calendar" size={24} color={colors.inkMuted} />
            <Text style={styles.dateText}>
              {formatOperationDateTime(delivery.statusChangedAt || delivery.createdAt)}
            </Text>
          </View>

          <View style={styles.statusRow}>
            <View style={styles.statusGroup}>
              <Icon name="pin" size={26} color={colors.actionSoft} />
              <Text style={styles.statusText}>{copy.statusLabel}</Text>
            </View>
            <Text style={styles.brand}>motoboy</Text>
          </View>

          {delivery.batchId ? <Text style={styles.batchLabel}>Pedido em lote</Text> : null}

          {delivery.status === 'ACCEPTED' ? (
            <View style={styles.elapsedPanel}>
              <View style={styles.elapsedBadge}>
                <Text style={styles.elapsedValue}>
                  {formatElapsedTime(delivery.statusChangedAt, nowMs)}
                </Text>
              </View>
              <Text style={styles.elapsedLabel}>Tempo desde o aceite</Text>
            </View>
          ) : null}

          <OperationSection icon="money" title="Valores">
            <View style={styles.valueRow}>
              <Text style={styles.valueLabel}>Valor do entregador</Text>
              <View style={styles.valueDots} />
              <Text style={styles.value}>{valueLabel}</Text>
            </View>

            <Text style={styles.paymentTitle}>Método de pagamento</Text>
            <View style={styles.paymentRow}>
              <Icon name="list" size={28} color={colors.actionSoft} />
              <Text style={styles.paymentValue}>
                {deliveryPaymentLabel(delivery.paymentMethod)}
              </Text>
            </View>
            {delivery.customerPaymentMethod ? (
              <Text style={styles.paymentDetail}>
                Cobrança do cliente: {customerPaymentLabel(delivery.customerPaymentMethod)}
              </Text>
            ) : null}
          </OperationSection>

          <OperationSection icon="pin" title="Endereços">
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
                  address: destinationLabel(delivery, dropoff),
                },
              ]}
            />

            {routeDestination && copy.routeLabel ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => openExternalNavigation().catch(() => undefined)}
                style={({ pressed }) => [styles.routeButton, pressed && styles.pressed]}
              >
                <Icon name="pin" size={18} color={colors.actionText} />
                <Text style={styles.routeButtonText}>{copy.routeLabel}</Text>
              </Pressable>
            ) : null}
          </OperationSection>

          <OperationSection icon="person" title="Cliente">
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
                onPress={() => callRecipient().catch(() => undefined)}
                style={({ pressed }) => [styles.phoneRow, pressed && styles.pressed]}
              >
                <Icon name="phone" size={21} color={colors.link} />
                <Text style={styles.phoneText}>{delivery.recipientPhone}</Text>
              </Pressable>
            ) : null}
            {delivery.externalOrderNumber ? (
              <Text style={styles.metadata}>Pedido da loja: {delivery.externalOrderNumber}</Text>
            ) : null}
            {delivery.driverNote ? (
              <Text style={styles.driverNote}>{delivery.driverNote}</Text>
            ) : null}
          </OperationSection>

          {delivery.requiresReturn ? (
            <View style={styles.returnNotice}>
              <Icon name="return" size={21} color={colors.warning} />
              <Text style={styles.returnNoticeText}>
                Esta entrega exige retorno ao local de coleta.
              </Text>
            </View>
          ) : null}

          <View style={styles.trackingNotice}>
            <Icon name="info" size={18} color={colors.actionSoft} />
            <Text style={styles.trackingText}>
              Sua localização é compartilhada durante a operação e para quando você fica offline.
            </Text>
          </View>

          {delivery.status === 'COMPLETED' ? (
            <View style={styles.completedActions}>
              <PrimaryButton
                label="Ver detalhes e histórico"
                variant="outline"
                onPress={() => navigation.navigate('OrderDetail', { orderId: delivery.id })}
              />
              <PrimaryButton label="Voltar para o início" onPress={() => navigation.popToTop()} />
            </View>
          ) : null}
        </ScrollView>

        {action && primaryActionLabel ? (
          <View style={styles.footer}>
            {delivery.status === 'ACCEPTED' ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Devolver para a fila"
                disabled={controlsBusy}
                onPress={() => setReturnOpen(true)}
                style={({ pressed }) => [
                  styles.returnQueueButton,
                  pressed && !controlsBusy && styles.pressed,
                  controlsBusy && styles.disabled,
                ]}
              >
                <Text style={styles.returnQueueText}>Devolver à fila</Text>
              </Pressable>
            ) : null}

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={primaryActionLabel}
              disabled={primaryBusy}
              onPress={handlePrimaryAction}
              style={({ pressed }) => [
                styles.footerPrimary,
                pressed && !primaryBusy && styles.pressed,
                primaryBusy && styles.disabled,
              ]}
            >
              {operationBusy ? (
                <ActivityIndicator color={colors.actionText} />
              ) : (
                <Text style={styles.footerPrimaryText}>{primaryActionLabel}</Text>
              )}
            </Pressable>

            {action ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Abrir opções da entrega"
                disabled={controlsBusy}
                onPress={() => setActionMenuOpen(true)}
                style={({ pressed }) => [
                  styles.warningButton,
                  pressed && !controlsBusy && styles.pressed,
                  controlsBusy && styles.disabled,
                ]}
              >
                <Text style={styles.warningGlyph}>{'⚠'}</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </BottomSheet>

      <ConfirmationModal
        visible={deliverConfirmationOpen}
        title="Confirme a entrega"
        description="Este pedido foi criado sem endereço de destino. Ao confirmar, sua localização atual será registrada como destino e usada para calcular o valor da entrega."
        confirmLabel={operationBusy ? 'Capturando GPS...' : 'Confirmar com GPS'}
        disabled={controlsBusy}
        onConfirm={() => runOperation('deliver').catch(() => undefined)}
        onCancel={() => setDeliverConfirmationOpen(false)}
      />

      <Modal
        visible={actionMenuOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setActionMenuOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Opções da entrega</Text>
            <Text style={styles.modalHint}>Escolha o que precisa fazer com este pedido.</Text>

            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setActionMenuOpen(false);
                setCancelOpen(true);
              }}
              style={({ pressed }) => [styles.actionOption, pressed && styles.pressed]}
            >
              <Icon name="close" size={24} color={colors.danger} />
              <View style={styles.actionOptionCopy}>
                <Text style={[styles.actionOptionTitle, styles.dangerText]}>Cancelar entrega</Text>
                <Text style={styles.actionOptionDescription}>
                  Encerra o pedido e avisa a loja e a administração.
                </Text>
              </View>
            </Pressable>

            {delivery.status === 'COLLECTED' ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setActionMenuOpen(false);
                  setProblemOpen(true);
                }}
                style={({ pressed }) => [styles.actionOption, pressed && styles.pressed]}
              >
                <Text style={styles.actionOptionGlyph}>!</Text>
                <View style={styles.actionOptionCopy}>
                  <Text style={styles.actionOptionTitle}>Problema na entrega</Text>
                  <Text style={styles.actionOptionDescription}>
                    Mantém o pedido com você e orienta a devolução à loja.
                  </Text>
                </View>
              </Pressable>
            ) : null}

            <PrimaryButton
              label="Voltar"
              variant="outline"
              disabled={controlsBusy}
              onPress={() => setActionMenuOpen(false)}
            />
          </View>
        </View>
      </Modal>

      <ConfirmationModal
        visible={returnOpen}
        title="Devolver para a fila?"
        description="O pedido ficará disponível para outro motoboy. Tem certeza?"
        confirmLabel={operationBusy ? 'Devolvendo...' : 'Sim, devolver'}
        disabled={controlsBusy}
        onConfirm={() => runOperation('return-to-queue').catch(() => undefined)}
        onCancel={() => setReturnOpen(false)}
      />

      <ConfirmationModal
        visible={cancelOpen}
        title="Cancelar esta entrega?"
        description="A entrega será cancelada e a loja e a administração serão avisadas. Essa ação não pode ser desfeita."
        confirmLabel={operationBusy ? 'Cancelando...' : 'Sim, cancelar'}
        disabled={controlsBusy}
        onConfirm={() => runOperation('cancel').catch(() => undefined)}
        onCancel={() => setCancelOpen(false)}
      />

      <ConfirmationModal
        visible={problemOpen}
        title="Informar problema?"
        description="Você continuará responsável pelo pedido. A ocorrência será registrada, o valor normal da entrega será mantido e você deverá devolver a mercadoria à loja para concluir o repasse."
        confirmLabel={
          operationBusy
            ? delivery.destinationKnownAtCreation
              ? 'Registrando...'
              : 'Capturando localização...'
            : 'Sim, informar'
        }
        disabled={controlsBusy}
        onConfirm={() =>
          runOperation('fail', 'Problema informado pelo motoboy.').catch(() => undefined)
        }
        onCancel={() => setProblemOpen(false)}
      />
    </SafeAreaView>
  );
}

function OperationSection({
  icon,
  title,
  children,
}: {
  icon: 'money' | 'pin' | 'person';
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Icon name={icon} size={28} color={colors.actionSoft} />
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

function ConfirmationModal({
  visible,
  title,
  description,
  confirmLabel,
  disabled,
  onConfirm,
  onCancel,
}: {
  visible: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  disabled: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <View style={styles.confirmIcon}>
            <Icon name="pin" size={30} color={colors.actionSoft} />
          </View>
          <Text style={styles.modalTitle}>{title}</Text>
          <Text style={styles.modalHint}>{description}</Text>
          <View style={styles.modalActions}>
            <PrimaryButton
              label={confirmLabel}
              style={styles.modalButton}
              disabled={disabled}
              onPress={onConfirm}
            />
            <PrimaryButton
              label="Cancelar"
              variant="outline"
              style={styles.modalButton}
              disabled={disabled}
              onPress={onCancel}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.mapBackdrop },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    paddingHorizontal: 24,
    backgroundColor: colors.surface,
  },
  loadErrorText: { color: colors.danger, fontSize: 15, lineHeight: 21, textAlign: 'center' },
  sheet: { flex: 1, marginTop: 74, overflow: 'hidden' },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 20, paddingBottom: 28, gap: 18 },
  successBanner: {
    marginHorizontal: 20,
    marginBottom: 8,
    minHeight: 48,
    borderRadius: 9,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.actionSoft,
  },
  successIcon: {
    width: 25,
    height: 25,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: colors.success,
    alignItems: 'center',
    justifyContent: 'center',
  },
  successText: { flex: 1, color: colors.actionText, fontSize: 14, fontWeight: '700' },
  pendingBanner: {
    marginHorizontal: 20,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.warning,
    borderRadius: 10,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: colors.warningSoft,
  },
  pendingBannerReview: {
    borderColor: colors.danger,
    backgroundColor: colors.dangerSoft,
  },
  pendingBannerCopy: { flex: 1, gap: 2 },
  pendingBannerTitle: { color: colors.ink, fontSize: 14, fontWeight: '800' },
  pendingBannerText: { color: colors.inkSoft, fontSize: 12, lineHeight: 17 },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dateText: { color: colors.ink, fontSize: 16, fontWeight: '700' },
  statusRow: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 42,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  statusGroup: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  statusText: { color: colors.ink, fontSize: 18, fontWeight: '700' },
  brand: { color: colors.danger, fontSize: 19, fontWeight: '800' },
  batchLabel: {
    alignSelf: 'center',
    marginTop: -10,
    color: colors.inkMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  elapsedPanel: {
    alignItems: 'center',
    gap: 8,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  elapsedBadge: {
    minWidth: 86,
    borderRadius: 9,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: colors.countdown,
  },
  elapsedValue: {
    color: colors.actionText,
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  elapsedLabel: { color: colors.ink, fontSize: 17, fontWeight: '700' },
  heroAction: {
    minHeight: 64,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    backgroundColor: colors.action,
  },
  heroActionText: { color: colors.actionText, fontSize: 21, fontWeight: '800' },
  section: { gap: 12 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  sectionTitle: { color: colors.ink, fontSize: 23, fontWeight: '800' },
  valueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 7 },
  valueLabel: { color: colors.ink, fontSize: 15, fontWeight: '700' },
  valueDots: {
    flex: 1,
    borderBottomWidth: 2,
    borderStyle: 'dotted',
    borderBottomColor: colors.inkSoft,
  },
  value: { maxWidth: '44%', color: colors.ink, fontSize: 16, fontWeight: '800' },
  paymentTitle: { color: colors.ink, fontSize: 20, fontWeight: '800', textAlign: 'center' },
  paymentRow: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  paymentValue: { color: colors.ink, fontSize: 17, fontWeight: '700' },
  paymentDetail: { color: colors.inkSoft, fontSize: 13, marginLeft: 39 },
  routeButton: {
    minHeight: 50,
    borderRadius: 11,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    paddingHorizontal: 16,
    backgroundColor: colors.actionSoft,
  },
  routeButtonText: { color: colors.actionText, fontSize: 16, fontWeight: '700' },
  clientRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  clientName: { flex: 1, color: colors.ink, fontSize: 17, fontWeight: '700' },
  phoneRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginLeft: 31 },
  phoneText: { color: colors.link, fontSize: 16, fontWeight: '700' },
  metadata: { color: colors.inkSoft, fontSize: 13, marginLeft: 31 },
  driverNote: {
    color: colors.ink,
    fontSize: 14,
    lineHeight: 20,
    borderRadius: 10,
    padding: 12,
    backgroundColor: colors.surfaceMuted,
  },
  returnNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 10,
    padding: 13,
    backgroundColor: colors.warningSoft,
  },
  returnNoticeText: { flex: 1, color: colors.ink, fontSize: 13, fontWeight: '700' },
  trackingNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderRadius: 10,
    padding: 12,
    backgroundColor: colors.actionSoftTint,
  },
  trackingText: { flex: 1, color: colors.inkSoft, fontSize: 12, lineHeight: 17 },
  completedActions: { gap: 10 },
  footer: {
    minHeight: 84,
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    backgroundColor: colors.surface,
    elevation: 16,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 9,
    shadowOffset: { width: 0, height: -2 },
  },
  returnQueueButton: {
    flex: 0.9,
    minHeight: 58,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    backgroundColor: colors.warning,
  },
  returnQueueText: {
    color: colors.actionText,
    fontSize: 14,
    fontWeight: '800',
    textAlign: 'center',
  },
  footerPrimary: {
    flex: 1.35,
    minHeight: 58,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    backgroundColor: colors.action,
  },
  footerPrimaryText: {
    color: colors.actionText,
    fontSize: 15,
    fontWeight: '800',
    textAlign: 'center',
  },
  warningButton: {
    width: 58,
    minHeight: 58,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.warning,
  },
  warningGlyph: { color: colors.actionText, fontSize: 27, lineHeight: 30 },
  pressed: { opacity: 0.82 },
  disabled: { opacity: 0.5 },
  modalBackdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  modalCard: {
    width: '100%',
    maxWidth: 480,
    maxHeight: '88%',
    borderRadius: 24,
    padding: 20,
    gap: 12,
    backgroundColor: colors.surface,
  },
  confirmIcon: {
    alignSelf: 'center',
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.actionSoftTint,
  },
  modalTitle: { color: colors.ink, fontSize: 22, fontWeight: '800', textAlign: 'center' },
  modalHint: {
    color: colors.inkSoft,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 8,
  },
  actionOption: {
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    borderWidth: 1,
    borderColor: colors.divider,
    borderRadius: 14,
    paddingHorizontal: 15,
    paddingVertical: 12,
    backgroundColor: colors.surfaceMuted,
  },
  actionOptionGlyph: {
    width: 24,
    color: colors.warning,
    fontSize: 26,
    lineHeight: 28,
    fontWeight: '900',
    textAlign: 'center',
  },
  actionOptionCopy: { flex: 1, gap: 3 },
  actionOptionTitle: { color: colors.ink, fontSize: 16, fontWeight: '800' },
  actionOptionDescription: { color: colors.inkSoft, fontSize: 12, lineHeight: 17 },
  dangerText: { color: colors.danger },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 12 },
  modalButton: { flex: 1 },
});
