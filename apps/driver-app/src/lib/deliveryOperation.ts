import type {
  DeliveryAddressItem,
  DeliveryDestinationPreview,
  DeliveryDetail,
  DeliveryStatus,
} from '@motoboycity/types';

const OPERATION_TIME_ZONE = 'America/Sao_Paulo';

const currencyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

export type DeliveryOperationCopy = {
  statusLabel: string;
  primaryActionLabel: string | null;
  routeLabel: string | null;
};

export function deliveryOperationCopy(status: DeliveryStatus): DeliveryOperationCopy {
  switch (status) {
    case 'ACCEPTED':
      return {
        statusLabel: 'Aceito',
        primaryActionLabel: 'Pedido coletado',
        routeLabel: 'Abrir rota para a coleta',
      };
    case 'COLLECTED':
      return {
        statusLabel: 'Coletado',
        primaryActionLabel: 'Pedido entregue',
        routeLabel: 'Abrir rota para a entrega',
      };
    case 'DELIVERED':
      return {
        statusLabel: 'Entregue',
        primaryActionLabel: 'Concluir retorno',
        routeLabel: 'Abrir rota para a coleta',
      };
    case 'FAILED':
      return {
        statusLabel: 'Devolução pendente',
        primaryActionLabel: 'Confirmar devolução na loja',
        routeLabel: 'Abrir rota para a coleta',
      };
    case 'COMPLETED':
      return { statusLabel: 'Concluído', primaryActionLabel: null, routeLabel: null };
    default:
      return { statusLabel: status, primaryActionLabel: null, routeLabel: null };
  }
}

export function formatOperationDateTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';

  const day = new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    timeZone: OPERATION_TIME_ZONE,
  }).format(date);
  const time = new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: OPERATION_TIME_ZONE,
  }).format(date);

  return `${day} às ${time}`;
}

export function formatElapsedTime(startIso: string, nowMs: number): string {
  const startMs = Date.parse(startIso);
  if (!Number.isFinite(startMs)) return '00:00';

  const totalSeconds = Math.max(0, Math.floor((nowMs - startMs) / 1_000));
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  const twoDigits = (value: number) => String(value).padStart(2, '0');

  return hours > 0
    ? `${twoDigits(hours)}:${twoDigits(minutes)}:${twoDigits(seconds)}`
    : `${twoDigits(minutes)}:${twoDigits(seconds)}`;
}

export function formatDeliveryAddress(address: DeliveryAddressItem | undefined): string {
  if (!address) return 'Não informado';

  const streetLine = [address.street, address.number].filter(Boolean).join(', ');
  const placeLine = [address.city, address.state].filter(Boolean).join(' - ');
  const placeWithZip = [placeLine, address.zip].filter(Boolean).join(', ');
  const reference = address.referenceNote ? `Referência: ${address.referenceNote}` : null;
  const lines = [streetLine, address.complement, placeWithZip, reference].filter(Boolean);

  if (lines.length > 0) return lines.join('\n');
  if (address.lat !== null && address.lng !== null) {
    return 'Destino registrado pela localização da entrega';
  }
  return 'Não informado';
}

/**
 * Destino como o motoboy precisa ler. Pedido criado sem endereco nao tem
 * destino ate a entrega acontecer; dizer isso e mais honesto do que repetir
 * "nao informado" e deixar ele achar que faltou um dado.
 */
export function destinationLabel(
  delivery: Pick<DeliveryDetail, 'destinationKnownAtCreation'>,
  dropoff: DeliveryAddressItem | undefined,
): string {
  if (dropoff) return formatDeliveryAddress(dropoff);
  if (!delivery.destinationKnownAtCreation) {
    return 'Endereço de entrega definido pela localização no momento da entrega';
  }
  return 'Endereço de entrega não informado';
}

export function formatDeliveryValue(value: number | null): string {
  return value === null ? 'A calcular na entrega' : currencyFormatter.format(value);
}

