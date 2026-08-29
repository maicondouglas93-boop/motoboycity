export type DriverApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
export type DriverAccountStatus = 'ACTIVE' | 'SUSPENDED' | 'BLOCKED';
export type DriverAvailability = 'AVAILABLE' | 'UNAVAILABLE';

export interface DriverPresenceItem {
  availability: DriverAvailability;
  since: string | null;
  /**
   * Punicao em vigor, ou `null`.
   *
   * Viaja junto com a presenca porque e a mesma pergunta do ponto de vista do
   * motoboy: "estou recebendo pedido agora?". Sem isso, quem foi punido ve o
   * botao Ativo ligado e nenhuma oferta chegando, e conclui que o aplicativo
   * quebrou — a chamada de suporte que a punicao silenciosa sempre gera.
   */
  punishment: DriverPunishmentStatus | null;
}

export interface DriverDispatchQueueEntry {
  position: number;
  name: string;
  isCurrentDriver: boolean;
}

/**
 * Visao sanitizada da fila global de despacho para o motoboy online.
 *
 * Nao inclui telefone, coordenadas nem identificadores dos demais motoboys.
 */
export interface DriverDispatchQueueResult {
  queueName: string;
  currentPosition: number | null;
  totalDrivers: number;
  drivers: DriverDispatchQueueEntry[];
  generatedAt: string;
}

export interface DriverLiveLocationInput {
  lat: number;
  lng: number;
  accuracy?: number;
}

export type SetDriverPresencePayload =
  | {
      availability: 'AVAILABLE';
      location: DriverLiveLocationInput;
      appVersion: string;
      trackingCapability: 'BACKGROUND_V1';
    }
  | { availability: 'UNAVAILABLE' };

export interface DriverPresenceHeartbeatPayload extends DriverLiveLocationInput {
  appVersion: string;
}

export interface RegisterDriverResult {
  driverId: string;
  approvalStatus: DriverApprovalStatus;
}

export interface AdminDriverListItem {
  id: string;
  name: string;
  email: string;
  phone: string;
  cpf: string;
  region: { id: string; name: string };
  approvalStatus: DriverApprovalStatus;
  accountStatus: DriverAccountStatus;
  availability: DriverAvailability;
  appVersion: string | null;
  lastSeenAt: string | null;
  createdAt: string;
  reviewedBy: { id: string; name: string } | null;
  reviewedAt: string | null;
  serviceTypes: DriverServiceTypeItem[];
  /**
   * Quantas vezes este motoboy devolveu a fila um pedido que ja tinha aceitado,
   * nos ultimos 7 dias.
   *
   * Existe para o admin OLHAR, nao para o sistema bloquear. Numa operacao de
   * cinco motoboys, bloquear um automaticamente e perder 20% da frota por causa
   * de uma semana ruim — a decisao e de quem conhece as pessoas.
   */
  returnsLast7Days: number;
}

export type DriverDocumentType = 'SELFIE' | 'RG' | 'CNH_FRONT' | 'CNH_BACK' | 'PROOF_OF_ADDRESS';
export type DocumentReviewStatus = 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED';

export interface AdminDriverDocument {
  id: string;
  type: DriverDocumentType;
  url: string;
  reviewStatus: DocumentReviewStatus;
  rgIssuer: string | null;
  cnhNumber: string | null;
  cnhExpiresAt: string | null;
  cnhIsPaidActivity: boolean | null;
  createdAt: string;
}

export interface AdminDriverDetail extends AdminDriverListItem {
  birthDate: string;
  pixKey: string;
  pixKeyType: string;
  hasCnpj: boolean;
  documents: AdminDriverDocument[];
}

export interface AdminDriverRegistrationOptions {
  regions: Array<{ id: string; name: string }>;
}

export interface DriverServiceTypeItem {
  id: string;
  code: string;
  name: string;
  isPrimary: boolean;
}

export interface ReplaceDriverServiceTypesPayload {
  serviceTypeIds: string[];
}

export interface DriverServiceTypesResult {
  driverId: string;
  serviceTypes: DriverServiceTypeItem[];
}

export interface DriverReviewResult {
  driverId: string;
  approvalStatus: DriverApprovalStatus;
  reviewedByUserId: string;
  reviewedAt: string;
}

export interface DriverAccountStatusResult {
  driverId: string;
  accountStatus: DriverAccountStatus;
}

/** Empresa cujos novos pedidos este motoboy nao pode atender. */
export interface AdminDriverCompanyBlockItem {
  id: string;
  driverId: string;
  company: { id: string; tradeName: string };
  reason: string;
  blockedAt: string;
}

/**
 * Punicao automatica por recusa/expiracao de oferta.
 *
 * O motoboy punido continua online e continua tocando o que ja aceitou; o que
 * para e a chegada de oferta nova ate `expiresAt`.
 */
export type DriverPunishmentTrigger = 'DECLINED' | 'EXPIRED' | 'DECLINED_OR_EXPIRED';
export type DriverPunishmentReason = 'DECLINED_OFFER' | 'EXPIRED_OFFER';

/**
 * O que o proprio motoboy ve no aplicativo. Deliberadamente curto: prazo,
 * motivo e quantas recusas somaram. Nao expoe qual pedido fechou a conta, para
 * o aviso nao virar um convite a discutir um pedido especifico com a loja.
 */
export interface DriverPunishmentStatus {
  reason: DriverPunishmentReason;
  offerCount: number;
  minutes: number;
  appliedAt: string;
  expiresAt: string;
}

/** A mesma punicao, com o contexto que o administrador precisa para julgar. */
export interface AdminDriverPunishmentItem {
  id: string;
  reason: DriverPunishmentReason;
  offerCount: number;
  minutes: number;
  appliedAt: string;
  expiresAt: string;
  /** True somente enquanto `expiresAt` esta no futuro e ninguem liberou antes. */
  active: boolean;
  delivery: { id: string; displayNumber: number } | null;
  revokedAt: string | null;
  revokedBy: { id: string; name: string } | null;
  revokedReason: string | null;
}

export interface RevokeDriverPunishmentInput {
  reason: string;
}
