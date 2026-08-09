'use client';

import { useState, type SubmitEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { registerCompanySchema } from '@motoboycity/validation';
import { ApiError } from '@motoboycity/api-client';
import { Button, buttonVariants } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { authApi } from '@/lib/api-client';

const FIELDS: { id: keyof typeof initialFormState; label: string; type?: string }[] = [
  { id: 'name', label: 'Nome' },
  { id: 'email', label: 'E-mail', type: 'email' },
  { id: 'phone', label: 'Telefone', type: 'tel' },
  { id: 'document', label: 'CPF/CNPJ' },
  { id: 'legalName', label: 'Razão Social' },
  { id: 'tradeName', label: 'Nome Fantasia' },
  { id: 'password', label: 'Senha', type: 'password' },
  { id: 'confirmPassword', label: 'Confirmar Senha', type: 'password' },
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
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <div className="w-full max-w-sm space-y-6 rounded-lg border bg-background p-8 shadow-sm">
        <div className="space-y-1 text-center">
          <p className="text-lg font-semibold">MOTOboyCity</p>
          <p className="text-sm text-muted-foreground">
            Faça o acompanhamento do seu pedido de forma rápida e fácil
          </p>
        </div>

        <div className="flex gap-2">
          <Link
            href="/login"
            className={buttonVariants({ variant: 'outline', className: 'flex-1' })}
          >
            Já sou cliente
          </Link>
          <Button className="flex-1" variant="default">
            Criar minha conta
          </Button>
        </div>

        <form className="space-y-4" onSubmit={handleSubmit} noValidate>
          {FIELDS.map((field) => (
            <div key={field.id} className="space-y-1.5">
              <Label htmlFor={field.id}>{field.label} *</Label>
              <Input
                id={field.id}
                type={field.type ?? 'text'}
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

          <label className="flex items-start gap-2 text-xs text-muted-foreground">
            <Checkbox className="mt-0.5" required />
            Ao criar sua conta, você concorda com nossos Termos de Uso e Política de Privacidade.
          </label>

          {formError && <p className="text-sm text-destructive">{formError}</p>}

          <Button className="w-full" type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? 'Enviando...' : 'Criar Conta'}
          </Button>
        </form>

        <p className="text-center text-sm text-muted-foreground">
          Já tem uma conta?{' '}
          <Link
            className="font-medium text-foreground underline-offset-2 hover:underline"
            href="/login"
          >
            Entrar
          </Link>
        </p>
      </div>
    </div>
  );
}
