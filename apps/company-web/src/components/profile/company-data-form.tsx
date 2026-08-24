'use client';

import { useState, type FormEvent } from 'react';
import { Building2, CheckCircle2, Save } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@motoboycity/api-client';
import type { AuthUser, CompanyProfile } from '@motoboycity/types';
import {
  updateCompanyProfileSchema,
  type UpdateCompanyProfilePayload,
} from '@motoboycity/validation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { companyProfileApi } from '@/lib/api-client';
import { authUserQueryKey } from '@/lib/auth-user-query';
import { session } from '@/lib/session';

export const companyProfileQueryKey = ['company', 'profile'] as const;

type ProfileField = keyof UpdateCompanyProfilePayload;
type ProfileFieldErrors = Partial<Record<ProfileField, string>>;

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return 'Não foi possível salvar o perfil. Verifique sua conexão e tente novamente.';
}

export function CompanyDataForm({ token, profile }: { token: string; profile: CompanyProfile }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<UpdateCompanyProfilePayload>({
    tradeName: profile.tradeName,
    legalName: profile.legalName,
    whatsapp: profile.whatsapp,
    fullName: profile.fullName,
  });
  const [fieldErrors, setFieldErrors] = useState<ProfileFieldErrors>({});
  const [feedback, setFeedback] = useState<string | null>(null);

  const updateMutation = useMutation({
    mutationFn: (payload: UpdateCompanyProfilePayload) =>
      companyProfileApi.update(token, payload),
    onMutate: () => {
      setFeedback(null);
      setFieldErrors({});
    },
    onSuccess: (updated) => {
      if (session.getToken() !== token) return;
      queryClient.setQueryData(companyProfileQueryKey, updated);
      queryClient.setQueryData<AuthUser>(authUserQueryKey, (current) =>
        current ? { ...current, name: updated.fullName } : current,
      );
      setForm({
        tradeName: updated.tradeName,
        legalName: updated.legalName,
        whatsapp: updated.whatsapp,
        fullName: updated.fullName,
      });
      setFeedback('Dados da empresa atualizados com sucesso.');
    },
  });

  function updateField(field: ProfileField, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
    setFeedback(null);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = updateCompanyProfileSchema.safeParse(form);
    if (!result.success) {
      const errors = result.error.flatten().fieldErrors;
      setFieldErrors({
        tradeName: errors.tradeName?.[0],
        legalName: errors.legalName?.[0],
        whatsapp: errors.whatsapp?.[0],
        fullName: errors.fullName?.[0],
      });
      setFeedback(null);
      return;
    }
    updateMutation.mutate(result.data);
  }

  const fieldsDisabled = !profile.canEdit || updateMutation.isPending;

  return (
    <Card>
      <CardHeader className="border-b border-border/60 bg-gradient-to-r from-portal-soft/70 to-transparent">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-portal p-2.5 text-white shadow-sm">
            <Building2 aria-hidden="true" className="size-5" />
          </div>
          <div>
            <CardTitle>Dados da empresa</CardTitle>
            <CardDescription className="mt-1">
              Mantenha os dados comerciais e o contato principal sempre atualizados.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-6">
        <form className="space-y-6" onSubmit={handleSubmit} noValidate>
          <div className="grid gap-5 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="company-trade-name">Nome fantasia</Label>
              <Input
                id="company-trade-name"
                value={form.tradeName}
                disabled={fieldsDisabled}
                onChange={(event) => updateField('tradeName', event.target.value)}
                autoComplete="organization"
                aria-invalid={Boolean(fieldErrors.tradeName)}
                aria-describedby={fieldErrors.tradeName ? 'company-trade-name-error' : undefined}
              />
              {fieldErrors.tradeName && (
                <p id="company-trade-name-error" className="text-xs text-destructive" role="alert">
                  {fieldErrors.tradeName}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="company-legal-name">Razão social</Label>
              <Input
                id="company-legal-name"
                value={form.legalName}
                disabled={fieldsDisabled}
                onChange={(event) => updateField('legalName', event.target.value)}
                aria-invalid={Boolean(fieldErrors.legalName)}
                aria-describedby={fieldErrors.legalName ? 'company-legal-name-error' : undefined}
              />
              {fieldErrors.legalName && (
                <p id="company-legal-name-error" className="text-xs text-destructive" role="alert">
                  {fieldErrors.legalName}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="company-full-name">Nome completo do responsável</Label>
              <Input
                id="company-full-name"
                value={form.fullName}
                disabled={fieldsDisabled}
                onChange={(event) => updateField('fullName', event.target.value)}
                autoComplete="name"
                aria-invalid={Boolean(fieldErrors.fullName)}
                aria-describedby={fieldErrors.fullName ? 'company-full-name-error' : undefined}
              />
              {fieldErrors.fullName && (
                <p id="company-full-name-error" className="text-xs text-destructive" role="alert">
                  {fieldErrors.fullName}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="company-whatsapp">WhatsApp</Label>
              <Input
                id="company-whatsapp"
                type="tel"
                value={form.whatsapp}
                disabled={fieldsDisabled}
                onChange={(event) => updateField('whatsapp', event.target.value)}
                autoComplete="tel"
                inputMode="tel"
                placeholder="(33) 99999-9999"
                aria-invalid={Boolean(fieldErrors.whatsapp)}
                aria-describedby={fieldErrors.whatsapp ? 'company-whatsapp-error' : undefined}
              />
              {fieldErrors.whatsapp && (
                <p id="company-whatsapp-error" className="text-xs text-destructive" role="alert">
                  {fieldErrors.whatsapp}
                </p>
              )}
            </div>
          </div>

          <div className="grid gap-3 rounded-xl border border-border/70 bg-muted/30 p-4 text-sm sm:grid-cols-2">
            <div>
              <p className="text-xs font-medium text-muted-foreground">E-mail de acesso</p>
              <p className="mt-1 break-all font-medium text-portal-deep">{profile.email}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">CPF/CNPJ</p>
              <p className="mt-1 font-medium text-portal-deep">{profile.document}</p>
            </div>
          </div>

          {!profile.canEdit && (
            <p className="rounded-xl border border-amber-300/70 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              Somente um responsável ativo pode alterar os dados da empresa.
            </p>
          )}
          {feedback && (
            <p className="flex items-center gap-2 text-sm text-status-entregue" role="status">
              <CheckCircle2 aria-hidden="true" className="size-4" />
              {feedback}
            </p>
          )}
          {updateMutation.isError && (
            <p className="text-sm text-destructive" role="alert">
              {errorMessage(updateMutation.error)}
            </p>
          )}

          {profile.canEdit && (
            <div className="flex justify-end">
              <Button type="submit" disabled={updateMutation.isPending}>
                <Save aria-hidden="true" />
                {updateMutation.isPending ? 'Salvando...' : 'Salvar alterações'}
              </Button>
            </div>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
