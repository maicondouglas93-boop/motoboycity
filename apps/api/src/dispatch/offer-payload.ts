import type { DeliveryOfferPayload } from '@motoboycity/types';

type Endereco = {
  type: string;
  street: string | null;
  number: string | null;
  complement: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  referenceNote: string | null;
};

type EntregaDaOferta = {
  id: string;
  displayNumber: number;
  destinationKnownAtCreation: boolean;
  totalValue: unknown;
  driverValue: unknown;
  platformValue: unknown;
  distanceKm: unknown;
  requiresReturn: boolean;
  batchId: string | null;
  serviceType: { name: string };
  addresses: Endereco[];
};

function endereco(address: Endereco | null) {
  return {
    street: address?.street ?? null,
    number: address?.number ?? null,
    complement: address?.complement ?? null,
    city: address?.city ?? null,
    state: address?.state ?? null,
    zip: address?.zip ?? null,
    referenceNote: address?.referenceNote ?? null,
  };
}

function numero(valor: unknown): number | null {
  return valor === null || valor === undefined ? null : Number(valor);
}

/**
 * A oferta como o motoboy a vê, montada num lugar só.
 *
 * Antes isto vivia inline no despacho. Com a busca da oferta pendente — que o
 * aplicativo faz ao abrir, para não perder uma oferta que chegou com ele
 * fechado — passariam a existir duas montagens do mesmo objeto, e a segunda
 * divergiria da primeira no dia em que alguém acrescentasse um campo.
 *
 * `expiresInSeconds` é o que SOBRA do prazo, e não o prazo configurado: uma
 * oferta feita há 40 segundos não pode reabrir o cronômetro do zero, ou o
 * motoboy decidiria confiando num tempo que não tem.
 */
export function buildOfferPayload(input: {
  offerId: string;
  principal: EntregaDaOferta & {
    paymentMethod: 'BILLED' | 'ONLINE';
    company: { tradeName: string };
  };
  entregas: EntregaDaOferta[];
  expiresInSeconds: number;
  expiresAtEpochMs: number;
}): DeliveryOfferPayload {
  const { offerId, principal, entregas, expiresInSeconds, expiresAtEpochMs } = input;
  /**
   * `Boolean`, e nao `!== null`: um pedido avulso pode chegar com `batchId`
   * indefinido em vez de nulo, e `undefined !== null` e verdadeiro — o payload
   * sairia anunciando um lote que nao existe.
   */
  const emLote = Boolean(principal.batchId);

  /** Em lote, o total é a soma dos itens; avulso, o valor do próprio pedido. */
  function somaOuProprio(campo: 'totalValue' | 'driverValue' | 'platformValue'): number | null {
    if (!principal.destinationKnownAtCreation) {
      return null;
    }
    return emLote
      ? entregas.reduce((soma, item) => soma + Number(item[campo] ?? 0), 0)
      : numero(principal[campo]);
  }

  return {
    offerId,
    deliveryId: principal.id,
    displayNumber: principal.displayNumber,
    companyName: principal.company.tradeName,
    paymentMethod: principal.paymentMethod,
    totalValue: somaOuProprio('totalValue'),
    driverValue: somaOuProprio('driverValue'),
    platformValue: somaOuProprio('platformValue'),
    distanceKm: !principal.destinationKnownAtCreation
      ? null
      : emLote
        ? entregas.reduce((soma, item) => soma + Number(item.distanceKm ?? 0), 0)
        : numero(principal.distanceKm),
    requiresReturn: emLote
      ? entregas.some((item) => item.requiresReturn)
      : principal.requiresReturn,
    deliveries: entregas.map((item) => ({
      deliveryId: item.id,
      displayNumber: item.displayNumber,
      serviceTypeName: item.serviceType.name,
      destinationKnownAtCreation: item.destinationKnownAtCreation,
      pickupAddress: endereco(item.addresses.find((address) => address.type === 'PICKUP') ?? null),
      dropoffAddress: item.destinationKnownAtCreation
        ? endereco(item.addresses.find((address) => address.type === 'DROPOFF') ?? null)
        : null,
      totalValue: numero(item.totalValue),
      driverValue: numero(item.driverValue),
      platformValue: numero(item.platformValue),
      distanceKm: numero(item.distanceKm),
      requiresReturn: item.requiresReturn,
    })),
    expiresInSeconds,
    expiresAtEpochMs,
    ...(emLote ? { batchId: principal.batchId, deliveryCount: entregas.length } : {}),
  };
}

/**
 * Quanto sobra do prazo de uma oferta já feita.
 *
 * Nunca negativo: uma oferta vencida que ainda não foi varrida pelo job de
 * expiração devolveria tempo negativo, e o aplicativo mostraria um cronômetro
 * contando para trás.
 */
export function remainingSeconds(
  offeredAt: Date,
  timeoutSeconds: number,
  now: Date = new Date(),
): number {
  const decorrido = Math.floor((now.getTime() - offeredAt.getTime()) / 1000);
  return Math.max(0, timeoutSeconds - decorrido);
}
