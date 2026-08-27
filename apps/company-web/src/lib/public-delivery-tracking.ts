import type {
  PublicDeliveryTracking,
  PublicDeliveryTrackingLocation,
  PublicDeliveryTrackingStatus,
} from '@motoboycity/types';

export function isPublicTrackingTerminal(status: PublicDeliveryTrackingStatus): boolean {
  return status === 'COMPLETED' || status === 'CANCELLED';
}

export function applyPublicTrackingLocation(
  current: PublicDeliveryTracking | undefined,
  location: PublicDeliveryTrackingLocation,
): PublicDeliveryTracking | undefined {
  if (!current || isPublicTrackingTerminal(current.status)) return current;
  return { ...current, location };
}

export function applyPublicTrackingUpdate(
  current: PublicDeliveryTracking | undefined,
  update: PublicDeliveryTracking,
): PublicDeliveryTracking {
  return {
    ...(current ?? update),
    ...update,
    location: isPublicTrackingTerminal(update.status)
      ? null
      : (current?.location ?? update.location),
  };
}
