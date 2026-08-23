import { useCallback, useEffect, useState } from 'react';
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
  useColorScheme,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ApiError } from '@motoboycity/api-client';
import type { DeliveryAddressItem, DeliveryDetail } from '@motoboycity/types';
import { Card } from '../components/Card';
import { PrimaryButton } from '../components/PrimaryButton';
import { ScreenHeader } from '../components/ScreenHeader';
import { deliveriesApi } from '../lib/apiClient';
import { getActiveDeliveries } from '../lib/activeDeliveries';
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

/**
 * "Ha quantos minutos?" em vez de seletor de data e hora.
 *
 * E como a pessoa lembra de verdade — "coletei uns vinte minutos atras" — e
 * resolve em um toque, de moto, sem teclado. Um seletor de data exigiria
 * escolher dia, hora e minuto para um evento que quase sempre foi na ultima
 * meia hora, e ainda abriria a porta para digitar o dia errado.
 */
const FORGOT_OPTIONS = [5, 10, 15, 20, 30, 45, 60] as const;

type FailureReason = 'RECIPIENT_ABSENT' | 'ADDRESS_NOT_FOUND' | 'RECIPIENT_REFUSED' | 'OTHER';

const FAILURE_REASONS: { value: FailureReason; label: string }[] = [
  { value: 'RECIPIENT_ABSENT', label: 'Ninguém atendeu' },
  { value: 'ADDRESS_NOT_FOUND', label: 'Não encontrei o endereço' },
  { value: 'RECIPIENT_REFUSED', label: 'O cliente recusou' },
  { value: 'OTHER', label: 'Outro motivo' },
];

const currencyFormatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

function formatAddress(address: DeliveryAddressItem | undefined): string {
  if (!address) return 'Nao informado';
  const structured = [address.street, address.number, address.city, address.state]
    .filter(Boolean)
    .join(', ');
  if (structured) return structured;
  if (address.lat !== null && address.lng !== null) return 'Destino definido no local da entrega';
  return 'Nao informado';
}

function navigationDestination(address: DeliveryAddressItem | undefined): string | null {
  if (!address) return null;
  if (address.lat !== null && address.lng !== null) return `${address.lat},${address.lng}`;
  const structured = [
    address.street,
    address.number,
    address.complement,
    address.city,
    address.state,
    address.zip,
  ]
    .filter(Boolean)
    .join(', ');
  return structured || null;
}

function labelForStatus(status: DeliveryDetail['status']): string {
  switch (status) {
    case 'ACCEPTED':
      return 'A caminho da coleta';
    case 'COLLECTED':
      return 'Em entrega';
    case 'DELIVERED':
      return 'Retorno pendente';
    case 'COMPLETED':
      return 'Entrega concluida';
    default:
      return status;
  }
}

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

