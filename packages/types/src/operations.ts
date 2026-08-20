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
