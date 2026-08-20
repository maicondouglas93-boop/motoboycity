export interface DeliveryOfferAddress {
  street: string | null;
  number: string | null;
  complement: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  referenceNote: string | null;
}

export interface DeliveryOfferItem {
  deliveryId: string;
  displayNumber: number;
  serviceTypeName: string;
  destinationKnownAtCreation: boolean;
  pickupAddress: DeliveryOfferAddress;
  dropoffAddress: DeliveryOfferAddress | null;
  totalValue: number | null;
  driverValue: number | null;
  platformValue: number | null;
  distanceKm: number | null;
  requiresReturn: boolean;
}

export interface DeliveryOfferPayload {
  offerId: string;
  deliveryId: string;
  displayNumber: number;
  companyName: string;
  paymentMethod: 'BILLED' | 'ONLINE';
  totalValue: number | null;
  driverValue: number | null;
  platformValue: number | null;
  distanceKm: number | null;
  requiresReturn: boolean;
  deliveries: DeliveryOfferItem[];
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
