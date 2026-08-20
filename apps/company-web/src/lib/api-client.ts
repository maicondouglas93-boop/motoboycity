import {
  createAuthApi,
  createCompanyAddressApi,
  createCompanyInvoicesApi,
  createDeliveriesApi,
  createTrackingApi,
  createServiceTypesApi,
} from '@motoboycity/api-client';

const baseUrl = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3333';

export const authApi = createAuthApi({ baseUrl });
export const companyAddressApi = createCompanyAddressApi({ baseUrl });
export const companyInvoicesApi = createCompanyInvoicesApi({ baseUrl });
export const deliveriesApi = createDeliveriesApi({ baseUrl });
export const trackingApi = createTrackingApi({ baseUrl });
export const serviceTypesApi = createServiceTypesApi({ baseUrl });
