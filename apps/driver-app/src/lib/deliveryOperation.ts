import type { DeliveryAddressItem, DeliveryStatus } from '@motoboycity/types';

const OPERATION_TIME_ZONE = 'America/Sao_Paulo';

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
