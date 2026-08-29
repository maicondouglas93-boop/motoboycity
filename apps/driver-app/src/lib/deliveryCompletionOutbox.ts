import AsyncStorage from '@react-native-async-storage/async-storage';
import { ApiError } from '@motoboycity/api-client';
import type {
  CompleteReturnPayload,
  DeliveryDetail,
  DeliveryListItem,
  MarkDeliveredPayload,
} from '@motoboycity/types';
import { deliveriesApi } from './apiClient';

const STORAGE_KEY = 'motoboycity.driver.deliveryCompletionOutbox.v1';
export const DELIVERY_COMPLETION_SYNC_TIMEOUT_MS = 15_000;

export type DeliveryCompletionState = 'PENDING' | 'NEEDS_REVIEW';
export type DeliveryCompletionAction = 'DELIVER' | 'COMPLETE_RETURN';

type BasePendingDeliveryCompletion = {
  id: string;
  ownerUserId: string;
  action: DeliveryCompletionAction;
  deliveryId: string;
  batchId: string | null;
  groupKey: string;
  displayNumber: number;
  companyName: string;
  queuedAt: string;
  state: DeliveryCompletionState;
  lastError: string | null;
};

export type PendingDeliveryCompletion =
  | (BasePendingDeliveryCompletion & {
      action: 'DELIVER';
      payload: MarkDeliveredPayload;
    })
  | (BasePendingDeliveryCompletion & {
      action: 'COMPLETE_RETURN';
      payload: CompleteReturnPayload;
    });

export type EnqueueDeliveryCompletionInput =
  | {
      ownerUserId: string;
      action: 'DELIVER';
      deliveryId: string;
      batchId: string | null;
      displayNumber: number;
      companyName: string;
      payload: MarkDeliveredPayload;
    }
  | {
      ownerUserId: string;
      action: 'COMPLETE_RETURN';
      deliveryId: string;
      batchId: string | null;
      displayNumber: number;
      companyName: string;
      /**
       * OBRIGATORIO, e nao opcional.
       *
       * Enquanto era opcional, a tela capturava o GPS do retorno e o enfileirava
       * sem ele — o `?? {}` abaixo transformava o esquecimento em objeto vazio,
       * sem erro de compilacao. Com o raio de retorno configurado, o servidor
       * recusava TODA conclusao de retorno pedindo a localizacao que o aparelho
       * tinha obtido e descartado um instante antes.
       */
      payload: CompleteReturnPayload;
    };

export interface DeliveryCompletionSyncResult {
  syncedIds: string[];
  /**
   * Itens retirados da fila porque o pedido acabou por outro caminho — hoje,
   * cancelamento. Nao foram sincronizados; deixaram de ter onde ser aplicados.
   */
  discardedIds: string[];
  pendingCount: number;
  needsReviewCount: number;
  authRequired: boolean;
  serverUnavailable: boolean;
}

export interface DeliveryCompletionSyncExecutor {
  deliver(accessToken: string, deliveryId: string, payload: MarkDeliveredPayload): Promise<unknown>;
  completeReturn(
    accessToken: string,
    deliveryId: string,
    payload: CompleteReturnPayload,
  ): Promise<unknown>;
  detail(accessToken: string, deliveryId: string): Promise<DeliveryDetail>;
}

const defaultExecutor: DeliveryCompletionSyncExecutor = {
  deliver: (accessToken, deliveryId, payload) =>
    deliveriesApi.deliver(accessToken, deliveryId, payload),
  completeReturn: (accessToken, deliveryId, payload) =>
    deliveriesApi.completeReturn(accessToken, deliveryId, payload),
  detail: (accessToken, deliveryId) => deliveriesApi.detail(accessToken, deliveryId),
};

const listeners = new Set<() => void>();
let storageTail: Promise<void> = Promise.resolve();
const syncInFlightByOwner = new Map<
  string,
  { accessToken: string; promise: Promise<DeliveryCompletionSyncResult> }
