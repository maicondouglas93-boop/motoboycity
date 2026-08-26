import AsyncStorage from '@react-native-async-storage/async-storage';
import { ApiError } from '@motoboycity/api-client';
import type { DeliveryDetail } from '@motoboycity/types';
import {
  DELIVERY_COMPLETION_SYNC_TIMEOUT_MS,
  completionClosesDeliveryLocally,
  enqueueDeliveryCompletion,
  getPendingDeliveryCompletions,
  retryDeliveryCompletionQueue,
  synchronizePendingDeliveryCompletions,
  type DeliveryCompletionSyncExecutor,
} from '../src/lib/deliveryCompletionOutbox';

const storage = new Map<string, string>();

function executor(
  overrides: Partial<DeliveryCompletionSyncExecutor> = {},
): DeliveryCompletionSyncExecutor {
  return {
    deliver: jest.fn().mockResolvedValue({}),
    completeReturn: jest.fn().mockResolvedValue({}),
    detail: jest.fn().mockRejectedValue(new Error('detail nao esperado')),
    ...overrides,
  };
}

function deliveredDetail(): DeliveryDetail {
  return {
    id: 'delivery-1',
    status: 'COMPLETED',
    statusHistory: [
      {
        fromStatus: 'COLLECTED',
        toStatus: 'DELIVERED',
        changedAt: new Date().toISOString(),
        changedBy: null,
        note: null,
      },
    ],
  } as DeliveryDetail;
}

const deliveryInput = {
  ownerUserId: 'user-1',
  action: 'DELIVER' as const,
  deliveryId: 'delivery-1',
  batchId: null,
  displayNumber: 15,
  companyName: 'Loja A',
  payload: { lat: -20.15, lng: -41.62, accuracy: 12 },
};

beforeEach(() => {
  storage.clear();
  (AsyncStorage.getItem as jest.Mock).mockImplementation(
    async (key: string) => storage.get(key) ?? null,
  );
  (AsyncStorage.setItem as jest.Mock).mockImplementation(async (key: string, value: string) => {
    storage.set(key, value);
  });
  (AsyncStorage.removeItem as jest.Mock).mockImplementation(async (key: string) => {
    storage.delete(key);
  });
});

