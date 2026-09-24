'use client';

import { useState, type FormEvent, type ReactNode } from 'react';
import { Eye, EyeOff, KeyRound, Lock, ShieldAlert, Unlock } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@motoboycity/api-client';
import type { ProtectablePageRoute } from '@motoboycity/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { companyPageProtectionApi } from '@/lib/api-client';
import { pageProtectionSession } from '@/lib/page-protection-session';
import { session } from '@/lib/session';

export const pageProtectionListQueryKey = ['company', 'page-protection', 'list'] as const;

interface PageProtectionBoundaryProps {
  routeKey: ProtectablePageRoute;
  children: ReactNode;
}

export function PageProtectionBoundary({
  routeKey,
  children,
}: PageProtectionBoundaryProps) {
  const token = session.getToken();
  const queryClient = useQueryClient();
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [unlockedState, setUnlockedState] = useState(() =>
    pageProtectionSession.isUnlocked(routeKey),
  );

  const { data: protections, isLoading } = useQuery({
    queryKey: pageProtectionListQueryKey,
    queryFn: () => {
      if (!token) throw new Error('Sessão ausente.');
      return companyPageProtectionApi.list(token);
    },
    enabled: Boolean(token),
    staleTime: 5 * 60 * 1000,
  });

  const protection = protections?.find((p) => p.routeKey === routeKey);
  const isProtected = Boolean(protection?.enabled);

  // Se nao ha protecao configurada/ativa, libera o conteudo diretamente
  if (!isProtected && !isLoading) {
    return <>{children}</>;
  }

  // Se estiver desbloqueado nesta sessao
  if (unlockedState) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between rounded-lg border border-amber-500/20 bg-amber-500/10 px-4 py-2 text-xs text-amber-700 dark:text-amber-300">
          <div className="flex items-center gap-2">
            <Unlock className="size-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <span>Página desbloqueada por senha para esta sessão de navegação.</span>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 text-xs hover:bg-amber-500/20 hover:text-amber-900 dark:hover:text-white"
            onClick={() => {
              pageProtectionSession.clearUnlockToken(routeKey);
              setUnlockedState(false);
              setPassword('');
              setErrorMessage(null);
            }}
          >
            Bloquear agora
          </Button>
        </div>
        {children}
      </div>
    );
  }

  // Enquanto carrega o status da protecao
  if (isLoading) {
    return (
      <div className="flex min-h-[350px] items-center justify-center">
        <div className="space-y-3 text-center">
          <div className="inline-block size-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent align-[-0.125em] text-colete motion-reduce:animate-[spin_1.5s_linear_infinite]" />
          <p className="text-sm text-muted-foreground">Verificando segurança da página...</p>
        </div>
      </div>
    );
  }

  const handleUnlock = async (e: FormEvent) => {
    e.preventDefault();
    if (!token) return;
    if (!password.trim()) {
      setErrorMessage('Digite a senha para desbloquear.');
      return;
    }

    setIsVerifying(true);
    setErrorMessage(null);

    try {
      const result = await companyPageProtectionApi.verifyPassword(token, {
        routeKey,
        password,
      });

      if (result.success && result.unlockToken) {
        pageProtectionSession.setUnlockToken(
          routeKey,
          result.unlockToken,
          result.expiresInSeconds,
        );
        setUnlockedState(true);
        setPassword('');
        // Invalida as queries da pagina para que os dados protegidos sejam buscados com o novo token
        queryClient.invalidateQueries();
      }
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.status === 429) {
          setErrorMessage('Muitas tentativas consecutivas. Aguarde 1 minuto e tente novamente.');
        } else if (error.status === 401) {
          setErrorMessage('Senha incorreta. Tente novamente.');
        } else {
          setErrorMessage(error.message);
        }
      } else {
        setErrorMessage('Não foi possível verificar a senha. Verifique sua conexão.');
      }
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div className="flex min-h-[420px] items-center justify-center px-4 py-8">
      <Card className="w-full max-w-md border-border/80 shadow-lg">
        <CardHeader className="text-center">
          <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-600 ring-1 ring-amber-500/20">
            <Lock className="size-6" />
          </div>
          <CardTitle className="text-xl">Página protegida por senha</CardTitle>
          <CardDescription className="text-sm">
            A seção <strong>{protection?.label ?? 'solicitada'}</strong> foi protegida pela
            administração da sua empresa. Digite a senha para continuar.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleUnlock} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor={`page-password-${routeKey}`}>Senha de acesso</Label>
              <div className="relative">
                <Input
                  id={`page-password-${routeKey}`}
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  autoFocus
                  disabled={isVerifying}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (errorMessage) setErrorMessage(null);
                  }}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  tabIndex={-1}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  <span className="sr-only">
                    {showPassword ? 'Ocultar senha' : 'Exibir senha'}
                  </span>
                </button>
              </div>
            </div>

            {errorMessage && (
              <div className="flex items-center gap-2 rounded-md bg-destructive/10 p-3 text-xs font-medium text-destructive">
                <ShieldAlert className="size-4 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            <Button
              type="submit"
              className="w-full font-semibold"
              disabled={isVerifying || !password.trim()}
            >
              {isVerifying ? (
                <>
                  <div className="mr-2 size-4 animate-spin rounded-full border-2 border-solid border-current border-r-transparent" />
                  Verificando...
                </>
              ) : (
                <>
                  <KeyRound className="mr-2 size-4" />
                  Desbloquear página
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
