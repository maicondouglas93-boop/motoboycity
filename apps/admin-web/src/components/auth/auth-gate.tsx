'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { authApi } from '@/lib/api-client';
import { session } from '@/lib/session';

type GateStatus = 'checking' | 'authenticated';

/**
 * Protege as rotas de (app): sem token válido ou sem type === 'ADMIN',
 * redireciona para /login antes de renderizar qualquer conteúdo. O token é
 * validado contra GET /auth/me — um token ausente, expirado, revogado ou de
 * um usuário não-admin nunca chega a mostrar o painel.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<GateStatus>('checking');

  useEffect(() => {
    const token = session.getToken();
    if (!token) {
      queryClient.clear();
      router.replace('/login');
      return;
    }

    authApi
      .me(token)
      .then((user) => {
        if (user.type !== 'ADMIN') {
          session.clearToken();
          queryClient.clear();
          router.replace('/login');
          return;
        }
        setStatus('authenticated');
      })
      .catch(() => {
        session.clearToken();
        queryClient.clear();
        router.replace('/login');
      });
  }, [queryClient, router]);

  if (status === 'checking') {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted-foreground">Carregando...</p>
      </div>
    );
  }

  return <>{children}</>;
}
