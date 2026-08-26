import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiError } from '@motoboycity/api-client';
import type { AuthUser } from '@motoboycity/types';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthGate } from '@/components/auth/auth-gate';
import { authUserQueryKey } from '@/lib/auth-user-query';

const mocks = vi.hoisted(() => {
  const replace = vi.fn<(href: string) => void>();
  return {
    clearToken: vi.fn<() => void>(),
    getToken: vi.fn<() => string | null>(),
    me: vi.fn<(token: string) => Promise<AuthUser>>(),
    replace,
    router: { replace },
  };
});

vi.mock('next/navigation', () => ({
  useRouter: () => mocks.router,
}));

vi.mock('@/lib/api-client', () => ({
  authApi: { me: mocks.me },
}));

vi.mock('@/lib/session', () => ({
  session: {
    clearToken: mocks.clearToken,
    getToken: mocks.getToken,
  },
}));

const authenticatedUser: AuthUser = {
  id: 'user-1',
  name: 'Empresa Teste',
  email: 'empresa@teste.com',
  type: 'COMPANY_MEMBER',
  avatarUrl: null,
};

function renderAuthGate() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const clearCache = vi.spyOn(queryClient, 'clear');

  render(
    <QueryClientProvider client={queryClient}>
      <AuthGate>
        <p>Area protegida</p>
      </AuthGate>
    </QueryClientProvider>,
  );

  return { clearCache, queryClient };
}

describe('AuthGate', () => {
  beforeEach(() => {
    mocks.clearToken.mockReset();
    mocks.getToken.mockReset();
    mocks.me.mockReset();
    mocks.replace.mockReset();
  });

  it('redireciona para o login quando nao existe token', async () => {
    mocks.getToken.mockReturnValue(null);
    const { clearCache } = renderAuthGate();

    await waitFor(() => {
      expect(mocks.replace).toHaveBeenCalledWith('/login');
    });

    expect(clearCache).toHaveBeenCalledOnce();
    expect(mocks.me).not.toHaveBeenCalled();
    expect(screen.queryByText('Area protegida')).not.toBeInTheDocument();
  });

  it('valida o token, preenche o cache e libera a rota', async () => {
    mocks.getToken.mockReturnValue('token-valido');
    mocks.me.mockResolvedValue(authenticatedUser);
    const { queryClient } = renderAuthGate();

    expect(screen.getByText('Carregando...')).toBeInTheDocument();
    expect(await screen.findByText('Area protegida')).toBeInTheDocument();

    expect(mocks.me).toHaveBeenCalledWith('token-valido');
    expect(queryClient.getQueryData(authUserQueryKey)).toEqual(authenticatedUser);
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it.each([401, 403])('limpa a sessao e redireciona em uma resposta HTTP %s', async (status) => {
    mocks.getToken.mockReturnValue('token-expirado');
    mocks.me.mockRejectedValue(new ApiError(status, { message: 'Sessao invalida' }));
    const { clearCache } = renderAuthGate();

    await waitFor(() => {
      expect(mocks.replace).toHaveBeenCalledWith('/login');
    });

    expect(mocks.clearToken).toHaveBeenCalledOnce();
    expect(clearCache).toHaveBeenCalledOnce();
    expect(screen.queryByText('Area protegida')).not.toBeInTheDocument();
  });

  it('mantem a sessao e permite tentar novamente em uma falha temporaria', async () => {
    const user = userEvent.setup();
    mocks.getToken.mockReturnValue('token-valido');
    mocks.me.mockRejectedValueOnce(new Error('Falha de rede')).mockResolvedValue(authenticatedUser);
    renderAuthGate();

    await user.click(await screen.findByRole('button', { name: 'Tentar novamente' }));

    expect(await screen.findByText('Area protegida')).toBeInTheDocument();
    expect(mocks.me).toHaveBeenCalledTimes(2);
    expect(mocks.clearToken).not.toHaveBeenCalled();
    expect(mocks.replace).not.toHaveBeenCalled();
  });
});
