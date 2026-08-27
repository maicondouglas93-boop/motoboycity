import type { RouteStop } from '../components/RouteTimeline';
import type { ActiveDeliveryItem } from './activeDeliveries';
import { formatDeliveryAddress } from './deliveryOperation';

export function pickupCountdownLabel(
  delivery: Pick<ActiveDeliveryItem, 'status' | 'pickupDeadlineAt'>,
  nowMs: number,
): string | undefined {
  if (delivery.status !== 'ACCEPTED' || !delivery.pickupDeadlineAt) return undefined;

  const deadlineMs = Date.parse(delivery.pickupDeadlineAt);
  if (Number.isNaN(deadlineMs)) return undefined;

  const totalSeconds = Math.max(0, Math.ceil((deadlineMs - nowMs) / 1_000));
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  const twoDigits = (value: number) => String(value).padStart(2, '0');

  return hours > 0
    ? `${hours}:${twoDigits(minutes)}:${twoDigits(seconds)}`
    : `${twoDigits(minutes)}:${twoDigits(seconds)}`;
}

export function activeDeliveryStops(delivery: ActiveDeliveryItem): RouteStop[] {
  const pickup = delivery.addresses?.find((address) => address.type === 'PICKUP');
  const dropoff = delivery.addresses?.find((address) => address.type === 'DROPOFF');
  const accepted = ['ACCEPTED', 'COLLECTED', 'DELIVERED', 'FAILED'].includes(delivery.status);
  const delivered = delivery.status === 'DELIVERED';
  const stops: RouteStop[] = [
    {
      icon: 'house',
      done: accepted,
      address: pickup ? formatDeliveryAddress(pickup) : 'Endereço de coleta',
    },
    {
      icon: 'pin',
      done: delivered,
      address: delivery.destinationKnownAtCreation
        ? dropoff
          ? formatDeliveryAddress(dropoff)
          : 'Endereço de entrega'
        : 'Endereço de entrega definido no momento da entrega',
    },
  ];

  // FAILED também exige devolver a mercadoria, mesmo quando o pedido original
  // não tinha retorno comercial contratado.
  if (delivery.requiresReturn || delivery.status === 'FAILED') {
    stops.push({
      icon: 'return',
      address: pickup ? formatDeliveryAddress(pickup) : 'Retorno ao endereço de coleta',
    });
  }

  return stops;
}
