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

export interface CompanyCustomer {
  id: string;
  name: string;
  cpf: string | null;
  phone: string;
  address: CompanyCustomerAddress;
  createdAt: string;
  updatedAt: string;
}

export interface CompanyCustomerListResult {
  items: CompanyCustomer[];
  total: number;
  page: number;
  pageSize: number;
}
