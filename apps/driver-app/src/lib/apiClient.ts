import {
  configureApiClient,
  createAuthApi,
  createDeliveriesApi,
  createDeliveryOffersApi,
  createDriverPresenceApi,
  createDriverWalletApi,
  createPushTokensApi,
  createTrackingApi,
} from '@motoboycity/api-client';
import { API_BASE_URL } from './config';
import { notifySessionExpired } from './sessionExpiry';

/**
 * Prazo mais curto que o padrao do pacote: quem espera aqui esta na rua, de
 * capacete, tentando descobrir se o aplicativo ainda funciona. Trinta segundos
 * parados numa tela sao indistinguiveis de travamento.
 *
 * O timeout e local: ele encerra a espera, nao a requisicao no servidor. Por
 * isso toda acao que muda estado precisa ser idempotente na retentativa — e e,
 * pela outbox de finalizacoes e pelas escritas condicionais da API.
 */
const DRIVER_REQUEST_TIMEOUT_MS = 15_000;

configureApiClient({
  timeoutMs: DRIVER_REQUEST_TIMEOUT_MS,
  onUnauthorized: () => {
    void notifySessionExpired();
  },
});

export const authApi = createAuthApi({ baseUrl: API_BASE_URL });
export const driverPresenceApi = createDriverPresenceApi({ baseUrl: API_BASE_URL });
export const driverWalletApi = createDriverWalletApi({ baseUrl: API_BASE_URL });
export const deliveryOffersApi = createDeliveryOffersApi({ baseUrl: API_BASE_URL });
export const deliveriesApi = createDeliveriesApi({ baseUrl: API_BASE_URL });
export const trackingApi = createTrackingApi({ baseUrl: API_BASE_URL });
export const pushTokensApi = createPushTokensApi({ baseUrl: API_BASE_URL });
