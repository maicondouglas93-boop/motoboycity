import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ApiError } from '@motoboycity/api-client';
import type { DeliveryAddressItem, DeliveryDetail, DeliveryStatus } from '@motoboycity/types';
import { BottomSheet } from '../components/BottomSheet';
import { Icon } from '../components/Icon';
import { MapBackdrop } from '../components/MapBackdrop';
import { PrimaryButton } from '../components/PrimaryButton';
import { RouteTimeline } from '../components/RouteTimeline';
import { SheetHeader } from '../components/SheetHeader';
import { deliveriesApi } from '../lib/apiClient';
import { getActiveDeliveries } from '../lib/activeDeliveries';
import {
  deliveryOperationCopy,
  deliveryPaymentLabel,
  formatDeliveryAddress,
  formatElapsedTime,
  formatOperationDateTime,
  navigationDestination,
} from '../lib/deliveryOperation';
import { syncDeliveryTracking } from '../lib/deliveryTracking';
import { captureCurrentLocation, LocationError } from '../lib/location';
import { session } from '../lib/session';
import type { RootStackParamList } from '../navigation/types';
import { useDispatchStore } from '../store/dispatchStore';
import { colors } from '../theme/colors';

type Props = NativeStackScreenProps<RootStackParamList, 'DeliveryOperation'>;
type Operation =
  | 'collect'
  | 'deliver'
  | 'return'
  | 'fail'
  | 'return-to-queue'
  | 'collect-forgot'
  | 'deliver-forgot'
  | null;

const FORGOT_OPTIONS = [5, 10, 15, 20, 30, 45, 60] as const;

type FailureReason = 'RECIPIENT_ABSENT' | 'ADDRESS_NOT_FOUND' | 'RECIPIENT_REFUSED' | 'OTHER';

const FAILURE_REASONS: { value: FailureReason; label: string }[] = [
  { value: 'RECIPIENT_ABSENT', label: 'Ninguém atendeu' },
  { value: 'ADDRESS_NOT_FOUND', label: 'Não encontrei o endereço' },
  { value: 'RECIPIENT_REFUSED', label: 'O cliente recusou' },
  { value: 'OTHER', label: 'Outro motivo' },
];

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

function operationWasApplied(operation: Exclude<Operation, null>, delivery: DeliveryDetail): boolean {
  const hasTransition = (fromStatus: DeliveryStatus, toStatuses: DeliveryStatus[]) =>
    delivery.statusHistory.some(
      (item) => item.fromStatus === fromStatus && toStatuses.includes(item.toStatus),
    );

  if (operation === 'collect' || operation === 'collect-forgot') {
    return ['COLLECTED', 'DELIVERED', 'FAILED', 'COMPLETED'].includes(delivery.status);
  }
  if (operation === 'deliver' || operation === 'deliver-forgot') {
    return hasTransition('COLLECTED', ['DELIVERED', 'COMPLETED']);
  }
  if (operation === 'fail') {
    return delivery.statusHistory.some((item) => item.toStatus === 'FAILED');
  }
  if (operation === 'return') {
    return hasTransition('DELIVERED', ['COMPLETED']) || hasTransition('FAILED', ['COMPLETED']);
  }
  return false;
}

