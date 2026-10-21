export type DriverApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
export type DriverAccountStatus = 'ACTIVE' | 'SUSPENDED' | 'BLOCKED';
export type DriverAvailability = 'AVAILABLE' | 'UNAVAILABLE';
/**
 * Como o motoboy é pago. `PER_DELIVERY`: a parte dele de cada entrega vai para
 * a carteira (o padrão). `SALARIED`: salário fixo, pago fora do sistema — a
 * entrega fica inteira com a plataforma, e o app não mostra valores a ele.
 */
export type DriverCompensation = 'PER_DELIVERY' | 'SALARIED';

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
  /**
   * Onde o motoboy esta na escala agora, ou `null` se ele nao tem escala.
   *
   * Viaja junto pelo mesmo motivo da punicao: fora do turno o botao Ativo
   * pode continuar ligado (ele termina o que ja pegou), mas pedido novo nao
   * chega — e ele precisa ler isso na Home, e nao deduzir pelo silencio.
   */
  workSchedule: DriverWorkScheduleStatus | null;
}

/**
 * Um turno da escala, em `HH:mm` no relogio de Brasilia.
 *
 * `end` antes de `start` quer dizer que o turno passa da meia-noite: sexta das
 * 18:00 as 02:00 termina as duas da manha de sabado, e pertence a sexta — o dia
 * em que comeca. E a mesma convencao do horario da loja online.
 */
export interface DriverWorkShift {
  start: string;
  end: string;
}

/** Um dia da semana na escala. Dia sem turno e folga. */
export interface DriverWorkDay {
  /** 0 = domingo, igual a `Date.getDay()`. */
  weekday: number;
  shifts: DriverWorkShift[];
}

/**
 * A semana fixa do motoboy, montada pela central no ADM. Repete-se toda semana.
 *
 * Quem tem escala so fica Ativo e so recebe pedido dentro dos turnos. Quem nao
 * tem (`null` nos campos que a carregam) trabalha livre, como antes da escala
 * existir.
 */
export interface DriverWorkSchedule {
  days: DriverWorkDay[];
}

/** Onde o motoboy esta na escala, num instante. */
export interface DriverWorkScheduleStatus {
  /** Dentro de um turno: pode ficar Ativo e recebe pedidos. */
  onShift: boolean;
  /**
   * Quando isso muda: o fim do turno, se esta nele; o comeco do proximo, se
   * nao esta. `null` quando nao ha previsao.
   */
  changesAt: string | null;
  /** Frase pronta: "No turno até 15:00", "Fora da escala · próximo turno sexta às 11:00". */
  label: string;
}

/** O que o motoboy ve na tela Escala do aplicativo. */
export interface DriverScheduleView {
  schedule: DriverWorkSchedule | null;
  status: DriverWorkScheduleStatus | null;
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
  compensation: DriverCompensation;
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
  /**
   * Onde o motoboy esta na escala agora, ou `null` se ele nao tem escala.
   *
   * Vai na lista para a oferta manual avisar a central: ela pode mandar o
   * pedido a quem esta fora do turno, mas precisa saber que esta fazendo isso.
   */
  workScheduleStatus: DriverWorkScheduleStatus | null;
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
  /** A semana fixa do motoboy, ou `null` se ele trabalha livre. */
  workSchedule: DriverWorkSchedule | null;
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
