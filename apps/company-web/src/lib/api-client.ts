import {
  createAuthApi,
  createCompanyAddressApi,
  createDeliveriesApi,
  createServiceTypesApi,
} from '@motoboycity/api-client';

const baseUrl = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3333';

export const authApi = createAuthApi({ baseUrl });
export const companyAddressApi = createCompanyAddressApi({ baseUrl });
export const deliveriesApi = createDeliveriesApi({ baseUrl });
export const serviceTypesApi = createServiceTypesApi({ baseUrl });
