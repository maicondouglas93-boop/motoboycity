import AsyncStorage from '@react-native-async-storage/async-storage';
import { ApiError } from '@motoboycity/api-client';
import type { DeliveryDetail } from '@motoboycity/types';
import {
  COMPLETION_QUIET_WINDOW_MS,
  completionDeservesAttention,
  DELIVERY_COMPLETION_SYNC_TIMEOUT_MS,
  completionClosesDeliveryLocally,
  enqueueDeliveryCompletion,
  getPendingDeliveryCompletions,
  retryDeliveryCompletionQueue,
  synchronizePendingDeliveryCompletions,
  type DeliveryCompletionSyncExecutor,
  type PendingDeliveryCompletion,
} from '../src/lib/deliveryCompletionOutbox';

const storage = new Map<string, string>();
const STORAGE_KEY = 'motoboycity.driver.deliveryCompletionOutbox.v1';

/**
 * O fix do retorno e obrigatorio no contrato da fila.
 *
 * Ele era opcional, e a tela enfileirava o retorno sem a posicao que tinha
 * acabado de capturar — com o raio de retorno ligado, o servidor recusava toda
 * conclusao pedindo a localizacao. Estes testes agora carregam a posicao
 * porque o tipo exige, que e a defesa contra o mesmo esquecimento.
 */
