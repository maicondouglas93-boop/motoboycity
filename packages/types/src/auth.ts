import type { CompanyStatus } from './company';
import type { DriverApprovalStatus } from './driver';
import type { AuthUser } from './user';

export interface RegisterCompanyResult {
  companyId: string;
  status: CompanyStatus;
}

export interface LoginResult {
  accessToken: string;
  user: AuthUser;
  company?: {
    id: string;
    status: CompanyStatus;
  };
  driver?: {
    id: string;
    approvalStatus: DriverApprovalStatus;
  };
}
