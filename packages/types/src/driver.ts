export type DriverApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
export type DriverAccountStatus = 'ACTIVE' | 'SUSPENDED' | 'BLOCKED';

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
  createdAt: string;
  reviewedBy: { id: string; name: string } | null;
  reviewedAt: string | null;
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
