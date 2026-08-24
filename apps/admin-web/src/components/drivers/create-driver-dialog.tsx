'use client';

import { useState, type FormEvent, type ReactElement, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@motoboycity/api-client';
import type { RegisterDriverResult, ServiceTypeItem } from '@motoboycity/types';
import {
  createAdminDriverSchema,
  pixKeyTypes,
  type CreateAdminDriverPayload,
  type PixKeyType,
} from '@motoboycity/validation';
import { Bike, KeyRound, MapPin, ShieldCheck, UserRound } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { adminDriversApi } from '@/lib/api-client';

const pixKeyTypeLabels: Record<PixKeyType, string> = {
  CPF: 'CPF',
  EMAIL: 'E-mail',
  PHONE: 'Telefone',
  RANDOM: 'Chave aleatória',
};

const initialForm = {
  name: '',
  email: '',
  phone: '',
  cpf: '',
  birthDate: '',
  pixKey: '',
  password: '',
  confirmPassword: '',
  regionId: '',
};

type FormField = keyof typeof initialForm;
type ErrorField = FormField | 'serviceTypeIds' | 'form';
type FieldErrors = Partial<Record<ErrorField, string>>;

const errorFields = new Set<ErrorField>([
  'name',
  'email',
  'phone',
  'cpf',
  'birthDate',
  'pixKey',
  'password',
  'confirmPassword',
  'regionId',
  'serviceTypeIds',
  'form',
]);

const fieldFocusIds: Record<ErrorField, string> = {
  name: 'driver-name',
  email: 'driver-email',
  phone: 'driver-phone',
  cpf: 'driver-cpf',
  birthDate: 'driver-birth-date',
  pixKey: 'driver-pix-key',
  password: 'driver-password',
  confirmPassword: 'driver-confirm-password',
  regionId: 'driver-region',
  serviceTypeIds: 'driver-service-types',
  form: 'create-driver-error',
};

function fieldErrorId(field: ErrorField): string {
  return `create-driver-${field}-error`;
}

function errorFieldFromPath(path: string): ErrorField {
  const field = path.split('.')[0] as ErrorField;
  return errorFields.has(field) ? field : 'form';
}

interface CreateDriverDialogProps {
  accessToken: string;
  serviceTypes: ServiceTypeItem[];
  serviceTypesLoading: boolean;
  serviceTypesError: boolean;
  onRetryServiceTypes: () => void;
  children: ReactElement;
  onCreated: (result: RegisterDriverResult) => void;
}

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="text-xs font-medium text-destructive">
      {message}
    </p>
  );
}