const returnFix = { lat: -20.1501, lng: -41.7401, accuracy: 12 };

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
    expect(queue[0]).toMatchObject({
      state: 'PENDING',
      payload: deliveryInput.payload,
      lastError: 'Nao foi possivel falar com o servidor. Confira o sinal e tente novamente.',
    });
  });

  it('mostra a mensagem da API sem transformar erro temporario em recusa definitiva', async () => {
    await enqueueDeliveryCompletion(deliveryInput);
    const api = executor({
      deliver: jest
        .fn()
        .mockRejectedValue(
          new ApiError(503, { message: 'Nao foi possivel calcular a distancia agora.' }),
        ),
    });

    const result = await synchronizePendingDeliveryCompletions('token', 'user-1', api);
    expect(result.serverUnavailable).toBe(true);
    expect((await getPendingDeliveryCompletions('user-1'))[0]).toMatchObject({
      state: 'PENDING',
      lastError: 'Nao foi possivel calcular a distancia agora.',
    });

    await retryDeliveryCompletionQueue('user-1');
    expect((await getPendingDeliveryCompletions('user-1'))[0]).toMatchObject({
      state: 'PENDING',
      lastError: null,
    });
  });

  it('continua outros pedidos quando apenas um destino precisa de revisao', async () => {
    await enqueueDeliveryCompletion(deliveryInput);
    await enqueueDeliveryCompletion({
      ...deliveryInput,
      deliveryId: 'delivery-2',
      displayNumber: 16,
    });
    const api = executor({
      deliver: jest.fn(async (_token, deliveryId) => {
        if (deliveryId === 'delivery-1') {
          throw new ApiError(422, { message: 'Destino sem rota viaria.' });
        }
      }),
    });

    const result = await synchronizePendingDeliveryCompletions('token', 'user-1', api);
    const queue = await getPendingDeliveryCompletions('user-1');

    expect(result.syncedIds).toHaveLength(1);
    expect(queue).toEqual([
      expect.objectContaining({
        deliveryId: 'delivery-1',
        state: 'NEEDS_REVIEW',
        lastError: 'Destino sem rota viaria.',
      }),
    ]);
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
      // Recusa que o motoboy ainda pode resolver: ele esta longe da loja. O
      // pedido continua vivo, entao a acao continua tendo onde ser aplicada.
      deliver: jest
        .fn()
        .mockRejectedValue(new ApiError(422, { message: 'voce esta a 800m do destino' })),
      detail: jest.fn().mockResolvedValue({
        ...deliveredDetail(),
        status: 'COLLECTED',
        statusHistory: [],
      }),
    });

    const result = await synchronizePendingDeliveryCompletions('token', 'user-1', api);
    expect(result.needsReviewCount).toBe(1);
    expect(result.discardedIds).toHaveLength(0);
    expect((await getPendingDeliveryCompletions('user-1'))[0]).toMatchObject({
      state: 'NEEDS_REVIEW',
      lastError: 'voce esta a 800m do destino',
    });

    await retryDeliveryCompletionQueue('user-1');
    expect((await getPendingDeliveryCompletions('user-1'))[0]).toMatchObject({
      state: 'PENDING',
      lastError: null,
    });
  });

  /**
   * O beco sem saida da fila offline.
   *
   * O motoboy marca entregue sem rede, o admin cancela o pedido, e a fila volta
   * a rodar. A acao guardada perdeu o objeto: o servidor recusa para sempre, e
   * antes disso o item ficava em revisao permanentemente — banner que nao saia
   * da tela, toque que repetia a mesma recusa, e nenhum jeito de descartar.
   */
  /**
   * O fantasma do pedido #307, visto em producao.
   *
   * A acao subiu antes de a coleta existir e foi para revisao com "precisa
   * estar coletado". Doze minutos depois o administrador marcou a coleta, o
   * motoboy entregou, e o pedido fechou normalmente — mas o aviso vermelho
   * continuou na tela dele no dia seguinte, porque nada mais olhava para aquele
   * item. "Precisa estar coletado" e condicao TEMPORARIA travestida de recusa
   * definitiva.
   */
  it('reconfere o item em revisao e o remove quando o pedido ja foi entregue', async () => {
    await enqueueDeliveryCompletion(deliveryInput);
    const recusa = executor({
      deliver: jest
        .fn()
        .mockRejectedValue(new ApiError(409, { message: 'precisa estar coletado' })),
      detail: jest
        .fn()
        .mockResolvedValue({ ...deliveredDetail(), status: 'ACCEPTED', statusHistory: [] }),
    });
    await synchronizePendingDeliveryCompletions('token', 'user-1', recusa);
    expect((await getPendingDeliveryCompletions('user-1'))[0]?.state).toBe('NEEDS_REVIEW');

    // O mundo andou: coleta feita pelo admin, entrega feita pelo motoboy.
    const depois = executor({
      detail: jest.fn().mockResolvedValue({
        ...deliveredDetail(),
        status: 'COMPLETED',
        statusHistory: [
          { fromStatus: 'ACCEPTED', toStatus: 'COLLECTED', changedAt: '2026-08-29T22:14:00.000Z' },
          { fromStatus: 'COLLECTED', toStatus: 'DELIVERED', changedAt: '2026-08-29T22:26:00.000Z' },
        ],
      }),
    });

    const result = await synchronizePendingDeliveryCompletions('token', 'user-1', depois);

    expect(result.syncedIds).toHaveLength(1);
    expect(await getPendingDeliveryCompletions('user-1')).toHaveLength(0);
    // Reconferir NAO e reenviar: a acao recusada continua sendo decisao do motoboy.
    expect(depois.deliver).not.toHaveBeenCalled();
  });

  /**
   * O caso do pedido #307, visto em producao.
   *
   * O motoboy tocou "entregue", a acao nao passou, e ele entao fez o CERTO:
   * registrou problema na entrega e devolveu a mercadoria. O pedido terminou
   * `COMPLETED`, mas por insucesso — e a API so trata "ja entregue" como
   * repeticao inofensiva quando NAO houve insucesso. A fila levava um "precisa
   * estar coletado" para sempre, e o aviso vermelho nao saia mais da tela de
   * quem tinha agido corretamente.
   */
  it('descarta a entrega guardada quando o pedido terminou por insucesso', async () => {
    await enqueueDeliveryCompletion(deliveryInput);
    const api = executor({
      deliver: jest
        .fn()
        .mockRejectedValue(
          new ApiError(409, { message: 'O pedido precisa estar coletado antes de ser entregue.' }),
        ),
      detail: jest.fn().mockResolvedValue({
        ...deliveredDetail(),
        status: 'COMPLETED',
        statusHistory: [
          { fromStatus: 'ACCEPTED', toStatus: 'COLLECTED', changedAt: '2026-08-29T22:14:00.000Z' },
          { fromStatus: 'COLLECTED', toStatus: 'FAILED', changedAt: '2026-08-29T22:26:00.000Z' },
          { fromStatus: 'FAILED', toStatus: 'COMPLETED', changedAt: '2026-08-29T22:26:30.000Z' },
        ],
      }),
    });

    const result = await synchronizePendingDeliveryCompletions('token', 'user-1', api);

    expect(result.discardedIds).toHaveLength(1);
    expect(result.needsReviewCount).toBe(0);
    expect(await getPendingDeliveryCompletions('user-1')).toHaveLength(0);
  });

  /**
   * O retorno nao tem equivalente: se o pedido fechou, `operationWasApplied` ja
   * reconhece pela transicao para COMPLETED. Descartar por insucesso aqui
   * jogaria fora justamente a confirmacao que fecha a devolucao.
   */
  it('nao descarta o retorno pendente so porque houve insucesso', async () => {
    await enqueueDeliveryCompletion({
      ownerUserId: 'user-1',
      action: 'COMPLETE_RETURN',
      deliveryId: 'delivery-1',
      batchId: null,
      displayNumber: 15,
      companyName: 'Loja A',
      payload: returnFix,
    });
    const api = executor({
      completeReturn: jest
        .fn()
        .mockRejectedValue(new ApiError(422, { message: 'voce esta longe da loja' })),
      detail: jest.fn().mockResolvedValue({
        ...deliveredDetail(),
        status: 'FAILED',
        statusHistory: [
          { fromStatus: 'COLLECTED', toStatus: 'FAILED', changedAt: '2026-08-29T22:26:00.000Z' },
        ],
      }),
    });

    const result = await synchronizePendingDeliveryCompletions('token', 'user-1', api);

    expect(result.discardedIds).toHaveLength(0);
    expect(result.needsReviewCount).toBe(1);
  });

  it('descarta a finalizacao cujo pedido foi cancelado, em vez de deixar em revisao', async () => {
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

    expect(result.discardedIds).toHaveLength(1);
    expect(result.syncedIds).toHaveLength(0);
    expect(result.needsReviewCount).toBe(0);
    expect(await getPendingDeliveryCompletions('user-1')).toHaveLength(0);
  });

  it('deduplica o retorno pelo lote e nunca envia a fila de outra conta', async () => {
    await enqueueDeliveryCompletion({
      ownerUserId: 'user-1',
      action: 'COMPLETE_RETURN',
      deliveryId: 'delivery-1',
      batchId: 'batch-1',
      displayNumber: 15,
      companyName: 'Loja A',
      payload: returnFix,
    });
    await enqueueDeliveryCompletion({
      ownerUserId: 'user-1',
      action: 'COMPLETE_RETURN',
      deliveryId: 'delivery-2',
      batchId: 'batch-1',
      displayNumber: 16,
      companyName: 'Loja A',
      payload: returnFix,
    });
    const api = executor();

    await synchronizePendingDeliveryCompletions('token-user-2', 'user-2', api);

    expect(api.completeReturn).not.toHaveBeenCalled();
    expect(await getPendingDeliveryCompletions('user-1')).toEqual([
      expect.objectContaining({ payload: returnFix }),
    ]);
  });

  /**
   * Regressao de producao: o retorno chegava ao servidor SEM a posicao.
   *
   * A tela capturava o GPS e o descartava ao enfileirar, porque o payload do
   * retorno era opcional e virava `{}`. Com o raio de retorno configurado, a
   * API recusava toda conclusao — "e necessario obter sua localizacao atual
   * para concluir o retorno" — e o motoboy nao tinha o que fazer, porque a
   * posicao existia e havia sido jogada fora um instante antes.
   */
  it('envia a posicao capturada ao concluir o retorno', async () => {
    await enqueueDeliveryCompletion({
      ownerUserId: 'user-1',
      action: 'COMPLETE_RETURN',
      deliveryId: 'delivery-9',
      batchId: null,
      displayNumber: 201,
      companyName: 'cariocas burguers',
      payload: returnFix,
    });
    const api = executor();

    await synchronizePendingDeliveryCompletions('token-user-1', 'user-1', api);

    expect(api.completeReturn).toHaveBeenCalledWith('token-user-1', 'delivery-9', returnFix);
  });

  it('repara com uma posicao nova o retorno vazio salvo pelo APK antigo', async () => {
    storage.set(
      STORAGE_KEY,
      JSON.stringify([
        {
          id: 'user-1:COMPLETE_RETURN:delivery-legacy',
          ownerUserId: 'user-1',
          action: 'COMPLETE_RETURN',
          deliveryId: 'delivery-legacy',
          batchId: null,
          groupKey: 'delivery-legacy',
          displayNumber: 202,
          companyName: 'Loja antiga',
          queuedAt: new Date().toISOString(),
          state: 'NEEDS_REVIEW',
          lastError: 'e necessario obter sua localizacao atual',
          payload: {},
        },
      ]),
    );
    const api = executor();

    await retryDeliveryCompletionQueue(
      'user-1',
      'user-1:COMPLETE_RETURN:delivery-legacy',
      returnFix,
    );
    await synchronizePendingDeliveryCompletions('token-user-1', 'user-1', api);

    expect(api.completeReturn).toHaveBeenCalledWith('token-user-1', 'delivery-legacy', returnFix);
    expect(await getPendingDeliveryCompletions('user-1')).toEqual([]);
  });

  it('repara retorno legado ainda pendente sem alterar outra conta', async () => {
    const legacy = (ownerUserId: string) => ({
      id: `${ownerUserId}:COMPLETE_RETURN:delivery-legacy`,
      ownerUserId,
      action: 'COMPLETE_RETURN',
      deliveryId: 'delivery-legacy',
      batchId: null,
      groupKey: 'delivery-legacy',
      displayNumber: 202,
      companyName: 'Loja antiga',
      queuedAt: new Date().toISOString(),
      state: 'PENDING',
      lastError: null,
      payload: {},
    });
    storage.set(STORAGE_KEY, JSON.stringify([legacy('user-1'), legacy('user-2')]));

    await retryDeliveryCompletionQueue(
      'user-1',
      'user-1:COMPLETE_RETURN:delivery-legacy',
      returnFix,
    );

    expect(await getPendingDeliveryCompletions('user-1')).toEqual([
      expect.objectContaining({ payload: returnFix, state: 'PENDING' }),
    ]);
    expect(await getPendingDeliveryCompletions('user-2')).toEqual([
      expect.objectContaining({ payload: {} }),
    ]);
  });

  it('nunca substitui uma posicao de retorno que ja estava congelada', async () => {
    const item = await enqueueDeliveryCompletion({
      ownerUserId: 'user-1',
      action: 'COMPLETE_RETURN',
      deliveryId: 'delivery-10',
      batchId: null,
      displayNumber: 203,
      companyName: 'Loja A',
      payload: returnFix,
    });

    await retryDeliveryCompletionQueue('user-1', item.id, {
      lat: -21,
      lng: -42,
      accuracy: 5,
    });

    expect(await getPendingDeliveryCompletions('user-1')).toEqual([
      expect.objectContaining({ payload: returnFix }),
    ]);
  });

  it('enriquece uma duplicata legada sem perder o registro original', async () => {
    storage.set(
      STORAGE_KEY,
      JSON.stringify([
        {
          id: 'user-1:COMPLETE_RETURN:delivery-11',
          ownerUserId: 'user-1',
          action: 'COMPLETE_RETURN',
          deliveryId: 'delivery-11',
          batchId: null,
          groupKey: 'delivery-11',
          displayNumber: 204,
          companyName: 'Loja A',
          queuedAt: '2026-08-28T20:00:00.000Z',
          state: 'PENDING',
          lastError: null,
          payload: {},
        },
      ]),
    );

    const repaired = await enqueueDeliveryCompletion({
      ownerUserId: 'user-1',
      action: 'COMPLETE_RETURN',
      deliveryId: 'delivery-11',
      batchId: null,
      displayNumber: 204,
      companyName: 'Loja A',
      payload: returnFix,
    });

    expect(repaired).toMatchObject({ queuedAt: '2026-08-28T20:00:00.000Z', payload: returnFix });
  });

  /**
   * O item reparado precisa VOLTAR para a fila, e nao so ganhar a posicao.
   *
   * Como a sincronizacao ignora tudo que nao esta PENDING, um reparo que
   * preservasse `NEEDS_REVIEW` consertava o item e o deixava parado: o motoboy
   * tocava "concluir retorno", o GPS era capturado, e nada subia — e a tela
   * ainda repetia o erro antigo sobre a localizacao que acabara de chegar.
   */
  it('reparar um retorno recusado devolve o item para a fila e limpa o erro antigo', async () => {
    storage.set(
      STORAGE_KEY,
      JSON.stringify([
        {
          id: 'user-1:COMPLETE_RETURN:delivery-12',
          ownerUserId: 'user-1',
          action: 'COMPLETE_RETURN',
          deliveryId: 'delivery-12',
          batchId: null,
          groupKey: 'delivery-12',
          displayNumber: 201,
          companyName: 'cariocas burguers',
          queuedAt: '2026-08-28T20:00:00.000Z',
          state: 'NEEDS_REVIEW',
          lastError: 'É necessário obter sua localização atual para concluir o retorno.',
          payload: {},
        },
      ]),
    );

    const repaired = await enqueueDeliveryCompletion({
      ownerUserId: 'user-1',
      action: 'COMPLETE_RETURN',
      deliveryId: 'delivery-12',
      batchId: null,
      displayNumber: 201,
      companyName: 'cariocas burguers',
      payload: returnFix,
    });

    expect(repaired).toMatchObject({ state: 'PENDING', lastError: null, payload: returnFix });

    // E, estando PENDING, a proxima sincronizacao realmente o envia.
    const api = executor();
    await synchronizePendingDeliveryCompletions('token', 'user-1', api);

    expect(api.completeReturn).toHaveBeenCalledWith('token', 'delivery-12', returnFix);
    expect(await getPendingDeliveryCompletions('user-1')).toEqual([]);
  });

  it('usa o GPS reparado mesmo quando uma sincronizacao antiga ainda estava em andamento', async () => {
    storage.set(
      STORAGE_KEY,
      JSON.stringify([
        {
          id: 'user-1:COMPLETE_RETURN:delivery-race',
          ownerUserId: 'user-1',
          action: 'COMPLETE_RETURN',
          deliveryId: 'delivery-race',
          batchId: null,
          groupKey: 'delivery-race',
          displayNumber: 205,
          companyName: 'Loja A',
          queuedAt: new Date().toISOString(),
          state: 'PENDING',
          lastError: null,
          payload: {},
        },
      ]),
    );
    let rejectLegacy: ((reason: unknown) => void) | undefined;
    const legacyRequest = new Promise<never>((_resolve, reject) => {
      rejectLegacy = reject;
    });
    const api = executor({
      completeReturn: jest
        .fn()
        .mockImplementationOnce(() => legacyRequest)
        .mockResolvedValueOnce({}),
      detail: jest.fn().mockResolvedValue({
        ...deliveredDetail(),
        status: 'DELIVERED',
        statusHistory: [],
      }),
    });

    const staleSync = synchronizePendingDeliveryCompletions('token-user-1', 'user-1', api);
    await new Promise<void>((resolve) => setImmediate(resolve));
    await retryDeliveryCompletionQueue('user-1', 'user-1:COMPLETE_RETURN:delivery-race', returnFix);
    const repairedSync = synchronizePendingDeliveryCompletions('token-user-1', 'user-1', api);
    rejectLegacy?.(new ApiError(409, { message: 'localizacao obrigatoria' }));

    await Promise.all([staleSync, repairedSync]);

    expect(api.completeReturn).toHaveBeenNthCalledWith(1, 'token-user-1', 'delivery-race', {});
    expect(api.completeReturn).toHaveBeenNthCalledWith(
      2,
      'token-user-1',
      'delivery-race',
      returnFix,
    );
    expect(await getPendingDeliveryCompletions('user-1')).toEqual([]);
  });

  it('oculta no retorno local somente os itens elegiveis do lote', async () => {
    const item = await enqueueDeliveryCompletion({
      ownerUserId: 'user-1',
      action: 'COMPLETE_RETURN',
      deliveryId: 'delivery-1',
      batchId: 'batch-1',
      displayNumber: 15,
      companyName: 'Loja A',
      payload: returnFix,
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
      payload: returnFix,
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
      payload: returnFix,
    });
    const api = executor({
      // Recusa que NAO encerra o pedido: ele segue coletado, entao a entrega
      // ainda pode acontecer e a ordem do lote precisa ser preservada.
      deliver: jest
        .fn()
        .mockRejectedValue(new ApiError(422, { message: 'voce esta a 800m do destino' })),
      detail: jest.fn().mockResolvedValue({
        ...deliveredDetail(),
        status: 'COLLECTED',
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

  /**
   * Um aviso que aparece sempre deixa de ser aviso. A sincronizacao normal
   * responde em um ou dois segundos, e o alerta amarelo piscava em TODA entrega
   * bem-sucedida — o motoboy concluia que algo tinha dado errado.
   */
  describe('janela de silencio antes de avisar', () => {
    function item(overrides: Partial<PendingDeliveryCompletion> = {}) {
      return {
        ...deliveryInput,
        id: 'user-1:DELIVER:delivery-1',
        groupKey: 'delivery-1',
        queuedAt: new Date('2026-08-29T02:00:00.000Z').toISOString(),
        state: 'PENDING' as const,
        lastError: null,
        ...overrides,
      } as PendingDeliveryCompletion;
    }
    const enfileiradoEm = new Date('2026-08-29T02:00:00.000Z').getTime();

    it('fica calado enquanto a espera e normal', () => {
      expect(completionDeservesAttention(item(), enfileiradoEm + 1_500)).toBe(false);
    });

    it('avisa quando a espera passa da janela', () => {
      expect(completionDeservesAttention(item(), enfileiradoEm + COMPLETION_QUIET_WINDOW_MS)).toBe(
        true,
      );
    });

    it('avisa na hora quando o servidor recusou, sem esperar a janela', () => {
      expect(
        completionDeservesAttention(item({ state: 'NEEDS_REVIEW' }), enfileiradoEm + 100),
      ).toBe(true);
    });

    it('avisa de imediato num item retomado de outra sessao', () => {
      // Ao reabrir o aplicativo, o que ficou da vez anterior ja esperou muito.
      expect(completionDeservesAttention(item(), enfileiradoEm + 3_600_000)).toBe(true);
    });
  });
});
