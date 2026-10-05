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
  /** Exigida quando a proteção está ativa e o pedido a desativa ou troca a senha. */
  currentPassword?: string;
}

/** Redefinição da senha esquecida: pela senha de login ou pela pergunta secreta. */
export type ResetPageProtectionPayload =
  | { method: 'ACCOUNT_PASSWORD'; accountPassword: string; newPassword: string }
  | { method: 'SECRET_ANSWER'; secretAnswer: string; newPassword: string };

export interface PageProtectionRecoveryStatus {
  configured: boolean;
  /** A pergunta é mostrada na redefinição; a resposta nunca sai da API. */
  question: string | null;
  updatedAt: string | null;
}

export interface SetPageProtectionRecoveryPayload {
  accountPassword: string;
  question: string;
  answer: string;
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