export function navigationDestination(address: DeliveryAddressItem | undefined): string | null {
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

/**
 * Link para rever a rota completa de uma entrega ja conhecida. Quando ha
 * retorno, o destino final volta a ser a coleta e o local de entrega vira
 * parada intermediaria. Nao monta link parcial: sem as duas pontas, "rota
 * completa" seria uma promessa falsa.
 */
export function completeDeliveryRouteUrl(
  pickup: DeliveryAddressItem | undefined,
  dropoff: DeliveryAddressItem | undefined,
  requiresReturn: boolean,
): string | null {
  const origin = navigationDestination(pickup);
  const deliveryDestination = navigationDestination(dropoff);
  if (!origin || !deliveryDestination) return null;

  const params = new URLSearchParams({
    api: '1',
    origin,
    destination: requiresReturn ? origin : deliveryDestination,
    travelmode: 'driving',
  });
  if (requiresReturn) params.set('waypoints', deliveryDestination);

  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

export function deliveryPaymentLabel(paymentMethod: 'BILLED' | 'ONLINE'): string {
  return paymentMethod === 'BILLED' ? 'Faturado' : 'Pago online';
}

export type DeliverConfirmationSummary = {
  /** "#128 - Elite Pizzaria": prova qual pedido esta sendo fechado. */
  orderLabel: string;
  destination: string;
  /** Aviso de que o destino so nasce no toque de confirmar, pelo GPS. */
  gpsNotice: string | null;
  driverValue: string;
  /** So aparece quando o pedido tem retorno com valor proprio. */
  returnValue: string | null;
};

/**
 * O que o motoboy confere ANTES de dar o pedido como entregue.
 *
 * Marcar entregue fecha o pedido e manda ele para o historico; ate aqui isso
 * acontecia com um toque e um texto generico, entao rua errada ou valor
 * errado so apareciam depois, com o pedido ja fechado. Este resumo mostra as
 * duas coisas que decidem se a finalizacao esta certa — endereco e valor —
 * junto do numero do pedido, porque com varios pedidos abertos a duvida
 * costuma ser QUAL pedido esta sendo fechado.
 */
export function deliverConfirmationSummary(
  delivery: Pick<
    DeliveryDetail,
    | 'displayNumber'
    | 'companyName'
    | 'destinationKnownAtCreation'
    | 'driverValue'
    | 'requiresReturn'
    | 'returnValue'
    | 'addresses'
  >,
): DeliverConfirmationSummary {
  const dropoff = delivery.addresses.find((address) => address.type === 'DROPOFF');

  return {
    orderLabel: `#${delivery.displayNumber} - ${delivery.companyName}`,
    destination: destinationLabel(delivery, dropoff),
    gpsNotice: delivery.destinationKnownAtCreation
      ? null
      : 'Este pedido foi criado sem endereço. O endereço acima é onde você está agora: é ele que será gravado como destino e usado no valor da entrega.',
    driverValue: formatDeliveryValue(delivery.driverValue),
    returnValue:
      delivery.requiresReturn && delivery.returnValue !== null
        ? formatDeliveryValue(delivery.returnValue)
        : null,
  };
}

/**
 * Endereco identificado para a coordenada onde o motoboy esta, formatado como
 * o resto da tela formata endereco.
 *
 * Devolve `null` quando o Google nao identificou nada de util — e ai a tela diz
 * isso com todas as letras, em vez de mostrar uma linha vazia que pareceria
 * endereco conferido.
 */
export function capturedDestinationLabel(
  preview: DeliveryDestinationPreview | null | undefined,
): string | null {
  if (!preview) return null;

  const streetLine = [preview.street, preview.number].filter(Boolean).join(', ');
  const placeLine = [preview.city, preview.state].filter(Boolean).join(' - ');
  const placeWithZip = [placeLine, preview.zip].filter(Boolean).join(', ');
  const lines = [streetLine, placeWithZip].filter(Boolean);

  return lines.length > 0 ? lines.join('\n') : null;
}
