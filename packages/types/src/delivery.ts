export type DeliveryStatus =
  | 'SCHEDULED'
  | 'AWAITING_DRIVER'
  | 'ACCEPTED'
  | 'COLLECTED'
  | 'DELIVERED'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'AWAITING_PAYMENT';

export interface DeliveryAddressItem {
  type: string;
  street: string | null;
  number: string | null;
  complement: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  lat: number | null;
  lng: number | null;
  referenceNote: string | null;
}

export interface DeliveryListItem {
  id: string;
  displayNumber: number;
  companyId: string;
  companyName: string;
  batchId: string | null;
  serviceTypeName: string;
  status: DeliveryStatus;
  destinationKnownAtCreation: boolean;
  distanceKm: number | null;
  totalValue: number | null;
  driverValue: number | null;
  platformValue: number | null;
  requiresReturn: boolean;
  returnValue: number | null;
  paymentMethod: 'BILLED' | 'ONLINE';
  statusChangedAt: string;
  scheduledAt: string | null;
  createdAt: string;
}

export interface DeliveryDetail extends DeliveryListItem {
  addresses: DeliveryAddressItem[];
  driver: { id: string; name: string; email: string; phone: string } | null;
  invoice: {
    id: string;
    number: string;
    status: 'PENDING' | 'PAID' | 'OVERDUE' | 'CANCELLED';
  } | null;
  statusHistory: Array<{
    fromStatus: DeliveryStatus | null;
    toStatus: DeliveryStatus;
    changedAt: string;
    changedBy: { id: string; name: string } | null;
    note: string | null;
  }>;
}

export interface DeliveryAddressInput {
  street: string;
  number: string;
  complement?: string;
  city: string;
  state: string;
  zip: string;
  referenceNote?: string;
}

export interface CreateDeliveryPayload {
  serviceTypeId: string;
  destinationKnownAtCreation?: boolean;
  dropoffAddress?: DeliveryAddressInput;
  requiresReturn?: boolean;
  requiresDeliveryProof?: boolean;
  requiresCollectionRecipient?: boolean;
  pickupSurchargeChargedToDriver?: boolean;
  scheduledAt?: string;
}

export interface CreateDeliveryBatchPayload {
  deliveries: CreateDeliveryPayload[];
}

export interface DeliveryBatchDetail {
  batchId: string;
  deliveries: DeliveryDetail[];
}

export interface DeliveryGroupResult {
  batchId: string | null;
  deliveries: DeliveryDetail[];
}

export interface MarkDeliveredPayload {
  lat?: number;
  lng?: number;
  /** Raio de erro do fix em metros — ver mark-delivered.schema.ts. */
  accuracy?: number;
}

export interface CompleteReturnPayload {
  lat: number;
  lng: number;
  /** Raio de erro do fix em metros — ver complete-return.schema.ts. */
  accuracy?: number;
}

export interface DeliveryTrackingPoint {
  id: string;
  lat: number;
  lng: number;
  accuracy: number | null;
  capturedAt: string;
}

export interface DeliveryTrackingDetail {
  deliveryId: string;
  displayNumber: number;
  status: DeliveryStatus;
  isActive: boolean;
  driver: { id: string; name: string } | null;
  lastLocation: DeliveryTrackingPoint | null;
  points: DeliveryTrackingPoint[];
  historyAvailableSince: string;
}

export interface ActiveDeliveryTrackingItem {
  deliveryId: string;
  displayNumber: number;
  companyId: string;
  companyName: string;
  driver: { id: string; name: string; phone: string };
  status: DeliveryStatus;
  lastLocation: DeliveryTrackingPoint | null;
}

export interface CompanyAddressItem {
  id: string;
  label: string | null;
  street: string;
  number: string;
  complement: string | null;
  city: string;
  state: string;
  zip: string;
  lat: number | null;
  lng: number | null;
}

export interface UpsertCompanyAddressPayload {
  label?: string;
  street: string;
  number: string;
  complement?: string;
  city: string;
  state: string;
  zip: string;
  lat?: number;
  lng?: number;
}
