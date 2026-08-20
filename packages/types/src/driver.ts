export type DriverApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
export type DriverAccountStatus = 'ACTIVE' | 'SUSPENDED' | 'BLOCKED';
export type DriverAvailability = 'AVAILABLE' | 'UNAVAILABLE';

export interface DriverPresenceItem {
  availability: DriverAvailability;
  since: string | null;
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
  approvalStatus: DriverApprovalStatus;
  accountStatus: DriverAccountStatus;
  availability: DriverAvailability;
  createdAt: string;
  reviewedBy: { id: string; name: string } | null;
  reviewedAt: string | null;
  serviceTypes: DriverServiceTypeItem[];
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
