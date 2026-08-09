const ACCESS_TOKEN_KEY = 'motoboycity.admin.accessToken';

/**
 * Armazenamento mínimo de sessão (localStorage). Sem refresh token, sem
 * contexto de usuário global ainda, sem proteção de rotas — mesma decisão
 * de escopo tomada para o Login do company-web. Isso é o suficiente para o
 * admin autenticar e anexar o token em chamadas futuras (ex.: aprovação de
 * empresa).
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
