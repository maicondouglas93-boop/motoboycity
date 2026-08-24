export type DeliveryStatus =
  | 'SCHEDULED'
  | 'AWAITING_DRIVER'
  | 'ACCEPTED'
  | 'COLLECTED'
  | 'DELIVERED'
  /** Coletado mas nao entregue: a mercadoria volta para a loja. */
  | 'FAILED'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'AWAITING_PAYMENT';

export type CustomerPaymentMethod = 'PREPAID' | 'CARD' | 'CASH' | 'PIX';

export interface DeliveryAddressItem {
  type: string;
  street: string | null;
  number: string | null;
  complement: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  lat: number | null;
  lng: number | null;
  referenceNote: string | null;
}

export interface DeliveryListItem {
  id: string;
  displayNumber: number;
  companyId: string;
  companyName: string;
  batchId: string | null;
  serviceTypeId: string;
  serviceTypeName: string;
  status: DeliveryStatus;
  destinationKnownAtCreation: boolean;
  distanceKm: number | null;
  totalValue: number | null;
  driverValue: number | null;
  platformValue: number | null;
  requiresReturn: boolean;
  returnValue: number | null;
  paymentMethod: 'BILLED' | 'ONLINE';
  recipientName: string | null;
  recipientPhone: string | null;
  externalOrderNumber: string | null;
  driverNote: string | null;
  customerPaymentMethod: CustomerPaymentMethod | null;
  /** Nome e valor da taxa adicional vigente na criação, congelados. */
  surchargeLabel: string | null;
  surchargeValue: number | null;
  statusChangedAt: string;
  scheduledAt: string | null;
  createdAt: string;
}

export interface DeliveryDetail extends DeliveryListItem {
  addresses: DeliveryAddressItem[];
  driver: { id: string; name: string; email: string; phone: string } | null;
  invoice: {
    id: string;
    number: string;
    status: 'PENDING' | 'PAID' | 'OVERDUE' | 'CANCELLED';
  } | null;
  statusHistory: Array<{
    fromStatus: DeliveryStatus | null;
    toStatus: DeliveryStatus;
    changedAt: string;
    changedBy: { id: string; name: string } | null;
    note: string | null;
  }>;
}

export interface DeliveryAddressInput {
  street: string;
  number: string;
  complement?: string;
  city: string;
  state: string;
  zip: string;
  referenceNote?: string;
  lat?: number;
  lng?: number;
}

export interface CreateDeliveryPayload {
  serviceTypeId: string;
  destinationKnownAtCreation?: boolean;
  dropoffAddress?: DeliveryAddressInput;
  recipientName?: string;
  recipientPhone?: string;
  externalOrderNumber?: string;
  driverNote?: string;
  customerPaymentMethod?: CustomerPaymentMethod;
  requiresReturn?: boolean;
  requiresDeliveryProof?: boolean;
  requiresCollectionRecipient?: boolean;
  pickupSurchargeChargedToDriver?: boolean;
  scheduledAt?: string;
}

export interface CreateDeliveryBatchPayload {
  deliveries: CreateDeliveryPayload[];
}

export interface DeliveryBatchDetail {
  batchId: string;
  deliveries: DeliveryDetail[];
}

export interface DeliveryGroupResult {
  batchId: string | null;
  deliveries: DeliveryDetail[];
}

export interface OperationalDeliveryItem extends DeliveryListItem {
  addresses: DeliveryAddressItem[];
  /**
   * `avatarUrl` e nulo quando o motoboy nao enviou foto — o caso comum
   * enquanto o envio e novo. O mapa desenha as iniciais nesse caso.
   */
  driver: { id: string; name: string; phone: string; avatarUrl: string | null } | null;
  lastLocation: DeliveryTrackingPoint | null;
}

export interface DeliveryOperationsResult {
  active: OperationalDeliveryItem[];
  recent: OperationalDeliveryItem[];
  counts: Partial<Record<DeliveryStatus, number>>;
}

