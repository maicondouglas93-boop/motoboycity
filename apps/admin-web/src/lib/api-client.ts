import {
  createAdminCompaniesApi,
  createAdminDriversApi,
  createAdminFinancialApi,
  createAdminInvoicesApi,
  createAdminPlatformSettingsApi,
  createAdminPricingTablesApi,
  createAdminBusinessHoursApi,
  createAdminDeliveriesApi,
  createAdminSurchargesApi,
  createAdminReportsApi,
  createAdminServiceTypesApi,
  createAdminOperationsApi,
  createAdminVirtualSecretaryApi,
  createAdminAuditApi,
  createAdminRegionsApi,
  createAuthApi,
  createDeliveriesApi,
  createTrackingApi,
  createPaymentNoticeApi,
  createNotificationsApi,
} from '@motoboycity/api-client';

export const baseUrl = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3333';

export const authApi = createAuthApi({ baseUrl });
export const adminCompaniesApi = createAdminCompaniesApi({ baseUrl });
export const adminDriversApi = createAdminDriversApi({ baseUrl });
export const adminFinancialApi = createAdminFinancialApi({ baseUrl });
export const adminInvoicesApi = createAdminInvoicesApi({ baseUrl });
export const adminServiceTypesApi = createAdminServiceTypesApi({ baseUrl });
export const adminPricingTablesApi = createAdminPricingTablesApi({ baseUrl });
export const adminSurchargesApi = createAdminSurchargesApi({ baseUrl });
export const adminBusinessHoursApi = createAdminBusinessHoursApi({ baseUrl });
export const adminDeliveriesApi = createAdminDeliveriesApi({ baseUrl });
export const adminReportsApi = createAdminReportsApi({ baseUrl });
export const adminPlatformSettingsApi = createAdminPlatformSettingsApi({ baseUrl });
export const adminOperationsApi = createAdminOperationsApi({ baseUrl });
export const adminVirtualSecretaryApi = createAdminVirtualSecretaryApi({ baseUrl });
export const adminAuditApi = createAdminAuditApi({ baseUrl });
export const adminRegionsApi = createAdminRegionsApi({ baseUrl });
export const deliveriesApi = createDeliveriesApi({ baseUrl });
export const trackingApi = createTrackingApi({ baseUrl });
export const paymentNoticeApi = createPaymentNoticeApi({ baseUrl });
export const notificationsApi = createNotificationsApi({ baseUrl });
