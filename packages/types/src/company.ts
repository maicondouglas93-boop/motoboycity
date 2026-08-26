export type CompanyStatus = 'PENDING_APPROVAL' | 'ACTIVE' | 'SUSPENDED';
export type InvoiceClosingMode = 'AUTOMATIC' | 'MANUAL';
export type InvoiceClosingFrequency = 'WEEKLY' | 'MONTHLY';

export interface AdminCompanyBillingSettings {
  invoiceClosingMode: InvoiceClosingMode;
  invoiceClosingFrequency: InvoiceClosingFrequency | null;
  /** 0 = domingo .. 6 = sabado. */
  invoiceClosingWeekday: number | null;
  /** 1..31; meses curtos usam o ultimo dia civil disponivel. */
  invoiceClosingMonthDay: number | null;
  /** Nulo significa que o bloqueio automatico por atraso esta desabilitado. */
  invoiceOverdueBlockAfterDays: number | null;
  lastAutomaticInvoiceClosingDate: string | null;
  invoiceOverdueBlockedAt: string | null;
}

export interface CompanyProfile {
  companyId: string;
  tradeName: string;
  legalName: string;
  document: string;
  fullName: string;
  email: string;
  whatsapp: string;
  canEdit: boolean;
}

export interface AdminCompanyRegistrationOptions {
  regions: Array<{ id: string; name: string }>;
}

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
  billingSettings: AdminCompanyBillingSettings;
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