export interface DeliverySearchResult {
  items: DeliveryListItem[];
  page: number;
  pageSize: number;
  total: number;
}

export interface DeliveryDispatchAuditItem {
  id: string;
  offerId: string;
  driver: { id: string; name: string };
  offeredAt: string;
  respondedAt: string | null;
  response: 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'EXPIRED';
}

export interface MarkDeliveredPayload {
  lat?: number;
  lng?: number;
  /** Raio de erro do fix em metros — ver mark-delivered.schema.ts. */
  accuracy?: number;
  /**
   * Marcação retroativa: o motoboy esqueceu de tocar na hora e informa quando
   * entregou, em ISO 8601.
   *
   * Recusado quando o preço da entrega é definido pelo GPS do momento — ali a
   * coordenada é o valor, e declarar só o horário deixaria o preço vindo de uma
   * posição errada.
   */
  occurredAt?: string;
}

export interface CompleteReturnPayload {
  lat: number;
  lng: number;
  /** Raio de erro do fix em metros — ver complete-return.schema.ts. */
  accuracy?: number;
}

export interface DeliveryTrackingPoint {
  id: string;
  lat: number;
  lng: number;
  accuracy: number | null;
  capturedAt: string;
}

export interface DeliveryTrackingDetail {
  deliveryId: string;
  displayNumber: number;
  status: DeliveryStatus;
  isActive: boolean;
  driver: { id: string; name: string } | null;
  lastLocation: DeliveryTrackingPoint | null;
  points: DeliveryTrackingPoint[];
  historyAvailableSince: string;
}

export interface ActiveDeliveryTrackingItem {
  deliveryId: string;
  displayNumber: number;
  companyId: string;
  companyName: string;
  driver: { id: string; name: string; phone: string };
  status: DeliveryStatus;
  lastLocation: DeliveryTrackingPoint | null;
}

export interface CompanyAddressItem {
  id: string;
  label: string | null;
  street: string;
  number: string;
  complement: string | null;
  city: string;
  state: string;
  zip: string;
  lat: number | null;
  lng: number | null;
}

export interface UpsertCompanyAddressPayload {
  label?: string;
  street: string;
  number: string;
  complement?: string;
  city: string;
  state: string;
  zip: string;
  lat?: number;
  lng?: number;
}

/**
 * Tempo por etapa do ciclo, derivado do historico de status — nenhuma coluna
 * nova no banco.
 *
 * Media, mediana e p90 juntas de proposito: media de tempo esconde a cauda, e
 * a cauda e onde mora o cliente irritado. `samples` acompanha cada etapa
 * porque com poucas amostras o p90 deixa de dizer algo util.
 */
export interface DeliveryStageSummary {
  samples: number;
  averageMinutes: number | null;
  medianMinutes: number | null;
  p90Minutes: number | null;
}

export interface DeliveryStageTimesResult {
  /** Da entrada na fila ate um motoboy aceitar. */
  aceite: DeliveryStageSummary;
  /** Do aceite ate a coleta na loja. */
  coleta: DeliveryStageSummary;
  /** Da coleta ate a entrega ao cliente. */
  entrega: DeliveryStageSummary;
  /** Da fila ate a entrega — o tempo total sentido por quem pediu. */
  total: DeliveryStageSummary;
}

/**
 * Pedido que ninguém aceitou e ficou sem oferta pendente — a "vitrine".
 *
 * O empurrão sozinho tem um buraco: esgotada a fila de motoboys elegíveis, o
 * pedido para de se mexer, e quem deixou a oferta expirar nunca mais o vê. Aqui
 * ele reaparece para todos.
 */
export interface AvailableDeliveryItem {
  id: string;
  displayNumber: number;
  companyName: string;
  serviceTypeName: string;
  destinationKnownAtCreation: boolean;
  distanceKm: number | null;
  driverValue: number | null;
  requiresReturn: boolean;
  batchId: string | null;
  addresses: DeliveryAddressItem[];
  createdAt: string;
}
