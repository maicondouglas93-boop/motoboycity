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
  canManage: boolean;
  store: AiqfomeStoreSummary | null;
  dispatchTrigger: 'READY_ORDER';
  acceptedPayment: 'PREPAID_ONLY';
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
