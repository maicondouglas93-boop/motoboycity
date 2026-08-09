export type DriverApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface RegisterDriverResult {
  driverId: string;
  approvalStatus: DriverApprovalStatus;
}
