import { buildOfferPayload, remainingSeconds } from './offer-payload';

const endereco = {
  type: 'PICKUP',
  street: 'Rua da Loja',
  number: '100',
  complement: null,
  city: 'Lajinha',
  state: 'MG',
  zip: '36930000',
  referenceNote: null,
};

function entrega(overrides: Record<string, unknown> = {}) {
  return {
    id: 'delivery-1',
    displayNumber: 1001,
    destinationKnownAtCreation: true,
    totalValue: 10,
    driverValue: 8,
    platformValue: 2,
    distanceKm: 3,
    requiresReturn: false,
    batchId: null,
    serviceType: { name: 'Padrão' },
    addresses: [endereco],
    ...overrides,
  };
}

function principal(overrides: Record<string, unknown> = {}) {
  return {
    ...entrega(),
    paymentMethod: 'BILLED' as const,
    company: { tradeName: 'Lanchonete do Zé' },
    ...overrides,
  };
}

describe('remainingSeconds', () => {
  const agora = new Date('2026-08-23T15:00:00.000Z');

  it('desconta o tempo já decorrido da oferta', () => {
    // Uma oferta feita ha 40 segundos nao pode reabrir o cronometro do zero: o
    // motoboy decidiria confiando num tempo que nao tem.
    const ofertadaEm = new Date(agora.getTime() - 40_000);

    expect(remainingSeconds(ofertadaEm, 120, agora)).toBe(80);
  });

  it('nunca devolve negativo', () => {
    // Oferta vencida que o job de expiracao ainda nao varreu daria tempo
    // negativo, e o aplicativo mostraria um cronometro contando para tras.
    const ofertadaEm = new Date(agora.getTime() - 300_000);

    expect(remainingSeconds(ofertadaEm, 120, agora)).toBe(0);
  });

  it('oferta recém-criada devolve o prazo inteiro', () => {
    expect(remainingSeconds(agora, 120, agora)).toBe(120);
  });
});

describe('buildOfferPayload', () => {
  it('pedido avulso usa os valores do próprio pedido', () => {
    const payload = buildOfferPayload({
      offerId: 'offer-1',
      principal: principal(),
      entregas: [entrega()],
      expiresInSeconds: 120,
    });

    expect(payload.totalValue).toBe(10);
    expect(payload.driverValue).toBe(8);
    expect(payload.distanceKm).toBe(3);
    expect(payload.deliveries).toHaveLength(1);
    expect(payload.batchId).toBeUndefined();
  });

  it('batchId indefinido não vira lote', () => {
    // `undefined !== null` e verdadeiro: sem cuidado, um pedido avulso sairia
    // anunciando um lote que nao existe.
    const semLote: Record<string, unknown> = { ...principal() };
    delete semLote['batchId'];

    const payload = buildOfferPayload({
      offerId: 'offer-1',
      principal: semLote as unknown as Parameters<typeof buildOfferPayload>[0]['principal'],
      entregas: [entrega()],
      expiresInSeconds: 120,
    });

    expect(payload).not.toHaveProperty('batchId');
    expect(payload).not.toHaveProperty('deliveryCount');
  });

  it('lote soma os itens e informa a quantidade', () => {
    const payload = buildOfferPayload({
      offerId: 'offer-1',
      principal: principal({ batchId: 'batch-1' }),
      entregas: [
        entrega({ batchId: 'batch-1' }),
        entrega({ id: 'delivery-2', displayNumber: 1002, batchId: 'batch-1', totalValue: 15 }),
      ],
      expiresInSeconds: 120,
    });

    expect(payload.totalValue).toBe(25);
    expect(payload.batchId).toBe('batch-1');
    expect(payload.deliveryCount).toBe(2);
  });

  it('sem destino conhecido, os valores vão nulos e não zero', () => {
    // Zero mentiria sobre quanto a corrida rende; nulo diz que ainda nao ha
    // preco, e a tela sabe escrever isso.
    const payload = buildOfferPayload({
      offerId: 'offer-1',
      principal: principal({
        destinationKnownAtCreation: false,
        totalValue: null,
        driverValue: null,
        distanceKm: null,
      }),
      entregas: [entrega({ destinationKnownAtCreation: false, totalValue: null })],
      expiresInSeconds: 120,
    });

    expect(payload.totalValue).toBeNull();
    expect(payload.driverValue).toBeNull();
    expect(payload.distanceKm).toBeNull();
    expect(payload.deliveries[0]?.dropoffAddress).toBeNull();
  });

  it('lote com retorno em qualquer item marca retorno na oferta', () => {
    // O motoboy precisa saber que vai voltar a loja antes de aceitar, mesmo que
    // so um dos pedidos exija.
    const payload = buildOfferPayload({
      offerId: 'offer-1',
      principal: principal({ batchId: 'batch-1', requiresReturn: false }),
      entregas: [
        entrega({ batchId: 'batch-1', requiresReturn: false }),
        entrega({ id: 'delivery-2', batchId: 'batch-1', requiresReturn: true }),
      ],
      expiresInSeconds: 120,
    });

    expect(payload.requiresReturn).toBe(true);
  });
});
