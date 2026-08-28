'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AdminCompanyDetail } from '@motoboycity/types';
import {
  updateCompanyProfileSchema,
  upsertCompanyAddressSchema,
  type UpdateCompanyProfilePayload,
  type UpsertCompanyAddressPayload,
  adminUpdateCompanySchema,
  type AdminUpdateCompanyPayload,
} from '@motoboycity/validation';
import { Building2, MapPinned, Pencil } from 'lucide-react';
import { ApiError } from '@motoboycity/api-client';
import { adminCompaniesApi } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ActionFeedback } from '@/components/ui/action-feedback';
import { PendingButtonLabel } from '@/components/ui/pending-button-label';
import {
  GoogleAddressAutocomplete,
  type SelectedGoogleAddress,
} from '@/components/companies/google-address-autocomplete';

type AddressForm = {
  label: string;
  street: string;
  number: string;
  complement: string;
  city: string;
  state: string;
  zip: string;
  lat: number | null;
  lng: number | null;
};

function profileFrom(company: AdminCompanyDetail): UpdateCompanyProfilePayload {
  return {
    tradeName: company.tradeName,
    legalName: company.legalName,
    fullName: company.owner?.name ?? '',
    whatsapp: company.owner?.phone ?? '',
  };
}

function addressFrom(company: AdminCompanyDetail): AddressForm {
  const address = company.addresses.find((item) => item.isPrimary) ?? company.addresses[0];
  return {
    label: address?.label ?? '',
    street: address?.street ?? '',
    number: address?.number ?? '',
    complement: address?.complement ?? '',
    city: address?.city ?? '',
    state: address?.state ?? '',
    zip: address?.zip ?? '',
    lat: address?.lat ?? null,
    lng: address?.lng ?? null,
  };
}

function addressSearchFrom(company: AdminCompanyDetail): string {
  const address = company.addresses.find((item) => item.isPrimary) ?? company.addresses[0];
  if (!address) return '';
  return `${address.street}, ${address.number} - ${address.city}/${address.state}`;
}

