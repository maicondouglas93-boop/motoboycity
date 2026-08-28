import {
  createAuthApi,
  createCompanyAddressApi,
  createCompanyProfileApi,
  createCompanyCustomersApi,
  createCompanyFinancialApi,
  createCompanyReportsApi,
  createCompanyInvoicesApi,
  createDeliveriesApi,
  createTrackingApi,
  createServiceTypesApi,
  createPaymentNoticeApi,
  createCompanyIntegrationsApi,
} from '@motoboycity/api-client';

export const apiBaseUrl = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3333';

export const authApi = createAuthApi({ baseUrl: apiBaseUrl });
export const companyAddressApi = createCompanyAddressApi({ baseUrl: apiBaseUrl });
export const companyProfileApi = createCompanyProfileApi({ baseUrl: apiBaseUrl });
export const companyCustomersApi = createCompanyCustomersApi({ baseUrl: apiBaseUrl });
export const companyInvoicesApi = createCompanyInvoicesApi({ baseUrl: apiBaseUrl });
export const companyFinancialApi = createCompanyFinancialApi({ baseUrl: apiBaseUrl });
export const companyReportsApi = createCompanyReportsApi({ baseUrl: apiBaseUrl });
export const deliveriesApi = createDeliveriesApi({ baseUrl: apiBaseUrl });
export const trackingApi = createTrackingApi({ baseUrl: apiBaseUrl });
export const serviceTypesApi = createServiceTypesApi({ baseUrl: apiBaseUrl });
export const paymentNoticeApi = createPaymentNoticeApi({ baseUrl: apiBaseUrl });
export const companyIntegrationsApi = createCompanyIntegrationsApi({ baseUrl: apiBaseUrl });
