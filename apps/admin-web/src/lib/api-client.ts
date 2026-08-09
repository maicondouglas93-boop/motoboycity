import {
  createAdminCompaniesApi,
  createAdminDriversApi,
  createAuthApi,
} from '@motoboycity/api-client';

const baseUrl = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3333';

export const authApi = createAuthApi({ baseUrl });
export const adminCompaniesApi = createAdminCompaniesApi({ baseUrl });
export const adminDriversApi = createAdminDriversApi({ baseUrl });
