import { io, type Socket } from 'socket.io-client';
import type { DeliveryOfferPayload } from '@motoboycity/types';
import { API_BASE_URL } from './config';
import { useDispatchStore } from '../store/dispatchStore';

export interface DriverSocketHandlers {
  onOffer: (offer: DeliveryOfferPayload) => void;
  onOfferExpired: (offerId: string) => void;
  onOfferCancelled: (offerId: string) => void;
}

let socket: Socket | null = null;

/**
 * Conexão única com o RealtimeGateway, autenticada com o mesmo JWT da
 * sessão (RealtimeGateway lê de handshake.auth.token). Reconectar chama
 * disconnect na conexão anterior primeiro — não deveria acontecer na
 * prática (HomeScreen só conecta uma vez no mount), mas evita vazar um
 * socket duplicado se algo chamar isso de novo.
 */
export function connectDriverSocket(token: string, handlers: DriverSocketHandlers): Socket {
  if (socket) {
    socket.disconnect();
  }

  socket = io(API_BASE_URL, { auth: { token } });

  socket.on('connect', () => useDispatchStore.getState().setSocketConnected(true));
  socket.on('disconnect', () => useDispatchStore.getState().setSocketConnected(false));
  socket.on('delivery:offer', (payload: DeliveryOfferPayload) => handlers.onOffer(payload));
  socket.on('delivery:offer-expired', (payload: { offerId: string }) =>
    handlers.onOfferExpired(payload.offerId),
  );
  socket.on('delivery:offer-cancelled', (payload: { offerId: string }) =>
    handlers.onOfferCancelled(payload.offerId),
  );

  return socket;
}

export function disconnectDriverSocket(): void {
  socket?.disconnect();
  socket = null;
}
