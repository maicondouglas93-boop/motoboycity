export interface DeliveryOfferPayload {
  offerId: string;
  deliveryId: string;
  displayNumber: number;
  driverValue: number | null;
  distanceKm: number | null;
  requiresReturn: boolean;
  batchId?: string | null;
  deliveryCount?: number;
  expiresInSeconds: number;
}

export interface AcceptOfferResult {
  deliveryId: string;
  displayNumber: number;
  batchId?: string | null;
  deliveryIds?: string[];
  displayNumbers?: number[];
}
