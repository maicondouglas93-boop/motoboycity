import type { CompanyStatus } from './company.js';
import type { DriverApprovalStatus } from './driver.js';
import type { AuthUser } from './user.js';

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
