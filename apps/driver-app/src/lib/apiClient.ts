import { createAuthApi, createDeliveryOffersApi, createDriverPresenceApi } from '@motoboycity/api-client';
import { API_BASE_URL } from './config';

export const authApi = createAuthApi({ baseUrl: API_BASE_URL });
export const driverPresenceApi = createDriverPresenceApi({ baseUrl: API_BASE_URL });
export const deliveryOffersApi = createDeliveryOffersApi({ baseUrl: API_BASE_URL });
