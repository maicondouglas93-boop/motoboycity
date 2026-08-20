import {
  createAuthApi,
  createDeliveriesApi,
  createDeliveryOffersApi,
  createDriverPresenceApi,
  createDriverWalletApi,
  createTrackingApi,
} from '@motoboycity/api-client';
import { API_BASE_URL } from './config';

export const authApi = createAuthApi({ baseUrl: API_BASE_URL });
export const driverPresenceApi = createDriverPresenceApi({ baseUrl: API_BASE_URL });
export const driverWalletApi = createDriverWalletApi({ baseUrl: API_BASE_URL });
export const deliveryOffersApi = createDeliveryOffersApi({ baseUrl: API_BASE_URL });
export const deliveriesApi = createDeliveriesApi({ baseUrl: API_BASE_URL });
export const trackingApi = createTrackingApi({ baseUrl: API_BASE_URL });
