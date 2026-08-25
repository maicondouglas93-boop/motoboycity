'use client';

import { useState, type FormEvent, type ReactElement } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@motoboycity/api-client';
import type { RegisterCompanyResult } from '@motoboycity/types';
import { createAdminCompanySchema, type CreateAdminCompanyPayload } from '@motoboycity/validation';
import { Building2, KeyRound, ShieldCheck, UserRound } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ActionFeedback } from '@/components/ui/action-feedback';
import { PendingButtonLabel } from '@/components/ui/pending-button-label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { adminCompaniesApi } from '@/lib/api-client';

const initialForm = {
  legalName: '',
  tradeName: '',
  document: '',
  regionId: '',
  name: '',
  email: '',
  phone: '',
  password: '',
  confirmPassword: '',
};

type FormField = keyof typeof initialForm;
type FieldErrors = Partial<Record<FormField | 'form', string>>;

interface CreateCompanyDialogProps {
  accessToken: string;
  children: ReactElement;
  onCreated: (result: RegisterCompanyResult) => void;
}

function FieldError({ field, errors }: { field: FormField; errors: FieldErrors }) {
  const message = errors[field];
  if (!message) return null;
  return (
    <p id={`create-company-${field}-error`} role="alert" className="text-xs text-destructive">
      {message}
    </p>
  );
}