>();

function isPendingDeliveryCompletion(value: unknown): value is PendingDeliveryCompletion {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<PendingDeliveryCompletion>;
  return (
    typeof item.id === 'string' &&
    typeof item.ownerUserId === 'string' &&
    (item.action === 'DELIVER' || item.action === 'COMPLETE_RETURN') &&
    typeof item.deliveryId === 'string' &&
    (item.batchId === null || typeof item.batchId === 'string') &&
    typeof item.groupKey === 'string' &&
    typeof item.displayNumber === 'number' &&
    typeof item.companyName === 'string' &&
    typeof item.queuedAt === 'string' &&
    (item.state === 'PENDING' || item.state === 'NEEDS_REVIEW') &&
    (item.lastError === null || typeof item.lastError === 'string') &&
    !!item.payload &&
    typeof item.payload === 'object'
  );
}

function payloadHasCoordinates(payload: CompleteReturnPayload): boolean {
  return (
    typeof payload.lat === 'number' &&
    Number.isFinite(payload.lat) &&
    typeof payload.lng === 'number' &&
    Number.isFinite(payload.lng)
  );
}

/**
 * Quanto tempo uma finalizacao pode esperar em silencio antes de virar aviso.
 *
 * O aviso aparecia no instante do toque, e a sincronizacao normal responde em
 * um ou dois segundos — entao o motoboy via um alerta amarelo em TODA entrega
 * bem-sucedida e concluia que algo tinha dado errado. Um aviso que aparece
 * sempre deixa de ser aviso.
 *
 * Seis segundos ficam confortavelmente acima do tempo normal de resposta e bem
 * abaixo do limite de 15 s da sincronizacao: quando o aviso aparecer, a espera
 * e real.
 */
export const COMPLETION_QUIET_WINDOW_MS = 6_000;

/**
 * Esta finalizacao merece ocupar a tela agora?
 *
 * Recusa do servidor aparece na hora — e problema, nao demora. Espera ainda
 * dentro da janela fica calada; o botao ja mostra que a acao esta em curso.
 */
export function completionDeservesAttention(
  item: PendingDeliveryCompletion,
  now: number = Date.now(),
): boolean {
  if (item.state === 'NEEDS_REVIEW') return true;
  const esperandoHa = now - new Date(item.queuedAt).getTime();
  return Number.isFinite(esperandoHa) && esperandoHa >= COMPLETION_QUIET_WINDOW_MS;
}

/** Identifica retornos gravados pelo APK antigo, que persistia `payload: {}`. */
export function completionNeedsFreshReturnLocation(item: PendingDeliveryCompletion): boolean {
  return item.action === 'COMPLETE_RETURN' && !payloadHasCoordinates(item.payload);
}

async function readQueueUnsafe(): Promise<PendingDeliveryCompletion[]> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isPendingDeliveryCompletion) : [];
  } catch {
    return [];
  }
}

function notifyListeners(): void {
  listeners.forEach((listener) => {
    try {
      listener();
    } catch {
      // Um consumidor visual nunca pode interromper a persistencia da fila.
    }
  });
}

