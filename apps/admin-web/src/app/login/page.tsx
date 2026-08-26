'use client';

import { useState, type SubmitEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { loginSchema } from '@motoboycity/validation';
import { ApiError } from '@motoboycity/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { authApi } from '@/lib/api-client';
import { Wordmark } from '@/components/brand/wordmark';
import { session } from '@/lib/session';

export default function AdminLoginPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: authApi.login,
    onSuccess: (result) => {
      if (result.user.type !== 'ADMIN') {
        session.clearToken();
        queryClient.clear();
        setFormError('Este painel é restrito a administradores.');
        return;
      }
      queryClient.clear();
      session.setToken(result.accessToken);
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
    // Mesmo esqueleto do painel da empresa, com a etiqueta "Admin" para não
    // haver dúvida sobre em qual sistema a pessoa está entrando.
    <div className="grid min-h-screen grid-rows-[auto_1fr] bg-background lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:grid-rows-none">
      <aside className="relative flex flex-row items-center justify-between gap-4 overflow-hidden bg-[radial-gradient(circle_at_20%_10%,rgba(53,184,178,0.28),transparent_30rem),linear-gradient(145deg,#071b23,#0a3540_60%,#0f4d55)] px-6 py-4 text-white shadow-2xl lg:flex-col lg:items-stretch lg:justify-between lg:px-12 lg:py-14">
        <div className="flex items-center gap-2">
          <Wordmark />
          <span className="rounded-md border border-primary/25 bg-primary/15 px-1.5 py-0.5 font-mono text-[10px] tracking-widest text-[#aee8e4] uppercase">
            Admin
          </span>
        </div>

        <div className="my-10 hidden lg:block">
          <h1 className="font-heading max-w-[16ch] text-4xl leading-[1.05] font-extrabold tracking-tight text-balance">
            A operação inteira em uma tela.
          </h1>
          <p className="mt-4 max-w-[38ch] text-sm leading-relaxed text-white/60">
            Empresas, entregadores, pedidos em rota e o fechamento financeiro — tudo aqui.
          </p>
        </div>

        <p className="font-mono text-[10px] tracking-wide whitespace-nowrap text-white/40 uppercase lg:text-[11px]">
          Uso restrito
        </p>
      </aside>

      <main className="flex items-center justify-center bg-[radial-gradient(circle_at_85%_5%,rgba(253,160,46,0.10),transparent_22rem),radial-gradient(circle_at_15%_90%,rgba(15,107,112,0.10),transparent_26rem)] px-6 py-12 lg:px-12">
        <div className="w-full max-w-sm rounded-3xl border border-white/80 bg-card/90 p-7 shadow-[0_24px_64px_-36px_rgba(10,53,64,0.55)] ring-1 ring-asfalto/[0.05] backdrop-blur sm:p-9">
          <h2 className="font-heading text-2xl font-bold tracking-tight">Entrar</h2>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Acesso administrativo do MOTOboyCity.
          </p>

          <form className="mt-8 space-y-5" onSubmit={handleSubmit} noValidate>
            <div className="space-y-1.5">
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="voce@motoboycity.com.br"
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

            <Button className="h-11 w-full text-[15px]" type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Entrando...' : 'Entrar'}
            </Button>
          </form>
        </div>
      </main>
    </div>
  );
}