export function CreateCompanyDialog({
  accessToken,
  children,
  onCreated,
}: CreateCompanyDialogProps) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(initialForm);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const optionsQuery = useQuery({
    queryKey: ['admin', 'company-registration-options'],
    queryFn: () => adminCompaniesApi.registrationOptions(accessToken),
    enabled: open,
  });

  const createMutation = useMutation({
    mutationFn: (payload: CreateAdminCompanyPayload) =>
      adminCompaniesApi.create(accessToken, payload),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'companies'] });
      onCreated(result);
      setForm(initialForm);
      setErrors({});
      setFormError(null);
      setOpen(false);
    },
    onError: (error) => {
      if (error instanceof ApiError && error.body?.issues?.length) {
        const nextErrors: FieldErrors = {};
        for (const issue of error.body.issues) {
          const field = String(issue.path[0] ?? 'form') as keyof FieldErrors;
          if (!nextErrors[field]) nextErrors[field] = issue.message;
        }
        setErrors(nextErrors);
      }
      setFormError(
        error instanceof ApiError
          ? error.message
          : 'Não foi possível cadastrar a empresa. Tente novamente.',
      );
    },
  });

  function updateField(field: FormField, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
    setFormError(null);
    setErrors((current) => ({ ...current, [field]: undefined }));
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen && createMutation.isPending) return;
    setOpen(nextOpen);
    if (!nextOpen) {
      setForm(initialForm);
      setErrors({});
      setFormError(null);
      createMutation.reset();
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    if (form.password !== form.confirmPassword) {
      setErrors((current) => ({ ...current, confirmPassword: 'As senhas não coincidem.' }));
      return;
    }

    const result = createAdminCompanySchema.safeParse({
      name: form.name,
      email: form.email,
      phone: form.phone,
      document: form.document,
      legalName: form.legalName,
      tradeName: form.tradeName,
      password: form.password,
      regionId: form.regionId,
    });
    if (!result.success) {
      const nextErrors: FieldErrors = {};
      for (const issue of result.error.issues) {
        const field = String(issue.path[0] ?? 'form') as keyof FieldErrors;
        if (!nextErrors[field]) nextErrors[field] = issue.message;
      }
      setErrors(nextErrors);
      return;
    }
    setErrors({});
    createMutation.mutate(result.data);
  }

  const regions = optionsQuery.data?.regions ?? [];

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={children} />
      <DialogContent closeDisabled={createMutation.isPending}>
        <DialogHeader>
          <div className="flex items-center gap-3">
            <span className="flex size-11 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/20">
              <Building2 className="size-5" />
            </span>
            <div>
              <DialogTitle>Cadastrar empresa</DialogTitle>
              <DialogDescription>
                Crie a empresa e o acesso do responsável diretamente pelo painel.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <DialogBody>
          <form id="create-company-form" className="space-y-7" noValidate onSubmit={handleSubmit}>
            <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-primary/15 bg-primary/5 px-4 py-3">
              <ShieldCheck className="size-4 text-primary" />
              <Badge variant="outline" className="border-primary/25 bg-card text-primary">
                Aprovação separada
              </Badge>
              <p className="text-xs text-muted-foreground">
                A empresa nasce pendente e só opera depois da aprovação administrativa.
              </p>
            </div>

            <section className="space-y-4">
              <div className="flex items-center gap-2">
                <Building2 className="size-4 text-primary" />
                <h3 className="font-heading text-sm font-semibold">Dados da empresa</h3>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="company-trade-name">Nome fantasia</Label>
                  <Input
                    id="company-trade-name"
                    value={form.tradeName}
                    onChange={(event) => updateField('tradeName', event.target.value)}
                    aria-invalid={Boolean(errors.tradeName)}
                    aria-describedby={
                      errors.tradeName ? 'create-company-tradeName-error' : undefined
                    }
                    placeholder="Ex.: Drogaria Central"
                  />
                  <FieldError field="tradeName" errors={errors} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="company-legal-name">Razão social</Label>
                  <Input
                    id="company-legal-name"
                    value={form.legalName}
                    onChange={(event) => updateField('legalName', event.target.value)}
                    aria-invalid={Boolean(errors.legalName)}
                    aria-describedby={
                      errors.legalName ? 'create-company-legalName-error' : undefined
                    }
                    placeholder="Empresa Exemplo LTDA"
                  />
                  <FieldError field="legalName" errors={errors} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="company-document">CPF ou CNPJ</Label>
                  <Input
                    id="company-document"
                    inputMode="numeric"
                    value={form.document}
                    onChange={(event) => updateField('document', event.target.value)}
                    aria-invalid={Boolean(errors.document)}
                    aria-describedby={errors.document ? 'create-company-document-error' : undefined}
                    placeholder="00.000.000/0001-00"
                  />
                  <FieldError field="document" errors={errors} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="company-region">Região</Label>
                  <Select
                    items={Object.fromEntries(regions.map((region) => [region.id, region.name]))}
                    value={form.regionId}
                    onValueChange={(value) => updateField('regionId', value ?? '')}
                    disabled={optionsQuery.isLoading || regions.length === 0}
                  >
                    <SelectTrigger
                      id="company-region"
                      className="h-10 w-full"
                      aria-invalid={Boolean(errors.regionId)}
                      aria-describedby={
                        errors.regionId ? 'create-company-regionId-error' : undefined
                      }
                    >
                      <SelectValue placeholder="Selecione a região" />
                    </SelectTrigger>
                    <SelectContent>
                      {regions.map((region) => (
                        <SelectItem key={region.id} value={region.id}>
                          {region.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {optionsQuery.isLoading && (
                    <p className="text-xs text-muted-foreground">Carregando regiões...</p>
                  )}
                  {optionsQuery.isError && (
                    <p className="text-xs text-destructive">
                      Não foi possível carregar as regiões.
                    </p>
                  )}
                  {optionsQuery.isSuccess && regions.length === 0 && (
                    <p className="text-xs text-destructive">Nenhuma região ativa disponível.</p>
                  )}
                  <FieldError field="regionId" errors={errors} />
                </div>
              </div>
            </section>

            <section className="space-y-4 border-t border-border/70 pt-6">
              <div className="flex items-center gap-2">
                <UserRound className="size-4 text-primary" />
                <h3 className="font-heading text-sm font-semibold">Responsável e WhatsApp</h3>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="company-owner-name">Nome completo</Label>
                  <Input
                    id="company-owner-name"
                    autoComplete="name"
                    value={form.name}
                    onChange={(event) => updateField('name', event.target.value)}
                    aria-invalid={Boolean(errors.name)}
                    aria-describedby={errors.name ? 'create-company-name-error' : undefined}
                    placeholder="Nome do responsável"
                  />
                  <FieldError field="name" errors={errors} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="company-owner-email">E-mail de acesso</Label>
                  <Input
                    id="company-owner-email"
                    type="email"
                    autoComplete="email"
                    value={form.email}
                    onChange={(event) => updateField('email', event.target.value)}
                    aria-invalid={Boolean(errors.email)}
                    aria-describedby={errors.email ? 'create-company-email-error' : undefined}
                    placeholder="responsavel@empresa.com"
                  />
                  <FieldError field="email" errors={errors} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="company-owner-phone">WhatsApp</Label>
                  <Input
                    id="company-owner-phone"
                    inputMode="tel"
                    autoComplete="tel"
                    value={form.phone}
                    onChange={(event) => updateField('phone', event.target.value)}
                    aria-invalid={Boolean(errors.phone)}
                    aria-describedby={errors.phone ? 'create-company-phone-error' : undefined}
                    placeholder="(33) 99999-9999"
                  />
                  <FieldError field="phone" errors={errors} />
                </div>
              </div>
            </section>

            <section className="space-y-4 border-t border-border/70 pt-6">
              <div className="flex items-center gap-2">
                <KeyRound className="size-4 text-primary" />
                <h3 className="font-heading text-sm font-semibold">Senha inicial</h3>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="company-password">Senha</Label>
                  <Input
                    id="company-password"
                    type="password"
                    autoComplete="new-password"
                    value={form.password}
                    onChange={(event) => updateField('password', event.target.value)}
                    aria-invalid={Boolean(errors.password)}
                    aria-describedby={errors.password ? 'create-company-password-error' : undefined}
                    placeholder="Mínimo de 8 caracteres"
                  />
                  <FieldError field="password" errors={errors} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="company-confirm-password">Confirmar senha</Label>
                  <Input
                    id="company-confirm-password"
                    type="password"
                    autoComplete="new-password"
                    value={form.confirmPassword}
                    onChange={(event) => updateField('confirmPassword', event.target.value)}
                    aria-invalid={Boolean(errors.confirmPassword)}
                    aria-describedby={
                      errors.confirmPassword ? 'create-company-confirmPassword-error' : undefined
                    }
                    placeholder="Repita a senha"
                  />
                  <FieldError field="confirmPassword" errors={errors} />
                </div>
              </div>
            </section>

            {formError && (
              <ActionFeedback tone="error" title="Não foi possível criar a empresa">
                {formError}
              </ActionFeedback>
            )}
          </form>
        </DialogBody>

        <DialogFooter className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">
            Compartilhe a senha inicial por um canal seguro.
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={createMutation.isPending}
              onClick={() => handleOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              form="create-company-form"
              disabled={createMutation.isPending || optionsQuery.isLoading || regions.length === 0}
            >
              <PendingButtonLabel pending={createMutation.isPending} pendingLabel="Cadastrando...">
                Criar empresa
              </PendingButtonLabel>
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
