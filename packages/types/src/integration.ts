export type AiqfomeConnectionStatus = 'DISCONNECTED' | 'CONNECTED' | 'ERROR';

export interface AiqfomeStoreSummary {
  id: string;
  name: string;
  status: string;
  document: string;
  address: {
    street: string;
    number: string;
    city: string;
    state: string;
  } | null;
}

export interface CompanyAiqfomeIntegration {
  provider: 'AIQFOME';
  status: AiqfomeConnectionStatus;
  configured: boolean;
  operationalReady: boolean;
  canManage: boolean;
  store: AiqfomeStoreSummary | null;
  dispatchTrigger: 'NEW_ORDER_DELAYED';
  acceptedPayment: 'PREPAID_AND_ON_DELIVERY';
  serviceTypeId: string | null;
  dispatchDelayMinutes: number | null;
  effectiveDispatchDelayMinutes: number | null;
  delaySource: 'COMPANY' | 'ADMIN' | null;
  webhookStatus: 'INACTIVE' | 'ACTIVE' | 'ERROR';
  connectedAt: string | null;
  lastSyncAt: string | null;
  errorCode: string | null;
}

export interface AiqfomeConnectResult {
  authorizationUrl: string;
}

export interface AiqfomeDisconnectResult {
  disconnected: true;
}

export interface UpdateAiqfomeSettingsInput {
  /** Null pausa a importacao ate uma modalidade ser escolhida novamente. */
  serviceTypeId?: string | null;
  /** Null usa o tempo global definido pelo ADM. */
  dispatchDelayMinutes?: number | null;
}
