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
  street: string;
  number: string;
  complement: string | null;
  city: string;
  state: string;
  zip: string;
  referenceNote: string | null;
}

export interface DeliveryListItem {
  id: string;
  displayNumber: number;
  companyId: string;
  companyName: string;
  serviceTypeName: string;
  status: DeliveryStatus;
  distanceKm: number | null;
  totalValue: number;
  driverValue: number;
  platformValue: number;
  requiresReturn: boolean;
  returnValue: number | null;
  scheduledAt: string | null;
  createdAt: string;
}

export interface DeliveryDetail extends DeliveryListItem {
  addresses: DeliveryAddressItem[];
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
  dropoffAddress: DeliveryAddressInput;
  requiresReturn?: boolean;
  requiresDeliveryProof?: boolean;
  requiresCollectionRecipient?: boolean;
  pickupSurchargeChargedToDriver?: boolean;
  scheduledAt?: string;
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
}

export interface UpsertCompanyAddressPayload {
  label?: string;
  street: string;
  number: string;
  complement?: string;
  city: string;
  state: string;
  zip: string;
}