export function DeliveryOperationScreen({ navigation, route }: Props) {
  const isDark = useColorScheme() === 'dark';
  const [delivery, setDelivery] = useState<DeliveryDetail | null>(null);
  const [failureOpen, setFailureOpen] = useState(false);
  const [failureReason, setFailureReason] = useState<FailureReason | null>(null);
  const [failureNote, setFailureNote] = useState('');
  const [returnOpen, setReturnOpen] = useState(false);
  const [returnReason, setReturnReason] = useState('');
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotMinutes, setForgotMinutes] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [operation, setOperation] = useState<Operation>(null);
  const setActiveDeliveries = useDispatchStore((state) => state.setActiveDeliveries);

  const text = isDark ? colors.textDark : colors.text;
  const muted = isDark ? colors.mutedDark : colors.muted;

  const loadDelivery = useCallback(async () => {
    const token = await session.getToken();
    if (!token) return;

    try {
      setDelivery(await deliveriesApi.detail(token, route.params.deliveryId));
    } catch (error) {
      Alert.alert(
        'Pedido indisponivel',
        error instanceof ApiError ? error.message : 'Nao foi possivel carregar este pedido.',
      );
      navigation.goBack();
    } finally {
      setLoading(false);
    }
  }, [navigation, route.params.deliveryId]);

  useEffect(() => {
    loadDelivery().catch(() => undefined);
  }, [loadDelivery]);

  async function refreshActiveDeliveries(token: string) {
    const deliveries = await getActiveDeliveries(token);
    setActiveDeliveries(deliveries);
    return deliveries;
  }

  async function runOperation(nextOperation: Exclude<Operation, null>) {
    if (!delivery || operation) return;
    const token = await session.getToken();
    if (!token) return;

    setOperation(nextOperation);
    try {
      if (nextOperation === 'collect') {
        const result = await deliveriesApi.collect(token, delivery.id);
        setDelivery(result.deliveries.find((item) => item.id === delivery.id) ?? null);
      } else if (nextOperation === 'collect-forgot' || nextOperation === 'deliver-forgot') {
        const occurredAt = new Date(Date.now() - (forgotMinutes ?? 0) * 60_000).toISOString();
        if (nextOperation === 'collect-forgot') {
          const result = await deliveriesApi.collect(token, delivery.id, { occurredAt });
          setDelivery(result.deliveries.find((item) => item.id === delivery.id) ?? null);
        } else {
          setDelivery(await deliveriesApi.deliver(token, delivery.id, { occurredAt }));
        }
        setForgotOpen(false);
        setForgotMinutes(null);
      } else if (nextOperation === 'deliver') {
        const fix = delivery.destinationKnownAtCreation
          ? undefined
          : await captureCurrentLocation();
        setDelivery(
          await deliveriesApi.deliver(
            token,
            delivery.id,
            fix ? { lat: fix.lat, lng: fix.lng, accuracy: fix.accuracy } : {},
          ),
        );
      } else if (nextOperation === 'return-to-queue') {
        await deliveriesApi.returnToQueue(token, delivery.id, { reason: returnReason.trim() });
        setReturnOpen(false);
        setReturnReason('');
        /**
         * O pedido deixou de ser dele e voltou para a vitrine. Sair da tela em
         * vez de ficar mostrando uma entrega que agora e de outro — e o
         * rastreamento precisa parar junto, senao o app segue mandando posicao
         * de uma corrida que ele nao esta mais fazendo.
         */
        const restantes = await refreshActiveDeliveries(token);
        await syncDeliveryTracking(
          token,
          restantes.map((item) => item.id),
        ).catch(() => undefined);
        navigation.popToTop();
        return;
      } else if (nextOperation === 'fail') {
        // O GPS aqui e a unica prova de que o motoboy chegou ao destino antes
        // de declarar insucesso — sem ele, "nao consegui entregar" seria
        // indistinguivel de "nao fui".
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
      } else {
        const fix = await captureCurrentLocation();
        const result = await deliveriesApi.completeReturn(token, delivery.id, fix);
        setDelivery(result.deliveries.find((item) => item.id === delivery.id) ?? null);
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
      Alert.alert(
        'Acao nao concluida',
        error instanceof ApiError || error instanceof LocationError
          ? error.message
          : 'Nao foi possivel concluir esta acao. Tente novamente.',
      );
    } finally {
      setOperation(null);
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={[styles.centered, isDark ? styles.safeAreaDark : styles.safeAreaLight]}>
        <ActivityIndicator color={colors.primary} />
      </SafeAreaView>
    );
  }

  if (!delivery) return null;

  const pickup = delivery.addresses.find((address) => address.type === 'PICKUP');
  const dropoff = delivery.addresses.find((address) => address.type === 'DROPOFF');
  const busy = operation !== null;
  const action =
    delivery.status === 'ACCEPTED'
      ? { kind: 'collect' as const, label: 'Confirmar coleta' }
      : delivery.status === 'COLLECTED'
        ? {
            kind: 'deliver' as const,
            label: delivery.destinationKnownAtCreation
              ? 'Marcar como entregue'
              : 'Capturar GPS e concluir entrega',
          }
        : delivery.status === 'DELIVERED'
          ? { kind: 'return' as const, label: 'Capturar GPS e concluir retorno' }
          : delivery.status === 'FAILED'
            ? // Mesma confirmacao de retorno: a entrega nao deu certo, mas o
              // pedido so fecha quando a mercadoria voltar para a loja.
              { kind: 'return' as const, label: 'Confirmar devolução na loja' }
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
  const routeLabel =
    delivery.status === 'COLLECTED' ? 'Abrir rota para o destino' : 'Abrir rota para a coleta';

  async function openExternalNavigation() {
    if (!routeDestination) {
      Alert.alert('Rota indisponivel', 'Este pedido ainda nao possui um endereco para navegacao.');
      return;
    }
    try {
      await Linking.openURL(
        `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(routeDestination)}`,
      );
    } catch {
      Alert.alert(
        'Nao foi possivel abrir a navegacao',
        'Verifique se existe um aplicativo de mapas instalado.',
      );
    }
  }

  return (
    <SafeAreaView style={isDark ? styles.safeAreaDark : styles.safeAreaLight}>
      <ScreenHeader
        title={`Pedido #${delivery.displayNumber}`}
        onBack={delivery.status === 'COMPLETED' ? () => navigation.goBack() : undefined}
      />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.statusRow}>
          <Text style={[styles.status, { color: colors.primary }]}>
            {labelForStatus(delivery.status)}
          </Text>
          {delivery.batchId && <Text style={[styles.batch, { color: muted }]}>Pedido em lote</Text>}
        </View>

        {action && (
          <Card>
            <Text style={[styles.sectionTitle, { color: text }]}>Rastreamento da entrega</Text>
            <Text style={[styles.trackingNotice, { color: muted }]}>
              Sua localização é compartilhada enquanto você estiver online, inclusive com o
              aplicativo em segundo plano. Ela para quando você ficar offline.
            </Text>
          </Card>
        )}

        <Card>
          <Text style={[styles.sectionTitle, { color: text }]}>Coleta</Text>
          <Text style={[styles.address, { color: text }]}>{formatAddress(pickup)}</Text>
          <Text style={[styles.company, { color: muted }]}>{delivery.companyName}</Text>
        </Card>

        <Card>
          <Text style={[styles.sectionTitle, { color: text }]}>Destino</Text>
          <Text style={[styles.address, { color: text }]}>
            {delivery.destinationKnownAtCreation
              ? formatAddress(dropoff)
              : 'Definido pelo GPS no momento da entrega'}
          </Text>
        </Card>

        <Card>
          <Text style={[styles.sectionTitle, { color: text }]}>Dados da entrega</Text>
          <Text style={[styles.address, { color: text }]}>
            {delivery.recipientName || 'Destinatário não informado'}
          </Text>
          {delivery.recipientPhone && (
            <Text style={[styles.metadata, { color: muted }]}>{delivery.recipientPhone}</Text>
          )}
          {delivery.externalOrderNumber && (
            <Text style={[styles.metadata, { color: muted }]}>
              Pedido externo: {delivery.externalOrderNumber}
            </Text>
          )}
          <Text style={[styles.metadata, { color: muted }]}>
            Pagamento do cliente: {customerPaymentLabel(delivery.customerPaymentMethod)}
          </Text>
          {delivery.driverNote && (
            <Text style={[styles.driverNote, { color: text }]}>{delivery.driverNote}</Text>
          )}
        </Card>

        <Card>
          <Text style={[styles.sectionTitle, { color: text }]}>Seu ganho</Text>
          <Text style={[styles.value, { color: text }]}>
            {delivery.driverValue === null
              ? 'A calcular na entrega'
              : currencyFormatter.format(delivery.driverValue)}
          </Text>
          {delivery.distanceKm !== null && (
            <Text style={{ color: muted }}>{delivery.distanceKm.toFixed(1)} km</Text>
          )}
          {delivery.requiresReturn && (
            <Text style={[styles.returnNotice, { color: colors.warning }]}>
              Esta entrega exige retorno ao local de coleta.
            </Text>
          )}
        </Card>
      </ScrollView>

      <View style={styles.actions}>
        {routeDestination && (
          <PrimaryButton label={routeLabel} variant="outline" onPress={openExternalNavigation} />
        )}
        {action ? (
          <>
            <PrimaryButton
              label={busy ? 'Atualizando...' : action.label}
              onPress={busy ? undefined : () => runOperation(action.kind)}
            />
            {/* So depois de coletar: antes disso nao ha mercadoria em posse do
                motoboy, entao nao existe o que devolver. */}
            {delivery.status === 'COLLECTED' && (
              <PrimaryButton
                label="Não consegui entregar"
                variant="outline"
                onPress={busy ? undefined : () => setFailureOpen(true)}
              />
            )}
            {/*
              Esqueceu de tocar na hora. Nao aparece quando o preco vem do GPS
              da entrega: ali a coordenada do momento E o valor, entao o servidor
              recusa — mostrar um botao que sempre da erro seria pior que nao ter.
            */}
            {(delivery.status === 'ACCEPTED' ||
              (delivery.status === 'COLLECTED' && delivery.destinationKnownAtCreation)) && (
              <PrimaryButton
                label={
                  delivery.status === 'ACCEPTED'
                    ? 'Esqueci de marcar a coleta'
                    : 'Esqueci de marcar a entrega'
                }
                variant="outline"
                onPress={busy ? undefined : () => setForgotOpen(true)}
              />
            )}
            {/* So antes da coleta: dali em diante a mercadoria esta com ele, e
                o caminho passa a ser o insucesso, que a devolve para a loja. */}
            {delivery.status === 'ACCEPTED' && (
              <PrimaryButton
                label="Devolver para a fila"
                variant="outline"
                onPress={busy ? undefined : () => setReturnOpen(true)}
              />
            )}
          </>
        ) : (
          <>
            {delivery.status === 'COMPLETED' && (
              <PrimaryButton
                label="Ver detalhes e histórico"
                variant="outline"
                onPress={() => navigation.navigate('OrderDetail', { orderId: delivery.id })}
              />
            )}
            <PrimaryButton label="Voltar para o inicio" onPress={() => navigation.popToTop()} />
          </>
        )}
      </View>

      <Modal
        visible={failureOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setFailureOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, isDark ? styles.modalCardDark : styles.modalCardLight]}>
            <Text style={[styles.modalTitle, { color: text }]}>O que aconteceu?</Text>
            <Text style={[styles.modalHint, { color: muted }]}>
              A mercadoria volta para a loja e você recebe a corrida normalmente.
            </Text>

            {FAILURE_REASONS.map((item) => {
              const selected = failureReason === item.value;
              return (
                <Pressable
                  key={item.value}
                  onPress={() => setFailureReason(item.value)}
                  style={[styles.reason, selected && styles.reasonSelected]}
                >
                  <Text style={[styles.reasonLabel, { color: selected ? colors.primary : text }]}>
                    {item.label}
                  </Text>
                </Pressable>
              );
            })}

            {failureReason === 'OTHER' && (
              <TextInput
                style={[styles.noteInput, { color: text }]}
                placeholder="Descreva o que aconteceu"
                placeholderTextColor={muted}
                value={failureNote}
                onChangeText={setFailureNote}
                multiline
              />
            )}

            <PrimaryButton
              label={busy ? 'Registrando...' : 'Registrar e voltar para a loja'}
              onPress={
                busy || !failureReason || (failureReason === 'OTHER' && !failureNote.trim())
                  ? undefined
                  : () => runOperation('fail')
              }
            />
            <PrimaryButton
              label="Cancelar"
              variant="outline"
              onPress={busy ? undefined : () => setFailureOpen(false)}
            />
          </View>
        </View>
      </Modal>

      <Modal
        visible={forgotOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setForgotOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, isDark ? styles.modalCardDark : styles.modalCardLight]}>
            <Text style={[styles.modalTitle, { color: text }]}>Há quanto tempo aconteceu?</Text>
            <Text style={[styles.modalHint, { color: muted }]}>
              O horário informado vale para o relatório da operação. O registro guarda também a hora
              em que você tocou aqui.
            </Text>

            {FORGOT_OPTIONS.map((minutos) => {
              const selecionado = forgotMinutes === minutos;
              return (
                <Pressable
                  key={minutos}
                  onPress={() => setForgotMinutes(minutos)}
                  style={[styles.reason, selecionado && styles.reasonSelected]}
                >
                  <Text
                    style={[styles.reasonLabel, { color: selecionado ? colors.primary : text }]}
                  >
                    {minutos} minutos atrás
                  </Text>
                </Pressable>
              );
            })}

            <PrimaryButton
              label={busy ? 'Registrando...' : 'Confirmar'}
              onPress={
                busy || forgotMinutes === null
                  ? undefined
                  : () =>
                      runOperation(
                        delivery.status === 'ACCEPTED' ? 'collect-forgot' : 'deliver-forgot',
                      )
              }
            />
            <PrimaryButton
              label="Cancelar"
              variant="outline"
              onPress={busy ? undefined : () => setForgotOpen(false)}
            />
          </View>
        </View>
      </Modal>

      <Modal
        visible={returnOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setReturnOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, isDark ? styles.modalCardDark : styles.modalCardLight]}>
            <Text style={[styles.modalTitle, { color: text }]}>Devolver para a fila?</Text>
            <Text style={[styles.modalHint, { color: muted }]}>
              O pedido volta a ficar disponível para outro motoboy assumir. Conte o que aconteceu —
              a loja e o administrador veem este motivo.
            </Text>

            <TextInput
              style={[styles.noteInput, { color: text }]}
              placeholder="Ex.: moto quebrou, a loja não tinha o produto"
              placeholderTextColor={muted}
              value={returnReason}
              onChangeText={setReturnReason}
              multiline
            />

            <PrimaryButton
              label={busy ? 'Devolvendo...' : 'Devolver para a fila'}
              onPress={
                // O minimo de 5 caracteres e o mesmo que a API exige: barrar
                // aqui evita uma ida ao servidor so para receber o erro.
                busy || returnReason.trim().length < 5
                  ? undefined
                  : () => runOperation('return-to-queue')
              }
            />
            <PrimaryButton
              label="Cancelar"
              variant="outline"
              onPress={busy ? undefined : () => setReturnOpen(false)}
            />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeAreaLight: { flex: 1, backgroundColor: colors.background },
  safeAreaDark: { flex: 1, backgroundColor: colors.backgroundDark },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 16, gap: 12 },
  statusRow: { gap: 4 },
  status: { fontSize: 20, fontWeight: '700' },
  batch: { fontSize: 12, fontWeight: '600' },
  sectionTitle: { fontSize: 13, fontWeight: '700', marginBottom: 6 },
  address: { fontSize: 15, fontWeight: '600' },
  company: { fontSize: 13, marginTop: 4 },
  value: { fontSize: 22, fontWeight: '700' },
  returnNotice: { fontSize: 13, fontWeight: '600', marginTop: 8 },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  modalCard: { padding: 20, gap: 10, borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  modalCardLight: { backgroundColor: colors.background },
  modalCardDark: { backgroundColor: colors.backgroundDark },
  modalTitle: { fontSize: 18, fontWeight: '700' },
  modalHint: { fontSize: 13, lineHeight: 18, marginBottom: 4 },
  reason: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  reasonSelected: { borderColor: colors.primary, borderWidth: 2 },
  reasonLabel: { fontSize: 15, fontWeight: '600' },
  noteInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 12,
    minHeight: 72,
    textAlignVertical: 'top',
    fontSize: 15,
  },
  trackingNotice: { fontSize: 13, lineHeight: 19 },
  metadata: { fontSize: 13, marginTop: 4 },
  driverNote: { fontSize: 13, lineHeight: 19, marginTop: 10 },
  actions: { padding: 16 },
});