function serializeStorage<T>(operation: () => Promise<T>): Promise<T> {
  const result = storageTail.then(operation, operation);
  storageTail = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

async function replaceQueue(
  update: (current: PendingDeliveryCompletion[]) => PendingDeliveryCompletion[],
): Promise<PendingDeliveryCompletion[]> {
  return serializeStorage(async () => {
    const next = update(await readQueueUnsafe());
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    notifyListeners();
    return next;
  });
}

function completionId(input: EnqueueDeliveryCompletionInput): string {
  const scope =
    input.action === 'COMPLETE_RETURN' ? (input.batchId ?? input.deliveryId) : input.deliveryId;
  return `${input.ownerUserId}:${input.action}:${scope}`;
}

async function withSyncTimeout<T>(operation: Promise<T>): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<T>((_resolve, reject) => {
        timeoutId = setTimeout(
          () => reject(new Error('Tempo limite de sincronizacao excedido.')),
          DELIVERY_COMPLETION_SYNC_TIMEOUT_MS,
        );
      }),
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

export async function enqueueDeliveryCompletion(
  input: EnqueueDeliveryCompletionInput,
): Promise<PendingDeliveryCompletion> {
  const id = completionId(input);
  let queued: PendingDeliveryCompletion | undefined;
  await replaceQueue((current) => {
    const existing = current.find((item) => item.id === id);
    if (existing) {
      // Compatibilidade com o APK antigo: se uma nova tentativa trouxer o GPS
      // que faltava, enriquece o item legado sem substituir um fix ja salvo.
      if (
        input.action === 'COMPLETE_RETURN' &&
        completionNeedsFreshReturnLocation(existing) &&
        payloadHasCoordinates(input.payload)
      ) {
        /**
         * O reparo devolve o item para PENDING, e nao so troca o payload.
         *
         * Um `{ ...existing }` puro carregava junto o `state: 'NEEDS_REVIEW'` e
         * o `lastError` da tentativa que falhou por falta de posicao. A
         * sincronizacao ignora tudo que nao esta PENDING, entao o item era
         * consertado e ficava parado: o motoboy tocava "concluir retorno", o
         * aplicativo capturava o GPS, e nada subia — ele ainda precisava tocar
         * no aviso amarelo, um gesto sem relacao aparente. Pior, a tela repetia
         * o erro ANTIGO, falando da localizacao que acabara de ser obtida.
         */
        const repaired = {
          ...existing,
          payload: input.payload,
          state: 'PENDING' as const,
          lastError: null,
        };
        queued = repaired;
        return current.map((item) => (item.id === id ? repaired : item));
      }
      queued = existing;
      return current;
    }

    const base = {
      id,
      ownerUserId: input.ownerUserId,
      deliveryId: input.deliveryId,
      batchId: input.batchId,
      groupKey: input.batchId ?? input.deliveryId,
      displayNumber: input.displayNumber,
      companyName: input.companyName,
      queuedAt: new Date().toISOString(),
      state: 'PENDING' as const,
      lastError: null,
    };
    queued =
      input.action === 'DELIVER'
        ? { ...base, action: 'DELIVER', payload: input.payload }
        : { ...base, action: 'COMPLETE_RETURN', payload: input.payload };
    return [...current, queued];
  });
  if (!queued) throw new Error('Nao foi possivel salvar a finalizacao no aparelho.');
  return queued;
}

export async function getPendingDeliveryCompletions(
  ownerUserId: string,
): Promise<PendingDeliveryCompletion[]> {
  await storageTail;
  return (await readQueueUnsafe())
    .filter((item) => item.ownerUserId === ownerUserId)
    .sort((a, b) => Date.parse(a.queuedAt) - Date.parse(b.queuedAt));
}

export function subscribeDeliveryCompletionOutbox(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function pendingCompletionForDelivery(
  queue: ReadonlyArray<PendingDeliveryCompletion>,
  delivery: Pick<DeliveryDetail, 'id' | 'batchId'>,
): PendingDeliveryCompletion | undefined {
  const groupKey = delivery.batchId ?? delivery.id;
  return (
    queue.find((item) => item.action === 'COMPLETE_RETURN' && item.groupKey === groupKey) ??
    queue.find((item) => item.action === 'DELIVER' && item.deliveryId === delivery.id)
  );
}

/**
 * Define apenas os itens que podem sair da lista local enquanto a confirmacao
 * oficial aguarda internet. No retorno em lote, irmaos ainda coletados
 * continuam ativos porque a API tambem nao os conclui.
 */
export function completionClosesDeliveryLocally(
  item: PendingDeliveryCompletion,
  delivery: Pick<DeliveryListItem, 'id' | 'batchId' | 'status' | 'requiresReturn'>,
): boolean {
  if (item.action === 'DELIVER') return item.deliveryId === delivery.id;

  const groupKey = delivery.batchId ?? delivery.id;
  if (groupKey !== item.groupKey) return false;
  return (
    (delivery.status === 'DELIVERED' && delivery.requiresReturn) || delivery.status === 'FAILED'
  );
}

function operationWasApplied(item: PendingDeliveryCompletion, delivery: DeliveryDetail): boolean {
  if (item.action === 'DELIVER') {
    return delivery.statusHistory.some(
      (history) =>
        history.fromStatus === 'COLLECTED' &&
        (history.toStatus === 'DELIVERED' || history.toStatus === 'COMPLETED'),
    );
  }
  return delivery.statusHistory.some(
    (history) =>
      (history.fromStatus === 'DELIVERED' || history.fromStatus === 'FAILED') &&
      history.toStatus === 'COMPLETED',
  );
}

async function removeItem(id: string): Promise<void> {
  await replaceQueue((current) => current.filter((item) => item.id !== id));
}

async function markNeedsReview(
  attempted: PendingDeliveryCompletion,
  message: string,
): Promise<void> {
  await replaceQueue((current) =>
    current.map((item) =>
      item.id !== attempted.id
        ? item
        : completionNeedsFreshReturnLocation(attempted) && !completionNeedsFreshReturnLocation(item)
          ? // Uma tentativa antiga com `{}` perdeu a corrida para a recaptura
            // manual. Mantem PENDING para o sync encadeado usar o fix novo.
            item
          : { ...item, state: 'NEEDS_REVIEW' as const, lastError: message.slice(0, 240) },
    ),
  );
}

async function markPendingError(
  attempted: PendingDeliveryCompletion,
  message: string,
): Promise<void> {
  await replaceQueue((current) =>
    current.map((item) =>
      item.id === attempted.id && item.state === 'PENDING'
        ? { ...item, lastError: message.slice(0, 240) }
        : item,
    ),
  );
}

/**
 * O pedido acabou por outro caminho e esta acao nao tem mais onde ser aplicada.
 *
 * Cancelamento e o caso real: o motoboy marca entregue sem rede, o admin cancela
 * o pedido, e a fila volta a rodar. A API recusa — corretamente — porque o
 * pedido nao esta mais coletado, e a acao guardada perdeu o objeto. Sem
 * reconhecer isso, o item ficava em revisao para sempre: o banner nao saia mais
 * da tela, tocar nele repetia a mesma recusa, e nao havia como descartar.
 */
function completionNoLongerApplicable(delivery: DeliveryDetail): boolean {
  return delivery.status === 'CANCELLED';
}

type CompletionResolution = 'applied' | 'obsolete' | 'unresolved';

/**
 * Consulta o estado real do pedido depois de uma recusa definitiva.
 *
 * Roda para qualquer 4xx, e nao so para 409: um 404 ou um 422 tambem podem
 * significar "isto ja foi resolvido no servidor", e descobrir isso custa uma
 * consulta no caminho de erro — nunca no caminho normal.
 */
async function resolveCompletionAgainstServer(
  accessToken: string,
  item: PendingDeliveryCompletion,
  executor: DeliveryCompletionSyncExecutor,
): Promise<CompletionResolution> {
  const current = await withSyncTimeout(executor.detail(accessToken, item.deliveryId)).catch(
    () => null,
  );
  if (!current) return 'unresolved';
  if (operationWasApplied(item, current)) return 'applied';
  return completionNoLongerApplicable(current) ? 'obsolete' : 'unresolved';
}

async function synchronizeQueue(
  accessToken: string,
  ownerUserId: string,
  executor: DeliveryCompletionSyncExecutor,
): Promise<DeliveryCompletionSyncResult> {
  const syncedIds: string[] = [];
  const discardedIds: string[] = [];
  const blockedGroups = new Set<string>();
  let authRequired = false;
  let serverUnavailable = false;
  const queue = await getPendingDeliveryCompletions(ownerUserId);

  for (const item of queue) {
    if (item.state !== 'PENDING' || blockedGroups.has(item.groupKey)) continue;
    try {
      if (item.action === 'DELIVER') {
        await withSyncTimeout(executor.deliver(accessToken, item.deliveryId, item.payload));
      } else {
        await withSyncTimeout(executor.completeReturn(accessToken, item.deliveryId, item.payload));
      }
      await removeItem(item.id);
      syncedIds.push(item.id);
    } catch (error) {
      if (!(error instanceof ApiError)) {
        await markPendingError(
          item,
          error instanceof Error && error.message === 'Tempo limite de sincronizacao excedido.'
            ? 'O servidor demorou demais para confirmar. Toque para tentar novamente.'
            : 'Nao foi possivel falar com o servidor. Confira o sinal e tente novamente.',
        );
        serverUnavailable = true;
        break;
      }
      if (error.status === 401) {
        authRequired = true;
        break;
      }
      if (error.status >= 500) {
        await markPendingError(item, error.message);
        serverUnavailable = true;
        break;
      }

      const resolucao = await resolveCompletionAgainstServer(accessToken, item, executor);
      if (resolucao === 'applied') {
        await removeItem(item.id);
        syncedIds.push(item.id);
        continue;
      }
      if (resolucao === 'obsolete') {
        // Sai da fila, mas NAO entra em `syncedIds`: nada foi sincronizado, o
        // pedido simplesmente deixou de existir para esta acao. Quem chamou
        // avisa o motoboy uma vez, em vez de deixar um banner permanente.
        await removeItem(item.id);
        discardedIds.push(item.id);
        continue;
      }

      await markNeedsReview(item, error.message);
      blockedGroups.add(item.groupKey);
    }
  }

  const remaining = await getPendingDeliveryCompletions(ownerUserId);
  return {
    syncedIds,
    discardedIds,
    pendingCount: remaining.filter((item) => item.state === 'PENDING').length,
    needsReviewCount: remaining.filter((item) => item.state === 'NEEDS_REVIEW').length,
    authRequired,
    serverUnavailable,
  };
}

export function synchronizePendingDeliveryCompletions(
  accessToken: string,
  ownerUserId: string,
  executor: DeliveryCompletionSyncExecutor = defaultExecutor,
): Promise<DeliveryCompletionSyncResult> {
  const current = syncInFlightByOwner.get(ownerUserId);
  if (current) {
    // Pode ter entrado um segundo evento (ex.: concluir retorno) enquanto o
    // primeiro request estava no ar. Encadeia outra leitura da fila para que o
    // chamador nao receba o resultado de uma fotografia anterior da outbox.
    return current.promise.then((result) =>
      result.authRequired && current.accessToken === accessToken
        ? result
        : synchronizePendingDeliveryCompletions(accessToken, ownerUserId, executor),
    );
  }

  const next = synchronizeQueue(accessToken, ownerUserId, executor).finally(() => {
    if (syncInFlightByOwner.get(ownerUserId)?.promise === next) {
      syncInFlightByOwner.delete(ownerUserId);
    }
  });
  syncInFlightByOwner.set(ownerUserId, { accessToken, promise: next });
  return next;
}

export async function retryDeliveryCompletionQueue(
  ownerUserId: string,
  itemId?: string,
  freshReturnLocation?: CompleteReturnPayload,
): Promise<void> {
  await replaceQueue((current) =>
    current.map((item) => {
      const selected =
        item.ownerUserId === ownerUserId && (itemId === undefined || item.id === itemId);
      if (!selected) return item;

      const repairedPayload =
        completionNeedsFreshReturnLocation(item) &&
        freshReturnLocation &&
        payloadHasCoordinates(freshReturnLocation)
          ? freshReturnLocation
          : item.payload;

      return {
        ...item,
        payload: repairedPayload,
        state: 'PENDING' as const,
        lastError: null,
      };
    }),
  );
}
