'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@motoboycity/api-client';
import { Button } from '@/components/ui/button';
import { authApi } from '@/lib/api-client';
import { authUserQueryKey } from '@/lib/auth-user-query';
import { session } from '@/lib/session';

type GateStatus = 'checking' | 'authenticated' | 'error';

/**
 * Protege as rotas de (app): sem token válido, redireciona para /login antes
 * de renderizar qualquer conteúdo. O token é validado contra GET /auth/me —
 * um token ausente, expirado ou revogado nunca chega a mostrar a tela.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<GateStatus>('checking');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const token = session.getToken();
    if (!token) {
      queryClient.clear();
      router.replace('/login');
      return;
    }

    let active = true;
    authApi
      .me(token)
      .then((user) => {
        if (!active) return;
        queryClient.setQueryData(authUserQueryKey, user);
        setStatus('authenticated');
      })
      .catch((error: unknown) => {
        if (!active) return;
        if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
          session.clearToken();
          queryClient.clear();
          router.replace('/login');
          return;
        }
        setStatus('error');
      });

    return () => {
      active = false;
    };
  }, [attempt, queryClient, router]);

  if (status === 'error') {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="max-w-md space-y-4 text-center">
          <p className="text-sm text-destructive">
            Não foi possível validar sua sessão agora. Sua conta continua conectada.
          </p>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setStatus('checking');
              setAttempt((current) => current + 1);
            }}
          >
            Tentar novamente
          </Button>
        </div>
      </div>
    );
  }

  if (status === 'checking') {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted-foreground">Carregando...</p>
      </div>
    );
  }

  return <>{children}</>;
}
