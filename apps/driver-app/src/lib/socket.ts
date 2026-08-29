import { io, type Socket } from 'socket.io-client';
import type {
  DeliveryOfferPayload,
  DriverAccountStatus,
  DriverPunishmentStatus,
} from '@motoboycity/types';
import { API_BASE_URL } from './config';
import { useDispatchStore } from '../store/dispatchStore';

export interface DriverSocketHandlers {
  onConnected: () => void;
  onOffer: (offer: DeliveryOfferPayload) => void;
  onOfferExpired: (offerId: string) => void;
  onOfferCancelled: (offerId: string) => void;
  onDeliveryCancelled: (deliveryIds: string[]) => void;
  onPickupExpired: (deliveryIds: string[]) => void;
  onAccountStatusChanged: (accountStatus: DriverAccountStatus) => void;
  /**
   * Ele saiu do despacho por ter recusado ofertas seguidas. Continua online e
   * continua tocando o que ja aceitou; o que para e a chegada de oferta nova.
   */
  onPunishmentApplied: (punishment: DriverPunishmentStatus) => void;
  /** O administrador liberou antes do prazo. */
  onPunishmentLifted: () => void;
  onPresenceExpired: () => void;
  onQueueUpdated: () => void;
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
  /**
   * O servidor recusou esta conexao e a derrubou.
   *
   * E o unico desligamento que o socket.io NAO tenta reconectar sozinho: com o
   * motivo `io server disconnect` ele marca a conexao como inativa e para de
   * vez. O gateway usa exatamente esse caminho quando o JWT nao vale, quando o
   * usuario sumiu ou quando a senha foi trocada — entao, sem este aviso, o
   * canal em tempo real morria em silencio pelo resto da vida do aplicativo
   * enquanto a tela continuava dizendo "Reconectando...".
   */
  onServerRefused: () => void;
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
  socket.on('disconnect', (reason) => {
    useDispatchStore.getState().setSocketConnected(false);
    if (reason === 'io server disconnect') handlers.onServerRefused();
  });
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
  socket.on('delivery:pickup-expired', (payload: { deliveryIds: string[] }) =>
    handlers.onPickupExpired(payload.deliveryIds),
  );
  socket.on('driver:account-status-changed', (payload: { accountStatus: DriverAccountStatus }) =>
    handlers.onAccountStatusChanged(payload.accountStatus),
  );
  socket.on('driver:punishment-applied', (payload: DriverPunishmentStatus) =>
    handlers.onPunishmentApplied(payload),
  );
  socket.on('driver:punishment-lifted', () => handlers.onPunishmentLifted());
  socket.on('driver:presence-expired', () => handlers.onPresenceExpired());
  socket.on('driver-queue:updated', () => handlers.onQueueUpdated());
  socket.on(
    'driver:location-lost',
    (payload: { activeDeliveryCount: number; silentMinutes: number }) =>
      handlers.onLocationLost(payload),
  );

  return socket;
}

/**
 * Religa a conexao que o servidor derrubou, reusando os mesmos handlers.
 *
 * So faz sentido depois de confirmar que a credencial continua valendo: o
 * socket.io nao reconecta sozinho apos `io server disconnect`, e insistir com um
 * token recusado apenas repetiria o ciclo.
 */
export function reconnectDriverSocket(): void {
  socket?.connect();
}

export function disconnectDriverSocket(): void {
  socket?.disconnect();
  socket = null;
}
