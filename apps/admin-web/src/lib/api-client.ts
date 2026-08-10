import {
  createAdminCompaniesApi,
  createAdminDriversApi,
  createAdminPlatformSettingsApi,
  createAdminPricingTablesApi,
  createAdminServiceTypesApi,
  createAuthApi,
  createDeliveriesApi,
} from '@motoboycity/api-client';

export const baseUrl = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3333';

export const authApi = createAuthApi({ baseUrl });
export const adminCompaniesApi = createAdminCompaniesApi({ baseUrl });
export const adminDriversApi = createAdminDriversApi({ baseUrl });
export const adminServiceTypesApi = createAdminServiceTypesApi({ baseUrl });
export const adminPricingTablesApi = createAdminPricingTablesApi({ baseUrl });
export const adminPlatformSettingsApi = createAdminPlatformSettingsApi({ baseUrl });
export const deliveriesApi = createDeliveriesApi({ baseUrl });
