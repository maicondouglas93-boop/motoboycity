'use client';

import { useState, type SubmitEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { loginSchema } from '@motoboycity/validation';
import { ApiError } from '@motoboycity/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Wordmark } from '@/components/brand/wordmark';
import { RouteDiagram } from '@/components/brand/route-diagram';
import { authApi } from '@/lib/api-client';
import { session } from '@/lib/session';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: authApi.login,
    onSuccess: (result) => {
      session.setToken(result.accessToken);
      if (result.company && result.company.status !== 'ACTIVE') {
        router.push('/pending-approval');
        return;
      }
      router.push('/');
    },
    onError: (error) => {
      if (error instanceof ApiError) {
        setFormError(error.message);
        return;
      }
      setFormError('Não foi possível entrar. Tente novamente.');
    },
  });

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const result = loginSchema.safeParse({ email, password });
    if (!result.success) {
      const errors: Record<string, string> = {};
      for (const issue of result.error.issues) {
        errors[String(issue.path[0])] = issue.message;
      }
      setFieldErrors(errors);
      return;
    }

    setFieldErrors({});
    mutation.mutate(result.data);
  }

  return (
    // No celular: a marca ocupa só o que precisa e o formulário fica com o
    // resto da tela. No desktop volta a ser duas colunas de altura cheia.
    <div className="auth-shell grid min-h-screen grid-rows-[auto_1fr] lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:grid-rows-none">
      {/* Painel da marca. No celular vira uma barra compacta: a área acima da
          dobra pertence ao formulário, não à marca. */}
      <aside className="auth-brand-panel flex flex-row items-center justify-between gap-4 px-6 py-4 text-white lg:flex-col lg:items-stretch lg:justify-between lg:px-12 lg:py-14">
        <Wordmark />

        <div className="my-10 hidden lg:block">
          <h1 className="font-heading max-w-[14ch] text-5xl leading-[1.02] font-extrabold tracking-[-0.045em] text-balance">
            Chame um motoboy sem sair do balcão.
          </h1>
          <p className="mt-5 max-w-[38ch] text-sm leading-relaxed text-white/66">
            O pedido sai daqui, cai no celular de quem está mais perto e você acompanha até a porta
            do cliente.
          </p>
          <RouteDiagram className="mt-10" />
        </div>

        <p className="font-mono text-[10px] tracking-wide whitespace-nowrap text-white/40 uppercase lg:text-[11px]">
          Lajinha · MG
        </p>
      </aside>

      <main className="flex items-center justify-center px-5 py-8 sm:px-8 lg:px-12 lg:py-12">
        <div className="auth-form-panel w-full max-w-md p-6 sm:p-8">
          <h2 className="font-heading text-3xl font-bold tracking-[-0.035em] text-portal-deep">
            Entrar
          </h2>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Use o e-mail cadastrado pela sua empresa.
          </p>

          <form className="mt-8 space-y-5" onSubmit={handleSubmit} noValidate>
            <div className="space-y-1.5">
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="voce@empresa.com.br"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                aria-invalid={Boolean(fieldErrors['email'])}
              />
              {fieldErrors['email'] && (
                <p className="text-xs text-destructive">{fieldErrors['email']}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password">Senha</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                aria-invalid={Boolean(fieldErrors['password'])}
              />
              {fieldErrors['password'] && (
                <p className="text-xs text-destructive">{fieldErrors['password']}</p>
              )}
            </div>

            {formError && (
              <p className="border-l-2 border-destructive bg-destructive/5 py-2 pl-3 text-sm text-destructive">
                {formError}
              </p>
            )}

            <Button
              className="h-11 w-full rounded-xl text-[15px]"
              type="submit"
              disabled={mutation.isPending}
            >
              {mutation.isPending ? 'Entrando...' : 'Entrar'}
            </Button>
          </form>

          <p className="mt-8 border-t border-portal/10 pt-6 text-sm text-muted-foreground">
            Sua empresa ainda não tem conta?{' '}
            <Link
              className="font-semibold text-portal underline decoration-portal/35 decoration-2 underline-offset-4 transition-colors hover:text-portal-deep"
              href="/register"
            >
              Cadastrar empresa
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
