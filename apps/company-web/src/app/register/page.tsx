'use client';

import { useState, type SubmitEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { registerCompanySchema } from '@motoboycity/validation';
import { ApiError } from '@motoboycity/api-client';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Wordmark } from '@/components/brand/wordmark';
import { RouteDiagram } from '@/components/brand/route-diagram';
import { authApi } from '@/lib/api-client';

/**
 * `wide` marca os campos que ocupam a linha inteira. Com oito campos, a grade
 * de duas colunas encurta o formulário o suficiente para o botão de enviar
 * caber na tela, em vez de virar uma coluna longa de rolagem.
 */
const FIELDS: {
  id: keyof typeof initialFormState;
  label: string;
  type?: string;
  autoComplete?: string;
  wide?: boolean;
}[] = [
  { id: 'name', label: 'Seu nome', autoComplete: 'name', wide: true },
  { id: 'email', label: 'E-mail', type: 'email', autoComplete: 'email' },
  { id: 'phone', label: 'Telefone', type: 'tel', autoComplete: 'tel' },
  { id: 'document', label: 'CPF ou CNPJ' },
  { id: 'legalName', label: 'Razão social' },
  { id: 'tradeName', label: 'Nome fantasia', wide: true },
  { id: 'password', label: 'Senha', type: 'password', autoComplete: 'new-password' },
  {
    id: 'confirmPassword',
    label: 'Confirmar senha',
    type: 'password',
    autoComplete: 'new-password',
  },
];

const initialFormState = {
  name: '',
  email: '',
  phone: '',
  document: '',
  legalName: '',
  tradeName: '',
  password: '',
  confirmPassword: '',
};

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState(initialFormState);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: authApi.registerCompany,
    onSuccess: () => {
      router.push('/pending-approval');
    },
    onError: (error) => {
      if (error instanceof ApiError) {
        setFormError(error.message);
        return;
      }
      setFormError('Não foi possível concluir o cadastro. Tente novamente.');
    },
  });

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const result = registerCompanySchema.safeParse(form);
    if (!result.success) {
      const errors: Record<string, string> = {};
      for (const issue of result.error.issues) {
        errors[String(issue.path[0])] = issue.message;
      }
      setFieldErrors(errors);
      return;
    }

    setFieldErrors({});
    mutation.mutate({
      name: result.data.name,
      email: result.data.email,
      phone: result.data.phone,
      document: result.data.document,
      legalName: result.data.legalName,
      tradeName: result.data.tradeName,
      password: result.data.password,
    });
  }

  return (
    // Mesmo esqueleto do login: quem vem de lá não pode sentir que trocou de
    // produto no meio do caminho.
    <div className="auth-shell grid min-h-screen grid-rows-[auto_1fr] lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:grid-rows-none">
      <aside className="auth-brand-panel flex flex-row items-center justify-between gap-4 px-6 py-4 text-white lg:flex-col lg:items-stretch lg:justify-between lg:px-12 lg:py-14">
        <Wordmark />

        <div className="my-10 hidden lg:block">
          <h1 className="font-heading max-w-[15ch] text-5xl leading-[1.02] font-extrabold tracking-[-0.045em] text-balance">
            Sua loja com motoboy na porta.
          </h1>
          <p className="mt-5 max-w-[38ch] text-sm leading-relaxed text-white/66">
            Cadastre a empresa uma vez. Depois é só chamar o entregador e acompanhar cada pedido.
          </p>
          <RouteDiagram className="mt-10" />
        </div>

        <p className="font-mono text-[10px] tracking-wide whitespace-nowrap text-white/40 uppercase lg:text-[11px]">
          Lajinha · MG
        </p>
      </aside>

      <main className="flex items-center justify-center px-5 py-8 sm:px-8 lg:px-12 lg:py-10">
        <div className="auth-form-panel w-full max-w-xl p-6 sm:p-8">
          <h2 className="font-heading text-3xl font-bold tracking-[-0.035em] text-portal-deep">
            Cadastrar empresa
          </h2>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Depois de enviar, o cadastro passa por aprovação antes de liberar os pedidos.
          </p>

          <form className="mt-8 space-y-5" onSubmit={handleSubmit} noValidate>
            <div className="grid gap-x-4 gap-y-5 sm:grid-cols-2">
              {FIELDS.map((field) => (
                <div key={field.id} className={`space-y-1.5 ${field.wide ? 'sm:col-span-2' : ''}`}>
                  <Label htmlFor={field.id}>{field.label}</Label>
                  <Input
                    id={field.id}
                    type={field.type ?? 'text'}
                    {...(field.autoComplete && { autoComplete: field.autoComplete })}
                    value={form[field.id]}
                    onChange={(event) =>
                      setForm((previous) => ({ ...previous, [field.id]: event.target.value }))
                    }
                    aria-invalid={Boolean(fieldErrors[field.id])}
                  />
                  {fieldErrors[field.id] && (
                    <p className="text-xs text-destructive">{fieldErrors[field.id]}</p>
                  )}
                </div>
              ))}
            </div>

            <label className="flex items-start gap-2.5 text-xs leading-relaxed text-muted-foreground">
              <Checkbox className="mt-0.5" required />
              Ao criar sua conta, você concorda com nossos Termos de Uso e Política de Privacidade.
            </label>

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
              {mutation.isPending ? 'Enviando...' : 'Enviar cadastro'}
            </Button>
          </form>

          <p className="mt-8 border-t border-portal/10 pt-6 text-sm text-muted-foreground">
            Sua empresa já tem conta?{' '}
            <Link
              className="font-semibold text-portal underline decoration-portal/35 decoration-2 underline-offset-4 transition-colors hover:text-portal-deep"
              href="/login"
            >
              Entrar
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
