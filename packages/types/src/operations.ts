import type {
  DeliveryDispatchAuditItem,
  DeliveryOperationsResult,
  DeliveryStatus,
  DeliveryTrackingPoint,
} from './delivery.js';
import type { DriverServiceTypeItem } from './driver.js';

export type OperationalActivityType =
  | 'DELIVERY_CREATED'
  | 'DELIVERY_STATUS_CHANGED'
  | 'DELIVERY_CANCELLED'
  | 'OFFER_CREATED'
  | 'OFFER_ACCEPTED'
  | 'OFFER_DECLINED'
  | 'OFFER_EXPIRED'
  | 'DRIVER_ONLINE'
  | 'DRIVER_OFFLINE'
  /** Motoboy com pedido em andamento e rastreamento parado. */
  | 'DRIVER_LOCATION_LOST'
  | 'GENERIC';

export interface OperationalActivityEvent {
  id: string;
  type: OperationalActivityType;
  message: string;
  at: string;
  deliveryId?: string;
  displayNumber?: number;
  companyId?: string;
  companyName?: string;
  driverId?: string;
  driverName?: string;
  status?: DeliveryStatus;
}

export interface AdminOnlineDriverItem {
  id: string;
  name: string;
  phone: string;
  /**
   * Foto de perfil, quando o motoboy enviou uma.
   *
   * Nulo e o caso comum enquanto o envio de foto e novo — o mapa desenha as
   * iniciais nesse caso, em vez de um espaco vazio.
   */
  avatarUrl: string | null;
  appVersion: string | null;
  availabilitySince: string | null;
  serviceTypes: DriverServiceTypeItem[];
  location: DeliveryTrackingPoint;
  activeDeliveryIds: string[];
}

export interface AdminOperationsResult extends DeliveryOperationsResult {
  onlineDrivers: AdminOnlineDriverItem[];
  generatedAt: string;
}

export interface AdminDeliveryDispatchAudit {
  deliveryId: string;
  offers: DeliveryDispatchAuditItem[];
}

/**
 * Motoboy com pedido em andamento cujo rastreamento parou de chegar.
 *
 * É o número que responde à ligação da loja perguntando por que o pedido não
 * anda: sem isto, o pedido parece parado no mapa e ninguém sabe por quê.
 */
export interface SilentDriverItem {
  driverId: string;
  driverName: string;
  activeDeliveryCount: number;
  /** Números visíveis dos pedidos, para o admin achar na fila. */
  deliveryNumbers: number[];
  silentMinutes: number;
  lastContactAt: string;
}
