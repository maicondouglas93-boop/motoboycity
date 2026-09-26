import {
  createAuthApi,
  createCompanyAddressApi,
  createCompanyBusinessHoursApi,
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
  createNotificationsApi,
  createCompanyPageProtectionApi,
  createCompanyStoreCatalogApi,
  createCompanyStoreOperationApi,
  createCompanyStoreSettingsApi,
  createPublicStoreApi,
  configureApiClient,
} from '@motoboycity/api-client';
import { pageProtectionSession } from './page-protection-session';

export const apiBaseUrl = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3333';

configureApiClient({
  getPageUnlockToken: (url: string) => pageProtectionSession.getUnlockTokenForUrl(url),
});

export const authApi = createAuthApi({ baseUrl: apiBaseUrl });
export const companyAddressApi = createCompanyAddressApi({ baseUrl: apiBaseUrl });
export const companyBusinessHoursApi = createCompanyBusinessHoursApi({ baseUrl: apiBaseUrl });
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
export const notificationsApi = createNotificationsApi({ baseUrl: apiBaseUrl });
export const companyPageProtectionApi = createCompanyPageProtectionApi({ baseUrl: apiBaseUrl });
export const companyStoreCatalogApi = createCompanyStoreCatalogApi({ baseUrl: apiBaseUrl });
export const companyStoreSettingsApi = createCompanyStoreSettingsApi({ baseUrl: apiBaseUrl });
export const companyStoreOperationApi = createCompanyStoreOperationApi({ baseUrl: apiBaseUrl });
export const publicStoreApi = createPublicStoreApi({ baseUrl: apiBaseUrl });