export function EditCompanyDialog({
  company,
  token,
}: {
  company: AdminCompanyDetail;
  token: string;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [profile, setProfile] = useState(() => profileFrom(company));
  const [core, setCore] = useState<AdminUpdateCompanyPayload>(() => ({
    tradeName: company.tradeName,
    legalName: company.legalName,
    document: company.document,
    regionId: company.region.id,
  }));
  const [address, setAddress] = useState(() => addressFrom(company));
  const [addressSearch, setAddressSearch] = useState(() => addressSearchFrom(company));
  const [profileError, setProfileError] = useState<string | null>(null);
  const [addressError, setAddressError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const primaryAddressId = useMemo(
    () => company.addresses.find((item) => item.isPrimary)?.id ?? company.addresses[0]?.id,
    [company.addresses],
  );
  const optionsQuery = useQuery({
    queryKey: ['admin', 'company-registration-options'],
    queryFn: () => adminCompaniesApi.registrationOptions(token),
    enabled: open,
  });

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) return;
    setProfile(profileFrom(company));
    setCore({
      tradeName: company.tradeName,
      legalName: company.legalName,
      document: company.document,
      regionId: company.region.id,
    });
    setAddress(addressFrom(company));
    setAddressSearch(addressSearchFrom(company));
    setProfileError(null);
    setAddressError(null);
    setSuccess(null);
  }

  function acceptUpdatedCompany(updated: AdminCompanyDetail, message: string) {
    queryClient.setQueryData(['admin', 'company', company.id], updated);
    void queryClient.invalidateQueries({ queryKey: ['admin', 'companies'] });
    setSuccess(message);
  }

  const profileMutation = useMutation({
    mutationFn: async (payload: {
      core: AdminUpdateCompanyPayload;
      profile: UpdateCompanyProfilePayload;
    }) => {
      await adminCompaniesApi.update(token, company.id, payload.core);
      return adminCompaniesApi.updateProfile(token, company.id, payload.profile);
    },
    onSuccess: (updated) => {
      setProfileError(null);
      acceptUpdatedCompany(updated, 'Dados cadastrais atualizados.');
    },
    onError: (error) =>
      setProfileError(
        error instanceof ApiError ? error.message : 'Nao foi possivel atualizar o cadastro.',
      ),
  });

  const addressMutation = useMutation({
    mutationFn: (payload: UpsertCompanyAddressPayload) =>
      adminCompaniesApi.upsertPrimaryAddress(token, company.id, payload),
    onSuccess: (updated) => {
      setAddressError(null);
      acceptUpdatedCompany(
        updated,
        primaryAddressId ? 'Endereco principal atualizado.' : 'Endereco principal cadastrado.',
      );
    },
    onError: (error) =>
      setAddressError(
        error instanceof ApiError ? error.message : 'Nao foi possivel atualizar o endereco.',
      ),
  });

  function submitProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSuccess(null);
    const parsed = updateCompanyProfileSchema.safeParse(profile);
    const parsedCore = adminUpdateCompanySchema.safeParse({
      ...core,
      tradeName: profile.tradeName,
      legalName: profile.legalName,
    });
    if (!parsed.success || !parsedCore.success) {
      const issue = !parsed.success
        ? parsed.error.issues[0]?.message
        : !parsedCore.success
          ? parsedCore.error.issues[0]?.message
          : undefined;
      setProfileError(issue ?? 'Revise os dados informados.');
      return;
    }
    profileMutation.mutate({ core: parsedCore.data, profile: parsed.data });
  }

  function submitAddress(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSuccess(null);
    if (address.lat === null || address.lng === null) {
      setAddressError('Selecione o endereço na lista do Google para confirmar as coordenadas.');
      return;
    }
    const candidate = {
      ...address,
      label: address.label.trim() || undefined,
      complement: address.complement.trim() || undefined,
      state: address.state.trim().toUpperCase(),
      lat: address.lat,
      lng: address.lng,
    };
    const parsed = upsertCompanyAddressSchema.safeParse(candidate);
    if (!parsed.success) {
      setAddressError(parsed.error.issues[0]?.message ?? 'Revise o endereco informado.');
      return;
    }
    addressMutation.mutate(parsed.data);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <Pencil className="size-3.5" /> Editar empresa
      </DialogTrigger>
      <DialogContent
        className="sm:max-w-3xl"
        closeDisabled={profileMutation.isPending || addressMutation.isPending}
      >
        <DialogHeader>
          <DialogTitle>Editar {company.tradeName}</DialogTitle>
          <DialogDescription>
            Atualize os dados comerciais, o responsavel e o endereco principal da empresa.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-6">
          {success && (
            <ActionFeedback tone="success" title="Alterações salvas">
              {success}
            </ActionFeedback>
          )}

          <form className="space-y-4" onSubmit={submitProfile}>
            <div className="flex items-center gap-2">
              <Building2 className="size-4 text-primary" />
              <h3 className="font-semibold">Cadastro e responsavel</h3>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="admin-company-trade-name">Nome fantasia</Label>
                <Input
                  id="admin-company-trade-name"
                  value={profile.tradeName}
                  onChange={(event) => setProfile({ ...profile, tradeName: event.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="admin-company-document">CNPJ</Label>
                <Input
                  id="admin-company-document"
                  inputMode="numeric"
                  value={core.document}
                  onChange={(event) => setCore({ ...core, document: event.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="admin-company-region">Regiao</Label>
                <select
                  id="admin-company-region"
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                  value={core.regionId}
                  onChange={(event) => setCore({ ...core, regionId: event.target.value })}
                >
                  {(optionsQuery.data?.regions ?? [company.region]).map((region) => (
                    <option key={region.id} value={region.id}>
                      {region.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="admin-company-legal-name">Razao social</Label>
                <Input
                  id="admin-company-legal-name"
                  value={profile.legalName}
                  onChange={(event) => setProfile({ ...profile, legalName: event.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="admin-company-owner-name">Nome do responsavel</Label>
                <Input
                  id="admin-company-owner-name"
                  value={profile.fullName}
                  onChange={(event) => setProfile({ ...profile, fullName: event.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="admin-company-whatsapp">WhatsApp</Label>
                <Input
                  id="admin-company-whatsapp"
                  inputMode="tel"
                  value={profile.whatsapp}
                  onChange={(event) => setProfile({ ...profile, whatsapp: event.target.value })}
                />
              </div>
            </div>
            {profileError && (
              <ActionFeedback tone="error" title="Revise o cadastro">
                {profileError}
              </ActionFeedback>
            )}
            <div className="flex justify-end">
              <Button type="submit" disabled={profileMutation.isPending}>
                <PendingButtonLabel pending={profileMutation.isPending} pendingLabel="Salvando...">
                  Salvar cadastro
                </PendingButtonLabel>
              </Button>
            </div>
          </form>

          <div className="h-px bg-border" />

          <form className="space-y-4" onSubmit={submitAddress}>
            <div className="flex items-center gap-2">
              <MapPinned className="size-4 text-primary" />
              <h3 className="font-semibold">Endereco principal</h3>
            </div>
            <div className="space-y-1.5">
              <Label>Buscar endereço no Google</Label>
              <GoogleAddressAutocomplete
                value={addressSearch}
                onValueChange={setAddressSearch}
                onAddressChange={(selected: SelectedGoogleAddress | null) => {
                  if (!selected) {
                    setAddress((current) => ({ ...current, lat: null, lng: null }));
                    return;
                  }
                  setAddress((current) => ({
                    ...current,
                    street: selected.street,
                    number: selected.number || current.number,
                    city: selected.city,
                    state: selected.state,
                    zip: selected.zip,
                    lat: selected.lat,
                    lng: selected.lng,
                  }));
                  setAddressError(null);
                }}
              />
              <p className="text-xs text-muted-foreground">
                Selecione uma sugestão: este ponto libera coleta e retorno por proximidade.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-6">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="admin-company-address-label">Identificacao</Label>
                <Input
                  id="admin-company-address-label"
                  placeholder="Ex.: Loja principal"
                  value={address.label}
                  onChange={(event) => setAddress({ ...address, label: event.target.value })}
                />
              </div>
              <div className="space-y-1.5 sm:col-span-1">
                <Label htmlFor="admin-company-number">Numero</Label>
                <Input
                  id="admin-company-number"
                  value={address.number}
                  onChange={(event) => setAddress({ ...address, number: event.target.value })}
                />
              </div>
              <div className="space-y-1.5 sm:col-span-3">
                <Label htmlFor="admin-company-complement">Complemento</Label>
                <Input
                  id="admin-company-complement"
                  value={address.complement}
                  onChange={(event) => setAddress({ ...address, complement: event.target.value })}
                />
              </div>
            </div>
            {address.lat !== null && address.lng !== null && (
              <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
                <p className="font-medium text-foreground">
                  {address.street}, {address.number} · {address.city}/{address.state}
                </p>
                <p>
                  CEP {address.zip} · Coordenadas {address.lat.toFixed(6)}, {address.lng.toFixed(6)}
                </p>
              </div>
            )}
            {addressError && (
              <ActionFeedback tone="error" title="Revise o endereço">
                {addressError}
              </ActionFeedback>
            )}
            <div className="flex justify-end">
              <Button type="submit" disabled={addressMutation.isPending}>
                <PendingButtonLabel pending={addressMutation.isPending} pendingLabel="Salvando...">
                  {primaryAddressId ? 'Salvar endereco' : 'Cadastrar endereco'}
                </PendingButtonLabel>
              </Button>
            </div>
          </form>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
