import { io, type Socket } from 'socket.io-client';
import type { DeliveryOfferPayload, DriverAccountStatus } from '@motoboycity/types';
import { API_BASE_URL } from './config';
import { useDispatchStore } from '../store/dispatchStore';

export interface DriverSocketHandlers {
  onConnected: () => void;
  onOffer: (offer: DeliveryOfferPayload) => void;
  onOfferExpired: (offerId: string) => void;
  onOfferCancelled: (offerId: string) => void;
  onDeliveryCancelled: (deliveryIds: string[]) => void;
  onAccountStatusChanged: (accountStatus: DriverAccountStatus) => void;
  /**
   * O servidor percebeu que ele esta com pedido em andamento e parou de mandar
   * posicao.
   *
   * Este aviso so chega com o app VIVO, que e o caso de rastreamento quebrado
   * com o app aberto — permissao revogada, GPS desligado, economia de bateria
   * matando o servico de localizacao. App encerrado de vez nao tem socket, e
   * ai quem ve o problema e o admin.
   */
  onLocationLost: (info: { activeDeliveryCount: number; silentMinutes: number }) => void;
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

  socket.on('connect', () => {
    useDispatchStore.getState().setSocketConnected(true);
    handlers.onConnected();
  });
  socket.on('disconnect', () => useDispatchStore.getState().setSocketConnected(false));
  socket.on('delivery:offer', (payload: DeliveryOfferPayload) => handlers.onOffer(payload));
  socket.on('delivery:offer-expired', (payload: { offerId: string }) =>
    handlers.onOfferExpired(payload.offerId),
  );
  socket.on('delivery:offer-cancelled', (payload: { offerId: string }) =>
    handlers.onOfferCancelled(payload.offerId),
  );
  socket.on('delivery:cancelled', (payload: { deliveryIds: string[] }) =>
    handlers.onDeliveryCancelled(payload.deliveryIds),
  );
  socket.on('driver:account-status-changed', (payload: { accountStatus: DriverAccountStatus }) =>
    handlers.onAccountStatusChanged(payload.accountStatus),
  );
  socket.on(
    'driver:location-lost',
    (payload: { activeDeliveryCount: number; silentMinutes: number }) =>
      handlers.onLocationLost(payload),
  );

  return socket;
}

export function disconnectDriverSocket(): void {
  socket?.disconnect();
  socket = null;
}
