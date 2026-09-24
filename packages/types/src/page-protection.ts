export type ProtectablePageRoute = 'FINANCEIRO' | 'RELATORIOS' | 'PEDIDOS' | 'CLIENTES';

export interface PageProtectionCatalogItem {
  routeKey: ProtectablePageRoute;
  label: string;
  path: string;
  description: string;
}

export interface PageProtectionStatusItem {
  routeKey: ProtectablePageRoute;
  label: string;
  path: string;
  description: string;
  enabled: boolean;
  hasProtection: boolean;
  updatedAt: string | null;
}

export interface SetPageProtectionPayload {
  routeKey: ProtectablePageRoute;
  password: string;
}

export interface UpdatePageProtectionPayload {
  password?: string;
  enabled?: boolean;
}

export interface VerifyPagePasswordPayload {
  routeKey: ProtectablePageRoute;
  password: string;
}

export interface VerifyPagePasswordResult {
  success: boolean;
  unlockToken: string;
  expiresInSeconds: number;
}

export interface PageUnlockTokenPayload {
  sub: string;
  companyId: string;
  routeKey: ProtectablePageRoute;
  version: number;
  type: 'PAGE_UNLOCK';
  exp?: number;
}
