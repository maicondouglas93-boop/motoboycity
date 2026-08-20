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
  approvedBy: { id: string; name: string } | null;
  approvedAt: string | null;
}

export interface AdminCompanyDetail extends AdminCompanyListItem {
  region: { id: string; name: string };
  addresses: Array<{
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
    isPrimary: boolean;
    createdAt: string;
  }>;
  teamMembers: Array<{
    id: string;
    role: 'OWNER' | 'OPERATOR';
    active: boolean;
    joinedAt: string;
    user: { id: string; name: string; email: string; phone: string };
  }>;
}

export interface ApproveCompanyResult {
  companyId: string;
  status: CompanyStatus;
  approvedByUserId: string;
  approvedAt: string;
}
