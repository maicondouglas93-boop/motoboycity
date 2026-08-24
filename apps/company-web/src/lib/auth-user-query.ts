import { queryOptions } from '@tanstack/react-query';
import { authApi } from '@/lib/api-client';

export const authUserQueryKey = ['auth', 'me'] as const;

/**
 * Uma única consulta representa a identidade autenticada em todo o painel.
 * O AuthGate preenche este cache antes de renderizar as rotas autenticadas.
 * Login, logout e falha de autenticação limpam o cache do painel para que
 * outra conta nunca reaproveite dados da empresa anterior.
 */
export function authUserQueryOptions(token: string | null) {
  return queryOptions({
    queryKey: authUserQueryKey,
    queryFn: () => {
      if (!token) throw new Error('Sessão ausente.');
      return authApi.me(token);
    },
    enabled: Boolean(token),
    retry: false,
    staleTime: 60_000,
  });
}
