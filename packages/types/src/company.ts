export type CompanyStatus = 'PENDING_APPROVAL' | 'ACTIVE' | 'SUSPENDED';

export interface AdminCompanyListItem {
  id: string;
  legalName: string;
  tradeName: string;
  document: string;
  status: CompanyStatus;
  createdAt: string;
  owner: {
    name: string;
    email: string;
    phone: string;
  } | null;
}

export interface ApproveCompanyResult {
  companyId: string;
  status: CompanyStatus;
}
