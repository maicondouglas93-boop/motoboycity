import type Redis from 'ioredis';
import {
  DeliveryCompletionQuoteStore,
  type ReservedCompletionQuote,
} from './delivery-completion-quote.store';

const cotacao: ReservedCompletionQuote = {
  lat: -20.1684133,
  lng: -41.6526567,
  distanceKm: 4.19,
  totalValue: 11.1,
  driverValue: 8.88,
  platformValue: 2.22,
  returnValue: 0,
  surchargeLabel: null,
  surchargeValue: 0,
};

/** Redis de mentira: um mapa, com as três operações que o guarda-valor usa. */
function redisFalso() {
  const dados = new Map<string, string>();
  return {
    dados,
    set: jest.fn(async (chave: string, valor: string) => {
      dados.set(chave, valor);
      return 'OK';
    }),
    get: jest.fn(async (chave: string) => dados.get(chave) ?? null),
    del: jest.fn(async (chave: string) => (dados.delete(chave) ? 1 : 0)),
    quit: jest.fn(),
  };
}

describe('DeliveryCompletionQuoteStore', () => {
  it('devolve o valor reservado para o mesmo ponto, com validade de 20 minutos', async () => {
    const redis = redisFalso();
    const store = new DeliveryCompletionQuoteStore(redis as unknown as Redis);

    await store.reserve('delivery-1', cotacao);

    expect(redis.set).toHaveBeenCalledWith(
      'motoboycity:completion-quote:delivery-1',
      expect.any(String),
      'EX',
      1200,
    );
    await expect(store.find('delivery-1', cotacao.lat, cotacao.lng)).resolves.toEqual(cotacao);
  });

  /**
   * Um ponto vizinho nao herda o preco de outro. O aplicativo manda o MESMO
   * fix congelado; qualquer diferenca significa outro lugar, e outro lugar
   * precisa do seu proprio calculo.
   */
  it('não entrega a reserva para um ponto diferente, nem por um décimo de metro', async () => {
    const redis = redisFalso();
    const store = new DeliveryCompletionQuoteStore(redis as unknown as Redis);
    await store.reserve('delivery-1', cotacao);

    await expect(store.find('delivery-1', cotacao.lat + 0.000001, cotacao.lng)).resolves.toBeNull();
    await expect(store.find('delivery-2', cotacao.lat, cotacao.lng)).resolves.toBeNull();
  });

  /** Nada aqui pode travar uma entrega: toda falha vira "não achei". */
  it('Redis fora ou valor corrompido nunca estouram', async () => {
    const redis = redisFalso();
    redis.set.mockRejectedValueOnce(new Error('redis fora'));
    redis.get.mockRejectedValueOnce(new Error('redis fora'));
    const store = new DeliveryCompletionQuoteStore(redis as unknown as Redis);

    await expect(store.reserve('delivery-1', cotacao)).resolves.toBeUndefined();
    await expect(store.find('delivery-1', cotacao.lat, cotacao.lng)).resolves.toBeNull();

    redis.dados.set('motoboycity:completion-quote:delivery-1', '{"lat": "isto nao e numero"');
    await expect(store.find('delivery-1', cotacao.lat, cotacao.lng)).resolves.toBeNull();

    redis.del.mockRejectedValueOnce(new Error('redis fora'));
    await expect(store.discard('delivery-1')).resolves.toBeUndefined();
  });

  it('descarta a reserva depois de a entrega fechar', async () => {
    const redis = redisFalso();
    const store = new DeliveryCompletionQuoteStore(redis as unknown as Redis);
    await store.reserve('delivery-1', cotacao);

    await store.discard('delivery-1');

    await expect(store.find('delivery-1', cotacao.lat, cotacao.lng)).resolves.toBeNull();
  });
});
