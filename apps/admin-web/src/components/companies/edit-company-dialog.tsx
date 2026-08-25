'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AdminCompanyDetail } from '@motoboycity/types';
import {
  updateCompanyProfileSchema,
  upsertCompanyAddressSchema,
  type UpdateCompanyProfilePayload,
  type UpsertCompanyAddressPayload,
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

type AddressForm = {
  label: string;
  street: string;
  number: string;
  complement: string;
  city: string;
  state: string;
  zip: string;
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
  };
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
  const [address, setAddress] = useState(() => addressFrom(company));
  const [profileError, setProfileError] = useState<string | null>(null);
  const [addressError, setAddressError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const primaryAddressId = useMemo(
    () => company.addresses.find((item) => item.isPrimary)?.id ?? company.addresses[0]?.id,
    [company.addresses],
  );

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) return;
    setProfile(profileFrom(company));
    setAddress(addressFrom(company));
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
    mutationFn: (payload: UpdateCompanyProfilePayload) =>
      adminCompaniesApi.updateProfile(token, company.id, payload),
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
    if (!parsed.success) {
      setProfileError(parsed.error.issues[0]?.message ?? 'Revise os dados informados.');
      return;
    }
    profileMutation.mutate(parsed.data);
  }

  function submitAddress(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSuccess(null);
    const candidate = {
      ...address,
      label: address.label.trim() || undefined,
      complement: address.complement.trim() || undefined,
      state: address.state.trim().toUpperCase(),
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
            <p className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-primary">
              {success}
            </p>
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
            {profileError && <p className="text-sm text-destructive">{profileError}</p>}
            <div className="flex justify-end">
              <Button type="submit" disabled={profileMutation.isPending}>
                {profileMutation.isPending ? 'Salvando...' : 'Salvar cadastro'}
              </Button>
            </div>
          </form>

          <div className="h-px bg-border" />

          <form className="space-y-4" onSubmit={submitAddress}>
            <div className="flex items-center gap-2">
              <MapPinned className="size-4 text-primary" />
              <h3 className="font-semibold">Endereco principal</h3>
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
              <div className="space-y-1.5 sm:col-span-3">
                <Label htmlFor="admin-company-street">Rua</Label>
                <Input
                  id="admin-company-street"
                  value={address.street}
                  onChange={(event) => setAddress({ ...address, street: event.target.value })}
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
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="admin-company-complement">Complemento</Label>
                <Input
                  id="admin-company-complement"
                  value={address.complement}
                  onChange={(event) => setAddress({ ...address, complement: event.target.value })}
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="admin-company-city">Cidade</Label>
                <Input
                  id="admin-company-city"
                  value={address.city}
                  onChange={(event) => setAddress({ ...address, city: event.target.value })}
                />
              </div>
              <div className="space-y-1.5 sm:col-span-1">
                <Label htmlFor="admin-company-state">UF</Label>
                <Input
                  id="admin-company-state"
                  maxLength={2}
                  value={address.state}
                  onChange={(event) => setAddress({ ...address, state: event.target.value })}
                />
              </div>
              <div className="space-y-1.5 sm:col-span-1">
                <Label htmlFor="admin-company-zip">CEP</Label>
                <Input
                  id="admin-company-zip"
                  value={address.zip}
                  onChange={(event) => setAddress({ ...address, zip: event.target.value })}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Ao alterar o texto do endereco, coordenadas antigas sao removidas para nao apontar a
              coleta para o local anterior.
            </p>
            {addressError && <p className="text-sm text-destructive">{addressError}</p>}
            <div className="flex justify-end">
              <Button type="submit" disabled={addressMutation.isPending}>
                {addressMutation.isPending
                  ? 'Salvando...'
                  : primaryAddressId
                    ? 'Salvar endereco'
                    : 'Cadastrar endereco'}
              </Button>
            </div>
          </form>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