describe('delivery completion outbox', () => {
  it('persiste o GPS original e elimina toque duplicado da mesma entrega', async () => {
    const first = await enqueueDeliveryCompletion(deliveryInput);
    const duplicate = await enqueueDeliveryCompletion({
      ...deliveryInput,
      payload: { lat: -21, lng: -42, accuracy: 5 },
    });

    const queue = await getPendingDeliveryCompletions('user-1');
    expect(duplicate.id).toBe(first.id);
    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({ payload: deliveryInput.payload, state: 'PENDING' });
  });

  it('sincroniza em serie e remove somente depois da confirmacao da API', async () => {
    await enqueueDeliveryCompletion(deliveryInput);
    await enqueueDeliveryCompletion({
      ...deliveryInput,
      deliveryId: 'delivery-2',
      displayNumber: 16,
    });
    const calls: string[] = [];
    const api = executor({
      deliver: jest.fn(async (_token, deliveryId) => {
        calls.push(deliveryId);
      }),
    });

    const result = await synchronizePendingDeliveryCompletions('token', 'user-1', api);

    expect(calls).toEqual(['delivery-1', 'delivery-2']);
    expect(result.syncedIds).toHaveLength(2);
    expect(await getPendingDeliveryCompletions('user-1')).toEqual([]);
  });

  it('mantem a acao e o GPS quando a rede cai', async () => {
    await enqueueDeliveryCompletion(deliveryInput);
    const api = executor({
      deliver: jest.fn().mockRejectedValue(new TypeError('Network request failed')),
    });

    const result = await synchronizePendingDeliveryCompletions('token', 'user-1', api);
    const queue = await getPendingDeliveryCompletions('user-1');

    expect(result.serverUnavailable).toBe(true);
    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({ state: 'PENDING', payload: deliveryInput.payload });
  });

  it('libera a sincronizacao quando uma requisicao de rede fica pendurada', async () => {
    jest.useFakeTimers();
    try {
      await enqueueDeliveryCompletion(deliveryInput);
      const api = executor({
        deliver: jest.fn(() => new Promise(() => undefined)),
      });

      const syncing = synchronizePendingDeliveryCompletions('token', 'user-1', api);
      await jest.advanceTimersByTimeAsync(DELIVERY_COMPLETION_SYNC_TIMEOUT_MS);
      const result = await syncing;

      expect(result.serverUnavailable).toBe(true);
      expect(await getPendingDeliveryCompletions('user-1')).toHaveLength(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it('reconcilia resposta perdida sem duplicar a finalizacao', async () => {
    await enqueueDeliveryCompletion(deliveryInput);
    const api = executor({
      deliver: jest.fn().mockRejectedValue(new ApiError(409, { message: 'ja aplicado' })),
      detail: jest.fn().mockResolvedValue(deliveredDetail()),
    });

    const result = await synchronizePendingDeliveryCompletions('token', 'user-1', api);

    expect(result.syncedIds).toHaveLength(1);
    expect(await getPendingDeliveryCompletions('user-1')).toEqual([]);
  });

  it('separa conflito real para revisao e so repete por acao manual', async () => {
    await enqueueDeliveryCompletion(deliveryInput);
    const api = executor({
      deliver: jest.fn().mockRejectedValue(new ApiError(409, { message: 'pedido cancelado' })),
      detail: jest.fn().mockResolvedValue({
        ...deliveredDetail(),
        status: 'CANCELLED',
        statusHistory: [],
      }),
    });

    const result = await synchronizePendingDeliveryCompletions('token', 'user-1', api);
    expect(result.needsReviewCount).toBe(1);
    expect((await getPendingDeliveryCompletions('user-1'))[0]).toMatchObject({
      state: 'NEEDS_REVIEW',
      lastError: 'pedido cancelado',
    });

    await retryDeliveryCompletionQueue('user-1');
    expect((await getPendingDeliveryCompletions('user-1'))[0]).toMatchObject({
      state: 'PENDING',
      lastError: null,
    });
  });

  it('deduplica o retorno pelo lote e nunca envia a fila de outra conta', async () => {
    await enqueueDeliveryCompletion({
      ownerUserId: 'user-1',
      action: 'COMPLETE_RETURN',
      deliveryId: 'delivery-1',
      batchId: 'batch-1',
      displayNumber: 15,
      companyName: 'Loja A',
    });
    await enqueueDeliveryCompletion({
      ownerUserId: 'user-1',
      action: 'COMPLETE_RETURN',
      deliveryId: 'delivery-2',
      batchId: 'batch-1',
      displayNumber: 16,
      companyName: 'Loja A',
    });
    const api = executor();

    await synchronizePendingDeliveryCompletions('token-user-2', 'user-2', api);

    expect(api.completeReturn).not.toHaveBeenCalled();
    expect(await getPendingDeliveryCompletions('user-1')).toHaveLength(1);
  });

  it('oculta no retorno local somente os itens elegiveis do lote', async () => {
    const item = await enqueueDeliveryCompletion({
      ownerUserId: 'user-1',
      action: 'COMPLETE_RETURN',
      deliveryId: 'delivery-1',
      batchId: 'batch-1',
      displayNumber: 15,
      companyName: 'Loja A',
    });

    expect(
      completionClosesDeliveryLocally(item, {
        id: 'delivery-1',
        batchId: 'batch-1',
        status: 'DELIVERED',
        requiresReturn: true,
      }),
    ).toBe(true);
    expect(
      completionClosesDeliveryLocally(item, {
        id: 'delivery-2',
        batchId: 'batch-1',
        status: 'FAILED',
        requiresReturn: false,
      }),
    ).toBe(true);
    expect(
      completionClosesDeliveryLocally(item, {
        id: 'delivery-3',
        batchId: 'batch-1',
        status: 'COLLECTED',
        requiresReturn: true,
      }),
    ).toBe(false);
  });

  it('processa entrega e retorno dependente na ordem em que foram salvos', async () => {
    await enqueueDeliveryCompletion({ ...deliveryInput, batchId: 'batch-1' });
    await enqueueDeliveryCompletion({
      ownerUserId: 'user-1',
      action: 'COMPLETE_RETURN',
      deliveryId: 'delivery-1',
      batchId: 'batch-1',
      displayNumber: 15,
      companyName: 'Loja A',
    });
    const calls: string[] = [];
    const api = executor({
      deliver: jest.fn(async () => {
        calls.push('deliver');
      }),
      completeReturn: jest.fn(async () => {
        calls.push('complete-return');
      }),
    });

    await synchronizePendingDeliveryCompletions('token', 'user-1', api);

    expect(calls).toEqual(['deliver', 'complete-return']);
    expect(await getPendingDeliveryCompletions('user-1')).toEqual([]);
  });

  it('nao envia o retorno quando a entrega anterior do mesmo lote foi recusada', async () => {
    await enqueueDeliveryCompletion({ ...deliveryInput, batchId: 'batch-1' });
    await enqueueDeliveryCompletion({
      ownerUserId: 'user-1',
      action: 'COMPLETE_RETURN',
      deliveryId: 'delivery-1',
      batchId: 'batch-1',
      displayNumber: 15,
      companyName: 'Loja A',
    });
    const api = executor({
      deliver: jest.fn().mockRejectedValue(new ApiError(409, { message: 'pedido cancelado' })),
      detail: jest.fn().mockResolvedValue({
        ...deliveredDetail(),
        status: 'CANCELLED',
        statusHistory: [],
      }),
    });

    await synchronizePendingDeliveryCompletions('token', 'user-1', api);
    const queue = await getPendingDeliveryCompletions('user-1');

    expect(api.completeReturn).not.toHaveBeenCalled();
    expect(queue).toHaveLength(2);
    expect(queue[0].state).toBe('NEEDS_REVIEW');
    expect(queue[1].state).toBe('PENDING');
  });

  it('mantem sincronizacoes concorrentes isoladas por conta', async () => {
    await enqueueDeliveryCompletion(deliveryInput);
    await enqueueDeliveryCompletion({
      ...deliveryInput,
      ownerUserId: 'user-2',
      deliveryId: 'delivery-2',
    });

    let releaseFirst: (() => void) | undefined;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const firstApi = executor({ deliver: jest.fn(() => firstGate) });
    const secondApi = executor();

    const firstSync = synchronizePendingDeliveryCompletions('token-1', 'user-1', firstApi);
    const secondSync = synchronizePendingDeliveryCompletions('token-2', 'user-2', secondApi);
    await new Promise<void>((resolve) => setImmediate(() => resolve()));
    const secondStartedIndependently = (secondApi.deliver as jest.Mock).mock.calls.length === 1;
    releaseFirst?.();
    await Promise.all([firstSync, secondSync]);

    expect(secondStartedIndependently).toBe(true);
    expect(await getPendingDeliveryCompletions('user-2')).toEqual([]);
  });

  it('repete com o token novo quando a autenticacao muda durante o sync', async () => {
    await enqueueDeliveryCompletion(deliveryInput);
    let rejectOldToken: ((reason: unknown) => void) | undefined;
    const oldRequest = new Promise<never>((_resolve, reject) => {
      rejectOldToken = reject;
    });
    const oldApi = executor({ deliver: jest.fn(() => oldRequest) });
    const newApi = executor();

    const oldSync = synchronizePendingDeliveryCompletions('token-antigo', 'user-1', oldApi);
    const newSync = synchronizePendingDeliveryCompletions('token-novo', 'user-1', newApi);
    rejectOldToken?.(new ApiError(401, { message: 'sessao expirada' }));
    const [oldResult, newResult] = await Promise.all([oldSync, newSync]);

    expect(oldResult.authRequired).toBe(true);
    expect(newResult.authRequired).toBe(false);
    expect(newApi.deliver).toHaveBeenCalledTimes(1);
    expect(await getPendingDeliveryCompletions('user-1')).toEqual([]);
  });

  it('mantem a fila quando a sessao expira', async () => {
    await enqueueDeliveryCompletion(deliveryInput);
    const api = executor({
      deliver: jest.fn().mockRejectedValue(new ApiError(401, { message: 'sessao expirada' })),
    });

    const result = await synchronizePendingDeliveryCompletions('token', 'user-1', api);

    expect(result.authRequired).toBe(true);
    expect(await getPendingDeliveryCompletions('user-1')).toHaveLength(1);
  });
});
