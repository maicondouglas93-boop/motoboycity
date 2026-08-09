const ACCESS_TOKEN_KEY = 'motoboycity.accessToken';

/**
 * Armazenamento mínimo de sessão (localStorage). Sem refresh token, sem
 * contexto de usuário global ainda — isso é o suficiente para o Login
 * funcionar e para futuras chamadas autenticadas anexarem o token.
 * Proteção de rotas (redirecionar quando não autenticado) fica para uma
 * fase futura.
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
