import type { PublicDeliveryTrackingStatus } from '@motoboycity/types';
import type { DeliveryStatus } from '@prisma/client';

const PUBLIC_ACTIVE_STATUSES: DeliveryStatus[] = [
  'SCHEDULED',
  'AWAITING_DRIVER',
  'ACCEPTED',
  'COLLECTED',
];

export function isPublicTrackingActive(status: DeliveryStatus): boolean {
  return PUBLIC_ACTIVE_STATUSES.includes(status);
}

export function hasPublicLiveLocation(status: DeliveryStatus): boolean {
  return status === 'ACCEPTED' || status === 'COLLECTED';
}

export function toPublicTrackingStatus(status: DeliveryStatus): PublicDeliveryTrackingStatus {
  if (status === 'SCHEDULED' || status === 'AWAITING_DRIVER') return 'WAITING_DRIVER';
  if (status === 'ACCEPTED') return 'DRIVER_ASSIGNED';
  if (status === 'COLLECTED') return 'IN_TRANSIT';
  if (status === 'DELIVERED' || status === 'COMPLETED') return 'COMPLETED';
  return 'CANCELLED';
}
