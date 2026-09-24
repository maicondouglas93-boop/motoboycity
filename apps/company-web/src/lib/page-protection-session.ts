import type { ProtectablePageRoute } from '@motoboycity/types';

interface StoredUnlock {
  token: string;
  expiresAt: number; // timestamp em ms
}

const STORAGE_KEY_PREFIX = 'motoboycity.page_unlock.';

export const pageProtectionSession = {
  getUnlockToken(routeKey: ProtectablePageRoute): string | null {
    if (typeof window === 'undefined') return null;
    try {
      const raw = window.sessionStorage.getItem(`${STORAGE_KEY_PREFIX}${routeKey}`);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as StoredUnlock;
      if (Date.now() > parsed.expiresAt) {
        window.sessionStorage.removeItem(`${STORAGE_KEY_PREFIX}${routeKey}`);
        return null;
      }
      return parsed.token;
    } catch {
      return null;
    }
  },

  isUnlocked(routeKey: ProtectablePageRoute): boolean {
    return Boolean(this.getUnlockToken(routeKey));
  },

  setUnlockToken(
    routeKey: ProtectablePageRoute,
    token: string,
    expiresInSeconds: number,
  ): void {
    if (typeof window === 'undefined') return;
    try {
      const payload: StoredUnlock = {
        token,
        expiresAt: Date.now() + expiresInSeconds * 1000,
      };
      window.sessionStorage.setItem(
        `${STORAGE_KEY_PREFIX}${routeKey}`,
        JSON.stringify(payload),
      );
    } catch {
      // sessionStorage pode falhar em modo restrito
    }
  },

  clearUnlockToken(routeKey: ProtectablePageRoute): void {
    if (typeof window === 'undefined') return;
    try {
      window.sessionStorage.removeItem(`${STORAGE_KEY_PREFIX}${routeKey}`);
    } catch {
      // ignore
    }
  },

  clearAllUnlockTokens(): void {
    if (typeof window === 'undefined') return;
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < window.sessionStorage.length; i++) {
        const key = window.sessionStorage.key(i);
        if (key && key.startsWith(STORAGE_KEY_PREFIX)) {
          keysToRemove.push(key);
        }
      }
      for (const key of keysToRemove) {
        window.sessionStorage.removeItem(key);
      }
    } catch {
      // ignore
    }
  },

  getUnlockTokenForUrl(url: string): string | null {
    if (url.includes('/company/financial')) {
      return this.getUnlockToken('FINANCEIRO');
    }
    if (url.includes('/company/reports')) {
      return this.getUnlockToken('RELATORIOS');
    }
    if (url.includes('/deliveries') && !url.includes('/public/')) {
      return this.getUnlockToken('PEDIDOS');
    }
    if (url.includes('/company/customers')) {
      return this.getUnlockToken('CLIENTES');
    }
    return null;
  },
};
