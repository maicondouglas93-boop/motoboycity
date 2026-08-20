const ACCESS_TOKEN_KEY = 'motoboycity.accessToken';

/**
 * Armazenamento mínimo de sessão (localStorage). Sem refresh token, sem
 * contexto de usuário global ainda. O `AuthGate` valida o token contra a API
 * antes de renderizar as rotas autenticadas.
 */
export const session = {
  getToken(): string | null {
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem(ACCESS_TOKEN_KEY);
  },
  setToken(token: string): void {
    window.localStorage.setItem(ACCESS_TOKEN_KEY, token);
  },
  clearToken(): void {
    window.localStorage.removeItem(ACCESS_TOKEN_KEY);
  },
};
