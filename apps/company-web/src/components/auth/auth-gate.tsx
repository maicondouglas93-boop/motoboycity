'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { authApi } from '@/lib/api-client';
import { session } from '@/lib/session';

type GateStatus = 'checking' | 'authenticated';

/**
 * Protege as rotas de (app): sem token válido, redireciona para /login antes
 * de renderizar qualquer conteúdo. O token é validado contra GET /auth/me —
 * um token ausente, expirado ou revogado nunca chega a mostrar a tela.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [status, setStatus] = useState<GateStatus>('checking');

  useEffect(() => {
    const token = session.getToken();
    if (!token) {
      router.replace('/login');
      return;
    }

    authApi
      .me(token)
      .then(() => setStatus('authenticated'))
      .catch(() => {
        session.clearToken();
        router.replace('/login');
      });
  }, [router]);

  if (status === 'checking') {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted-foreground">Carregando...</p>
      </div>
    );
  }

  return <>{children}</>;
}
