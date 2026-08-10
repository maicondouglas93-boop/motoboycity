export interface DeliveryOfferPayload {
  offerId: string;
  deliveryId: string;
  displayNumber: number;
  driverValue: number;
  distanceKm: number | null;
  requiresReturn: boolean;
  expiresInSeconds: number;
}

export interface AcceptOfferResult {
  deliveryId: string;
  displayNumber: number;
}
