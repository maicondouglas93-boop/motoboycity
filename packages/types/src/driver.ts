export type DriverApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
export type DriverAccountStatus = 'ACTIVE' | 'SUSPENDED' | 'BLOCKED';
export type DriverAvailability = 'AVAILABLE' | 'UNAVAILABLE';

export interface DriverPresenceItem {
  availability: DriverAvailability;
  since: string | null;
}

export interface DriverLiveLocationInput {
  lat: number;
  lng: number;
  accuracy?: number;
}

export type SetDriverPresencePayload =
  | {
      availability: 'AVAILABLE';
      location: DriverLiveLocationInput;
      appVersion: string;
      trackingCapability: 'BACKGROUND_V1';
    }
  | { availability: 'UNAVAILABLE' };

export interface DriverPresenceHeartbeatPayload extends DriverLiveLocationInput {
  appVersion: string;
}

export interface RegisterDriverResult {
  driverId: string;
  approvalStatus: DriverApprovalStatus;
}

export interface AdminDriverListItem {
  id: string;
  name: string;
  email: string;
  phone: string;
  cpf: string;
  region: { id: string; name: string };
  approvalStatus: DriverApprovalStatus;
  accountStatus: DriverAccountStatus;
  availability: DriverAvailability;
  appVersion: string | null;
  lastSeenAt: string | null;
  createdAt: string;
  reviewedBy: { id: string; name: string } | null;
  reviewedAt: string | null;
  serviceTypes: DriverServiceTypeItem[];
  /**
   * Quantas vezes este motoboy devolveu a fila um pedido que ja tinha aceitado,
   * nos ultimos 7 dias.
   *
   * Existe para o admin OLHAR, nao para o sistema bloquear. Numa operacao de
   * cinco motoboys, bloquear um automaticamente e perder 20% da frota por causa
   * de uma semana ruim — a decisao e de quem conhece as pessoas.
   */
  returnsLast7Days: number;
}

export type DriverDocumentType = 'SELFIE' | 'RG' | 'CNH_FRONT' | 'CNH_BACK' | 'PROOF_OF_ADDRESS';
export type DocumentReviewStatus = 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED';

export interface AdminDriverDocument {
  id: string;
  type: DriverDocumentType;
  url: string;
  reviewStatus: DocumentReviewStatus;
  rgIssuer: string | null;
  cnhNumber: string | null;
  cnhExpiresAt: string | null;
  cnhIsPaidActivity: boolean | null;
  createdAt: string;
}

export interface AdminDriverDetail extends AdminDriverListItem {
  birthDate: string;
  pixKey: string;
  pixKeyType: string;
  hasCnpj: boolean;
  documents: AdminDriverDocument[];
}

export interface AdminDriverRegistrationOptions {
  regions: Array<{ id: string; name: string }>;
}

export interface DriverServiceTypeItem {
  id: string;
  code: string;
  name: string;
  isPrimary: boolean;
}

export interface ReplaceDriverServiceTypesPayload {
  serviceTypeIds: string[];
}

export interface DriverServiceTypesResult {
  driverId: string;
  serviceTypes: DriverServiceTypeItem[];
}

export interface DriverReviewResult {
  driverId: string;
  approvalStatus: DriverApprovalStatus;
  reviewedByUserId: string;
  reviewedAt: string;
}

export interface DriverAccountStatusResult {
  driverId: string;
  accountStatus: DriverAccountStatus;
}
