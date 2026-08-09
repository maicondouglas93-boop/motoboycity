'use client';

import { useState, type SubmitEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { loginSchema } from '@motoboycity/validation';
import { ApiError } from '@motoboycity/api-client';
import { Button, buttonVariants } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <div className="w-full max-w-sm space-y-6 rounded-lg border bg-background p-8 shadow-sm">
        <div className="space-y-1 text-center">
          <p className="text-lg font-semibold">MOTOboyCity</p>
          <p className="text-sm text-muted-foreground">
            Faça o acompanhamento do seu pedido de forma rápida e fácil
          </p>
        </div>

        <div className="flex gap-2">
          <Button className="flex-1" variant="default">
            Já sou cliente
          </Button>
          <Link
            href="/register"
            className={buttonVariants({ variant: 'outline', className: 'flex-1' })}
          >
            Criar minha conta
          </Link>
        </div>

        <form className="space-y-4" onSubmit={handleSubmit} noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="email">E-mail</Label>
            <Input
              id="email"
              type="email"
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
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              aria-invalid={Boolean(fieldErrors['password'])}
            />
            {fieldErrors['password'] && (
              <p className="text-xs text-destructive">{fieldErrors['password']}</p>
            )}
          </div>
          <div className="flex items-center justify-between text-sm">
            <label className="flex items-center gap-2 text-muted-foreground">
              <Checkbox /> Lembrar-me
            </label>
            <a className="text-muted-foreground underline-offset-2 hover:underline" href="#">
              Esqueceu a senha
            </a>
          </div>

          {formError && <p className="text-sm text-destructive">{formError}</p>}

          <Button className="w-full" type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? 'Entrando...' : 'Entrar'}
          </Button>
        </form>

        <p className="text-center text-sm text-muted-foreground">
          Ainda não tem uma conta?{' '}
          <Link
            className="font-medium text-foreground underline-offset-2 hover:underline"
            href="/register"
          >
            Criar Conta
          </Link>
        </p>
      </div>
    </div>
  );
}