function SectionHeading({
  icon,
  title,
  description,
}: {
  icon: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/15">
        {icon}
      </span>
      <div>
        <h3 className="font-heading text-sm font-semibold text-foreground">{title}</h3>
        <p className="text-xs leading-relaxed text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

export function CreateDriverDialog({
  accessToken,
  serviceTypes,
  serviceTypesLoading,
  serviceTypesError,
  onRetryServiceTypes,
  children,
  onCreated,
}: CreateDriverDialogProps) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(initialForm);
  const [pixKeyType, setPixKeyType] = useState<PixKeyType>('EMAIL');
  const [hasCnpj, setHasCnpj] = useState(false);
  const [serviceTypeIds, setServiceTypeIds] = useState<string[]>([]);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const optionsQuery = useQuery({
    queryKey: ['admin', 'driver-registration-options'],
    queryFn: () => adminDriversApi.registrationOptions(accessToken),
    enabled: open,
  });

  const createMutation = useMutation({
    mutationFn: (payload: CreateAdminDriverPayload) =>
      adminDriversApi.create(accessToken, payload),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'drivers'], exact: true });
      onCreated(result);
      resetForm();
      setOpen(false);
    },
    onError: (error) => {
      if (error instanceof ApiError && error.body?.issues?.length) {
        const errors: FieldErrors = {};
        for (const issue of error.body.issues) {
          const field = errorFieldFromPath(issue.path);
          if (!errors[field]) errors[field] = issue.message;
        }
        setFieldErrors(errors);
        focusField(errorFieldFromPath(error.body.issues[0]?.path ?? 'form'));
      }
      setFormError(
        error instanceof ApiError
          ? error.message
          : 'Não foi possível cadastrar o entregador. Tente novamente.',
      );
    },
  });

  function resetForm() {
    setForm(initialForm);
    setPixKeyType('EMAIL');
    setHasCnpj(false);
    setServiceTypeIds([]);
    setFieldErrors({});
    setFormError(null);
    createMutation.reset();
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen && createMutation.isPending) return;
    setOpen(nextOpen);
    if (!nextOpen) resetForm();
  }

  function updateField(field: FormField, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
    setFormError(null);
    setFieldErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  }

  function focusField(field: ErrorField) {
    requestAnimationFrame(() => document.getElementById(fieldFocusIds[field])?.focus());
  }

  function toggleServiceType(serviceTypeId: string) {
    setServiceTypeIds((current) =>
      current.includes(serviceTypeId)
        ? current.filter((id) => id !== serviceTypeId)
        : [...current, serviceTypeId],
    );
    setFormError(null);
    setFieldErrors((current) => {
      if (!current.serviceTypeIds) return current;
      const next = { ...current };
      delete next.serviceTypeIds;
      return next;
    });
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    if (form.password !== form.confirmPassword) {
      setFieldErrors((current) => ({
        ...current,
        confirmPassword: 'As senhas não coincidem.',
      }));
      focusField('confirmPassword');
      return;
    }

    const payloadFields = {
      name: form.name,
      email: form.email,
      phone: form.phone,
      cpf: form.cpf,
      birthDate: form.birthDate,
      pixKey: form.pixKey,
      password: form.password,
      regionId: form.regionId,
    };
    const result = createAdminDriverSchema.safeParse({
      ...payloadFields,
      pixKeyType,
      hasCnpj,
      serviceTypeIds,
    });

    if (!result.success) {
      const errors: FieldErrors = {};
      for (const issue of result.error.issues) {
        const field = String(issue.path[0] ?? 'form') as ErrorField;
        if (!errors[field]) errors[field] = issue.message;
      }
      setFieldErrors(errors);
      focusField(errorFieldFromPath(String(result.error.issues[0]?.path[0] ?? 'form')));
      return;
    }

    setFieldErrors({});
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
              <UserRound className="size-5" />
            </span>
            <div>
              <DialogTitle>Cadastrar entregador</DialogTitle>
              <DialogDescription>
                Crie o acesso e deixe o perfil pronto para a revisão administrativa.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <DialogBody>
          <form id="create-driver-form" className="space-y-7" noValidate onSubmit={handleSubmit}>
            <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-primary/15 bg-primary/5 px-4 py-3">
              <ShieldCheck className="size-4 text-primary" />
              <Badge variant="outline" className="border-primary/25 bg-card text-primary">
                Cadastro protegido
              </Badge>
              <p className="text-xs text-muted-foreground">
                A conta nasce pendente e indisponível até você revisar e aprovar.
              </p>
            </div>

            <section className="space-y-4">
              <SectionHeading
                icon={<UserRound className="size-4" />}
                title="Dados pessoais"
                description="Informações usadas na identificação e no acesso ao aplicativo."
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="driver-name">Nome completo</Label>
                  <Input
                    id="driver-name"
                    value={form.name}
                    onChange={(event) => updateField('name', event.target.value)}
                    autoComplete="name"
                    aria-invalid={Boolean(fieldErrors.name)}
                    aria-describedby={fieldErrors.name ? fieldErrorId('name') : undefined}
                    placeholder="Ex.: Maicon Douglas"
                  />
                  <FieldError id={fieldErrorId('name')} message={fieldErrors.name} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="driver-email">E-mail</Label>
                  <Input
                    id="driver-email"
                    type="email"
                    value={form.email}
                    onChange={(event) => updateField('email', event.target.value)}
                    autoComplete="email"
                    aria-invalid={Boolean(fieldErrors.email)}
                    aria-describedby={fieldErrors.email ? fieldErrorId('email') : undefined}
                    placeholder="entregador@exemplo.com"
                  />
                  <FieldError id={fieldErrorId('email')} message={fieldErrors.email} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="driver-phone">Telefone</Label>
                  <Input
                    id="driver-phone"
                    inputMode="numeric"
                    value={form.phone}
                    onChange={(event) => updateField('phone', event.target.value)}
                    autoComplete="tel"
                    aria-invalid={Boolean(fieldErrors.phone)}
                    aria-describedby={fieldErrors.phone ? fieldErrorId('phone') : undefined}
                    placeholder="(33) 99999-9999"
                  />
                  <FieldError id={fieldErrorId('phone')} message={fieldErrors.phone} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="driver-cpf">CPF</Label>
                  <Input
                    id="driver-cpf"
                    inputMode="numeric"
                    value={form.cpf}
                    onChange={(event) => updateField('cpf', event.target.value)}
                    aria-invalid={Boolean(fieldErrors.cpf)}
                    aria-describedby={fieldErrors.cpf ? fieldErrorId('cpf') : undefined}
                    placeholder="000.000.000-00"
                  />
                  <FieldError id={fieldErrorId('cpf')} message={fieldErrors.cpf} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="driver-birth-date">Data de nascimento</Label>
                  <Input
                    id="driver-birth-date"
                    type="date"
                    value={form.birthDate}
                    onChange={(event) => updateField('birthDate', event.target.value)}
                    aria-invalid={Boolean(fieldErrors.birthDate)}
                    aria-describedby={
                      fieldErrors.birthDate ? fieldErrorId('birthDate') : undefined
                    }
                  />
                  <FieldError
                    id={fieldErrorId('birthDate')}
                    message={fieldErrors.birthDate}
                  />
                </div>
              </div>
            </section>

            <section className="space-y-4 border-t border-border/70 pt-6">
              <SectionHeading
                icon={<MapPin className="size-4" />}
                title="Operação"
                description="A região e as modalidades definem quais ofertas poderão chegar."
              />
              <div className="space-y-1.5">
                <Label htmlFor="driver-region">Região</Label>
                <Select
                  items={Object.fromEntries(regions.map((region) => [region.id, region.name]))}
                  value={form.regionId}
                  onValueChange={(value) => updateField('regionId', value ?? '')}
                  disabled={optionsQuery.isLoading || regions.length === 0}
                >
                  <SelectTrigger
                    id="driver-region"
                    className="h-10 w-full"
                    aria-invalid={Boolean(fieldErrors.regionId)}
                    aria-describedby={
                      fieldErrors.regionId ? fieldErrorId('regionId') : undefined
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
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-medium text-destructive">
                      Não foi possível carregar as regiões.
                    </p>
                    <Button
                      type="button"
                      size="xs"
                      variant="outline"
                      onClick={() => void optionsQuery.refetch()}
                    >
                      Tentar novamente
                    </Button>
                  </div>
                )}
                {optionsQuery.isSuccess && regions.length === 0 && (
                  <p className="text-xs font-medium text-destructive">
                    Nenhuma região ativa está disponível para cadastro.
                  </p>
                )}
                <FieldError id={fieldErrorId('regionId')} message={fieldErrors.regionId} />
              </div>

              <div className="space-y-2">
                <Label id="driver-service-types-label">Modalidades</Label>
                <div
                  id="driver-service-types"
                  role="group"
                  tabIndex={-1}
                  aria-labelledby="driver-service-types-label"
                  aria-describedby={
                    fieldErrors.serviceTypeIds ? fieldErrorId('serviceTypeIds') : undefined
                  }
                  className="grid gap-2 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring sm:grid-cols-2"
                >
                  {serviceTypes.map((serviceType) => (
                    <label
                      key={serviceType.id}
                      className="flex cursor-pointer items-center gap-3 rounded-xl border border-border/80 bg-muted/25 px-3 py-2.5 text-sm transition-colors hover:border-primary/30 hover:bg-primary/5"
                    >
                      <Checkbox
                        checked={serviceTypeIds.includes(serviceType.id)}
                        onCheckedChange={() => toggleServiceType(serviceType.id)}
                        aria-label={`Modalidade ${serviceType.name}`}
                      />
                      <Bike className="size-4 text-primary" />
                      <span className="font-medium">{serviceType.name}</span>
                      <span className="ml-auto text-xs text-muted-foreground">
                        {serviceType.code}
                      </span>
                    </label>
                  ))}
                </div>
                {serviceTypesLoading && (
                  <p className="text-xs text-muted-foreground">Carregando modalidades...</p>
                )}
                {serviceTypesError && (
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-medium text-destructive">
                      Não foi possível carregar as modalidades.
                    </p>
                    <Button type="button" size="xs" variant="outline" onClick={onRetryServiceTypes}>
                      Tentar novamente
                    </Button>
                  </div>
                )}
                {!serviceTypesLoading && !serviceTypesError && serviceTypes.length === 0 && (
                  <p className="text-xs font-medium text-destructive">
                    Ative uma modalidade antes de cadastrar entregadores.
                  </p>
                )}
                <FieldError
                  id={fieldErrorId('serviceTypeIds')}
                  message={fieldErrors.serviceTypeIds}
                />
              </div>
            </section>

            <section className="space-y-4 border-t border-border/70 pt-6">
              <SectionHeading
                icon={<KeyRound className="size-4" />}
                title="PIX e acesso"
                description="Dados de repasse e a senha inicial usada no aplicativo."
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="driver-pix-type">Tipo da chave PIX</Label>
                  <Select
                    items={Object.fromEntries(
                      pixKeyTypes.map((type) => [type, pixKeyTypeLabels[type]]),
                    )}
                    value={pixKeyType}
                    onValueChange={(value) => setPixKeyType((value ?? 'EMAIL') as PixKeyType)}
                  >
                    <SelectTrigger id="driver-pix-type" className="h-10 w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {pixKeyTypes.map((type) => (
                        <SelectItem key={type} value={type}>
                          {pixKeyTypeLabels[type]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="driver-pix-key">Chave PIX</Label>
                  <Input
                    id="driver-pix-key"
                    value={form.pixKey}
                    onChange={(event) => updateField('pixKey', event.target.value)}
                    aria-invalid={Boolean(fieldErrors.pixKey)}
                    aria-describedby={fieldErrors.pixKey ? fieldErrorId('pixKey') : undefined}
                    placeholder="Informe a chave de recebimento"
                  />
                  <FieldError id={fieldErrorId('pixKey')} message={fieldErrors.pixKey} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="driver-password">Senha inicial</Label>
                  <Input
                    id="driver-password"
                    type="password"
                    value={form.password}
                    onChange={(event) => updateField('password', event.target.value)}
                    autoComplete="new-password"
                    aria-invalid={Boolean(fieldErrors.password)}
                    aria-describedby={
                      fieldErrors.password ? fieldErrorId('password') : undefined
                    }
                    placeholder="Mínimo de 8 caracteres"
                  />
                  <FieldError id={fieldErrorId('password')} message={fieldErrors.password} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="driver-confirm-password">Confirmar senha</Label>
                  <Input
                    id="driver-confirm-password"
                    type="password"
                    value={form.confirmPassword}
                    onChange={(event) => updateField('confirmPassword', event.target.value)}
                    autoComplete="new-password"
                    aria-invalid={Boolean(fieldErrors.confirmPassword)}
                    aria-describedby={
                      fieldErrors.confirmPassword ? fieldErrorId('confirmPassword') : undefined
                    }
                    placeholder="Repita a senha inicial"
                  />
                  <FieldError
                    id={fieldErrorId('confirmPassword')}
                    message={fieldErrors.confirmPassword}
                  />
                </div>
              </div>

              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border/80 bg-muted/25 px-3 py-3 text-sm">
                <Checkbox
                  checked={hasCnpj}
                  onCheckedChange={(checked) => setHasCnpj(checked === true)}
                  aria-label="Possui CNPJ"
                />
                <span>
                  <span className="block font-medium">Possui CNPJ</span>
                  <span className="text-xs text-muted-foreground">
                    Marque quando o entregador atua como pessoa jurídica.
                  </span>
                </span>
              </label>
            </section>

            {formError && (
              <div
                id="create-driver-error"
                role="alert"
                tabIndex={-1}
                className="rounded-xl border border-destructive/25 bg-destructive/8 px-4 py-3 text-sm font-medium text-destructive"
              >
                {formError}
              </div>
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
              form="create-driver-form"
              disabled={
                createMutation.isPending ||
                optionsQuery.isLoading ||
                regions.length === 0 ||
                serviceTypesLoading ||
                serviceTypesError ||
                serviceTypes.length === 0
              }
            >
              {createMutation.isPending ? 'Cadastrando...' : 'Criar cadastro'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