export function DeliveryOperationScreen({ navigation, route }: Props) {
  const [delivery, setDelivery] = useState<DeliveryDetail | null>(null);
  const [failureOpen, setFailureOpen] = useState(false);
  const [failureReason, setFailureReason] = useState<FailureReason | null>(null);
  const [failureNote, setFailureNote] = useState('');
  const [returnOpen, setReturnOpen] = useState(false);
  const [returnReason, setReturnReason] = useState('');
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotMinutes, setForgotMinutes] = useState<number | null>(null);
  const [deliverConfirmationOpen, setDeliverConfirmationOpen] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(Date.now());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [operation, setOperation] = useState<Operation>(null);
  const operationInFlight = useRef(false);
  const setActiveDeliveries = useDispatchStore((state) => state.setActiveDeliveries);

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

  useEffect(() => {
    loadDelivery().catch(() => undefined);
  }, [loadDelivery]);

  useEffect(() => {
    if (delivery?.status !== 'ACCEPTED') return undefined;

    setNowMs(Date.now());
    const timer = setInterval(() => setNowMs(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, [delivery?.status]);

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

  async function runOperation(nextOperation: Exclude<Operation, null>) {
    if (!delivery || operationInFlight.current) return;
    operationInFlight.current = true;
    setOperation(nextOperation);
    let token: string | null = null;
    try {
      token = await session.getToken();
      if (!token) return;

      if (nextOperation === 'collect') {
        const result = await deliveriesApi.collect(token, delivery.id);
        setDelivery(result.deliveries.find((item) => item.id === delivery.id) ?? null);
        setSuccessMessage('O pedido foi marcado como coletado!');
      } else if (nextOperation === 'collect-forgot' || nextOperation === 'deliver-forgot') {
        const occurredAt = new Date(Date.now() - (forgotMinutes ?? 0) * 60_000).toISOString();
        if (nextOperation === 'collect-forgot') {
          const result = await deliveriesApi.collect(token, delivery.id, { occurredAt });
          setDelivery(result.deliveries.find((item) => item.id === delivery.id) ?? null);
          setSuccessMessage('A coleta foi registrada!');
        } else {
          setDelivery(await deliveriesApi.deliver(token, delivery.id, { occurredAt }));
          setSuccessMessage('A entrega foi registrada!');
        }
        setForgotOpen(false);
        setForgotMinutes(null);
      } else if (nextOperation === 'deliver') {
        /**
         * A posicao vai SEMPRE, e nao so quando o destino e definido por GPS.
         *
         * Com destino informado ela serve para o servidor conferir que o
         * motoboy estava mesmo no endereco. Sem destino informado ela E o
         * endereco. Sao usos diferentes da mesma captura, e nos dois casos a
         * ausencia da posicao enfraquece a entrega.
         */
        const fix = await captureCurrentLocation();
        setDelivery(
          await deliveriesApi.deliver(token, delivery.id, {
            lat: fix.lat,
            lng: fix.lng,
            accuracy: fix.accuracy,
          }),
        );
        setDeliverConfirmationOpen(false);
        setSuccessMessage('O pedido foi marcado como entregue!');
      } else if (nextOperation === 'return-to-queue') {
        await deliveriesApi.returnToQueue(token, delivery.id, { reason: returnReason.trim() });
        setReturnOpen(false);
        setReturnReason('');
        const remainingDeliveries = await refreshActiveDeliveries(token);
        await syncDeliveryTracking(
          token,
          remainingDeliveries.map((item) => item.id),
        ).catch(() => undefined);
        navigation.popToTop();
        return;
      } else if (nextOperation === 'fail') {
        const fix = await captureCurrentLocation();
        setDelivery(
          await deliveriesApi.fail(token, delivery.id, {
            reason: failureReason ?? 'OTHER',
            ...(failureNote.trim() && { note: failureNote.trim() }),
            lat: fix.lat,
            lng: fix.lng,
            ...(fix.accuracy !== undefined && { accuracy: fix.accuracy }),
          }),
        );
        setFailureOpen(false);
        setFailureReason(null);
        setFailureNote('');
        setSuccessMessage('Ocorrência registrada. Leve a mercadoria de volta à loja.');
      } else {
        const fix = await captureCurrentLocation();
        const result = await deliveriesApi.completeReturn(token, delivery.id, fix);
        setDelivery(result.deliveries.find((item) => item.id === delivery.id) ?? null);
        setSuccessMessage('Retorno concluído!');
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
      if (nextOperation === 'return-to-queue') {
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
  const busy = operation !== null;
  const copy = deliveryOperationCopy(delivery.status);
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
    if (!action || busy) return;
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
              message: 'Sua localização atual será validada antes de concluir a entrega.',
              label: 'Confirmar entrega',
            }
          : {
              title: 'Confirmar retorno?',
              message: 'Confirme somente quando estiver novamente no local de coleta.',
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
        <SheetHeader
          title={`Pedido #${delivery.displayNumber}`}
          onBack={() => navigation.goBack()}
        />

        {successMessage ? (
          <View style={styles.successBanner} accessibilityLiveRegion="polite">
            <View style={styles.successIcon}>
              <Icon name="check" size={16} color={colors.success} />
            </View>
            <Text style={styles.successText}>{successMessage}</Text>
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

          {delivery.status === 'COLLECTED' && delivery.destinationKnownAtCreation ? (
            <Pressable onPress={() => setForgotOpen(true)} disabled={busy}>
              <Text style={styles.secondaryLink}>Esqueci de marcar a entrega</Text>
            </Pressable>
          ) : null}

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

        {action && copy.primaryActionLabel ? (
          <View style={styles.footer}>
            {delivery.status === 'ACCEPTED' ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Devolver para a fila"
                disabled={busy}
                onPress={() => setReturnOpen(true)}
                style={({ pressed }) => [
                  styles.returnQueueButton,
                  pressed && !busy && styles.pressed,
                  busy && styles.disabled,
                ]}
              >
                <Text style={styles.returnQueueText}>Devolver à fila</Text>
              </Pressable>
            ) : null}

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={copy.primaryActionLabel}
              disabled={busy}
              onPress={handlePrimaryAction}
              style={({ pressed }) => [
                styles.footerPrimary,
                pressed && !busy && styles.pressed,
                busy && styles.disabled,
              ]}
            >
              {busy ? (
                <ActivityIndicator color={colors.actionText} />
              ) : (
                <Text style={styles.footerPrimaryText}>{copy.primaryActionLabel}</Text>
              )}
            </Pressable>

            {delivery.status === 'ACCEPTED' || delivery.status === 'COLLECTED' ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  delivery.status === 'ACCEPTED'
                    ? 'Esqueci de marcar a coleta'
                    : 'Informar problema na entrega'
                }
                disabled={busy}
                onPress={() =>
                  delivery.status === 'ACCEPTED' ? setForgotOpen(true) : setFailureOpen(true)
                }
                style={({ pressed }) => [
                  styles.warningButton,
                  pressed && !busy && styles.pressed,
                  busy && styles.disabled,
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
        confirmLabel={busy ? 'Capturando GPS...' : 'Confirmar com GPS'}
        disabled={busy}
        onConfirm={() => runOperation('deliver').catch(() => undefined)}
        onCancel={() => setDeliverConfirmationOpen(false)}
      />

      <Modal
        visible={failureOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setFailureOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.modalTitle}>O que aconteceu?</Text>
              <Text style={styles.modalHint}>
                A mercadoria volta para a loja e você recebe a corrida normalmente.
              </Text>

              <View style={styles.reasonList}>
                {FAILURE_REASONS.map((item) => {
                  const selected = failureReason === item.value;
                  return (
                    <Pressable
                      key={item.value}
                      onPress={() => setFailureReason(item.value)}
                      style={[styles.reason, selected && styles.reasonSelected]}
                    >
                      <Text style={[styles.reasonLabel, selected && styles.reasonLabelSelected]}>
                        {item.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {failureReason === 'OTHER' ? (
                <TextInput
                  style={styles.noteInput}
                  placeholder="Descreva o que aconteceu"
                  placeholderTextColor={colors.inkMuted}
                  value={failureNote}
                  onChangeText={setFailureNote}
                  multiline
                />
              ) : null}

              <View style={styles.modalActions}>
                <PrimaryButton
                  label={busy ? 'Registrando...' : 'Registrar e voltar à loja'}
                  style={styles.modalButton}
                  disabled={
                    busy || !failureReason || (failureReason === 'OTHER' && !failureNote.trim())
                  }
                  onPress={() => runOperation('fail').catch(() => undefined)}
                />
                <PrimaryButton
                  label="Cancelar"
                  variant="outline"
                  style={styles.modalButton}
                  disabled={busy}
                  onPress={() => setFailureOpen(false)}
                />
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal
        visible={forgotOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setForgotOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.modalTitle}>Há quanto tempo aconteceu?</Text>
              <Text style={styles.modalHint}>
                O horário informado vale para o relatório. O registro também guarda a hora em que
                você confirmou a ação.
              </Text>

              <View style={styles.minutesGrid}>
                {FORGOT_OPTIONS.map((minutes) => {
                  const selected = forgotMinutes === minutes;
                  return (
                    <Pressable
                      key={minutes}
                      onPress={() => setForgotMinutes(minutes)}
                      style={[styles.minuteOption, selected && styles.reasonSelected]}
                    >
                      <Text style={[styles.reasonLabel, selected && styles.reasonLabelSelected]}>
                        {minutes} min
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <View style={styles.modalActions}>
                <PrimaryButton
                  label={busy ? 'Registrando...' : 'Confirmar'}
                  style={styles.modalButton}
                  disabled={busy || forgotMinutes === null}
                  onPress={() =>
                    runOperation(
                      delivery.status === 'ACCEPTED' ? 'collect-forgot' : 'deliver-forgot',
                    ).catch(() => undefined)
                  }
                />
                <PrimaryButton
                  label="Cancelar"
                  variant="outline"
                  style={styles.modalButton}
                  disabled={busy}
                  onPress={() => setForgotOpen(false)}
                />
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal
        visible={returnOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setReturnOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Devolver para a fila?</Text>
            <Text style={styles.modalHint}>
              O pedido volta a ficar disponível para outro motoboy. A loja e a administração verão o
              motivo informado.
            </Text>
            <TextInput
              style={styles.noteInput}
              placeholder="Ex.: moto quebrou, a loja não tinha o produto"
              placeholderTextColor={colors.inkMuted}
              value={returnReason}
              onChangeText={setReturnReason}
              multiline
            />
            <View style={styles.modalActions}>
              <PrimaryButton
                label={busy ? 'Devolvendo...' : 'Devolver para a fila'}
                style={styles.modalButton}
                disabled={busy || returnReason.trim().length < 5}
                onPress={() => runOperation('return-to-queue').catch(() => undefined)}
              />
              <PrimaryButton
                label="Cancelar"
                variant="outline"
                style={styles.modalButton}
                disabled={busy}
                onPress={() => setReturnOpen(false)}
              />
            </View>
          </View>
        </View>
      </Modal>
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
  secondaryLink: {
    color: colors.actionSoft,
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
    textDecorationLine: 'underline',
  },
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
  reasonList: { gap: 8 },
  reason: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.divider,
    borderRadius: 11,
    paddingHorizontal: 14,
    justifyContent: 'center',
  },
  reasonSelected: {
    borderColor: colors.actionSoft,
    borderWidth: 2,
    backgroundColor: colors.actionSoftTint,
  },
  reasonLabel: { color: colors.ink, fontSize: 15, fontWeight: '600' },
  reasonLabelSelected: { color: colors.actionSoft, fontWeight: '800' },
  noteInput: {
    minHeight: 82,
    borderRadius: 11,
    padding: 12,
    color: colors.ink,
    backgroundColor: colors.surfaceMuted,
    textAlignVertical: 'top',
    fontSize: 15,
  },
  minutesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  minuteOption: {
    minWidth: 72,
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.divider,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 12 },
  modalButton: { flex: 1 },
});
