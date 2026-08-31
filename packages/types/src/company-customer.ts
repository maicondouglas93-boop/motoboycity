export interface CompanyCustomerAddress {
  street: string;
  number: string;
  complement: string | null;
  city: string;
  state: string;
  zip: string;
  lat: number | null;
  lng: number | null;
  referenceNote: string | null;
}

export interface CompanyCustomerSavedAddress extends CompanyCustomerAddress {
  id: string;
  label: string;
  isPrimary: boolean;
}

export interface CompanyCustomerStatistics {
  totalDeliveries: number;
  lastDeliveryAt: string | null;
  inProgressDeliveries: number;
  completedDeliveries: number;
  cancelledDeliveries: number;
  mostUsedAddresses: Array<{
    address: string;
    savedAddressLabel: string | null;
    deliveries: number;
  }>;
}

export interface CompanyCustomer {
  id: string;
  name: string;
  cpf: string | null;
  phone: string;
  addressLabel: string;
  address: CompanyCustomerAddress;
  addresses: CompanyCustomerSavedAddress[];
  createdAt: string;
  updatedAt: string;
}

export interface CompanyCustomerDetail extends CompanyCustomer {
  statistics: CompanyCustomerStatistics;
}

export interface CompanyCustomerListResult {
  items: CompanyCustomer[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CompanyCustomerRankingItem {
  id: string;
  name: string;
  phone: string;
  totalDeliveries: number;
  completedDeliveries: number;
  inProgressDeliveries: number;
  cancelledDeliveries: number;
  lastDeliveryAt: string | null;
}

export interface CompanyCustomerRankingResult {
  items: CompanyCustomerRankingItem[];
}
