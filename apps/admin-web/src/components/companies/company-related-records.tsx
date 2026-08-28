'use client';

import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@motoboycity/api-client';
import type { AdminCompanyDetail } from '@motoboycity/types';
import {
  adminCompanyAddressSchema,
  adminCreateCompanyMemberSchema,
  adminUpdateCompanyMemberSchema,
} from '@motoboycity/validation';
import { KeyRound, Pencil, Plus } from 'lucide-react';
import { adminCompaniesApi } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ChangePasswordDialog } from '@/components/users/change-password-dialog';
import {
  GoogleAddressAutocomplete,
  type SelectedGoogleAddress,
} from '@/components/companies/google-address-autocomplete';

type Address = AdminCompanyDetail['addresses'][number];
type Member = AdminCompanyDetail['teamMembers'][number];

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
  isPrimary: boolean;
};

const emptyAddress: AddressForm = {
  label: '',
  street: '',
  number: '',
  complement: '',
  city: '',
  state: '',
  zip: '',
  lat: null,
  lng: null,
  isPrimary: false,
};

function addressSearch(address: Address): string {
  return `${address.street}, ${address.number} - ${address.city}/${address.state}`;
}

export function CompanyAddressesManager({
  company,
  token,
}: {
  company: AdminCompanyDetail;
  token: string;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Address | null>(null);
  const [form, setForm] = useState(emptyAddress);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);

  function publish(updated: AdminCompanyDetail) {
    queryClient.setQueryData(['admin', 'company', company.id], updated);
    void queryClient.invalidateQueries({ queryKey: ['admin', 'companies'] });
    setOpen(false);
  }
  function start(address?: Address) {
    setEditing(address ?? null);
    setForm(
      address
        ? {
            label: address.label ?? '',
            street: address.street,
            number: address.number,
            complement: address.complement ?? '',
            city: address.city,
            state: address.state,
            zip: address.zip,
            lat: address.lat,
            lng: address.lng,
            isPrimary: address.isPrimary,
          }
        : emptyAddress,
    );
    setSearch(address ? addressSearch(address) : '');
    setError(null);
    setOpen(true);
  }
  const save = useMutation({
    mutationFn: (payload: Parameters<typeof adminCompaniesApi.addAddress>[2]) =>
      editing
        ? adminCompaniesApi.updateAddress(token, company.id, editing.id, payload)
        : adminCompaniesApi.addAddress(token, company.id, payload),
    onSuccess: publish,
    onError: (cause) =>
      setError(cause instanceof ApiError ? cause.message : 'Nao foi possivel salvar o endereco.'),
  });
  const remove = useMutation({
    mutationFn: (addressId: string) =>
      adminCompaniesApi.deleteAddress(token, company.id, addressId),
    onSuccess: publish,
    onError: (cause) =>
      setError(cause instanceof ApiError ? cause.message : 'Nao foi possivel remover o endereco.'),
  });
  function submit(event: FormEvent) {
    event.preventDefault();
    if (form.lat === null || form.lng === null) {
      setError('Selecione o endereço na lista do Google para confirmar as coordenadas.');
      return;
    }
    const parsed = adminCompanyAddressSchema.safeParse({
      ...form,
      label: form.label || undefined,
      complement: form.complement || undefined,
      state: form.state.toUpperCase(),
      lat: form.lat,
      lng: form.lng,
    });
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? 'Revise o endereco.');
    save.mutate(parsed.data);
  }
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => start()}>
        <Plus className="size-4" /> Novo endereco
      </Button>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {company.addresses.map((address) => (
          <div key={address.id} className="rounded-xl border bg-muted/20 p-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-medium">
                  {address.label ?? 'Sem rotulo'}
                  {address.isPrimary ? ' · principal' : ''}
                </p>
                <p className="text-sm text-muted-foreground">
                  {address.street}, {address.number}
                </p>
                <p className="text-xs text-muted-foreground">
                  {address.city} - {address.state} · {address.zip}
                </p>
                <p
                  className={
                    address.lat === null || address.lng === null
                      ? 'mt-1 text-xs font-medium text-destructive'
                      : 'mt-1 text-xs font-medium text-emerald-700'
                  }
                >
                  {address.lat === null || address.lng === null
                    ? 'Sem coordenadas · corrija antes da coleta'
                    : 'Coordenadas confirmadas'}
                </p>
              </div>
              <Button
                size="icon-sm"
                variant="ghost"
                onClick={() => start(address)}
                aria-label="Editar endereco"
              >
                <Pencil className="size-4" />
              </Button>
            </div>
          </div>
        ))}
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl" closeDisabled={save.isPending}>
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar endereco' : 'Novo endereco'}</DialogTitle>
            <DialogDescription>
              O endereco principal sera usado como coleta padrao.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <form className="grid gap-4 sm:grid-cols-2" onSubmit={submit}>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Buscar endereço no Google</Label>
                <GoogleAddressAutocomplete
                  value={search}
                  onValueChange={setSearch}
                  onAddressChange={(selected: SelectedGoogleAddress | null) => {
                    if (!selected) {
                      setForm((current) => ({ ...current, lat: null, lng: null }));
                      return;
                    }
                    setForm((current) => ({
                      ...current,
                      street: selected.street,
                      number: selected.number || current.number,
                      city: selected.city,
                      state: selected.state,
                      zip: selected.zip,
                      lat: selected.lat,
                      lng: selected.lng,
                    }));
                    setError(null);
                  }}
                />
              </div>
              {(['label', 'number', 'complement'] as const).map((field) => (
                <div key={field} className="space-y-1.5">
                  <Label htmlFor={`address-${field}`}>
                    {
                      (
                        {
                          label: 'Identificacao',
                          number: 'Numero',
                          complement: 'Complemento',
                        } as const
                      )[field]
                    }
                  </Label>
                  <Input
                    id={`address-${field}`}
                    value={form[field]}
                    onChange={(event) => setForm({ ...form, [field]: event.target.value })}
                  />
                </div>
              ))}
              {form.lat !== null && form.lng !== null && (
                <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground sm:col-span-2">
                  <p className="font-medium text-foreground">
                    {form.street}, {form.number} · {form.city}/{form.state}
                  </p>
                  <p>
                    CEP {form.zip} · Coordenadas {form.lat.toFixed(6)}, {form.lng.toFixed(6)}
                  </p>
                </div>
              )}
              <label className="flex items-center gap-2 text-sm sm:col-span-2">
                <input
                  type="checkbox"
                  checked={form.isPrimary}
                  onChange={(event) => setForm({ ...form, isPrimary: event.target.checked })}
                />{' '}
                Usar como endereco principal
              </label>
              {error && <p className="text-sm text-destructive sm:col-span-2">{error}</p>}
              <div className="flex justify-between gap-2 sm:col-span-2">
                {editing ? (
                  <Button
                    type="button"
                    variant="destructive"
                    disabled={remove.isPending}
                    onClick={() =>
                      window.confirm('Remover este endereco?') && remove.mutate(editing.id)
                    }
                  >
                    Remover
                  </Button>
                ) : (
                  <span />
                )}
                <Button
                  type="submit"
                  disabled={save.isPending || form.lat === null || form.lng === null}
                >
                  {save.isPending ? 'Salvando...' : 'Salvar endereco'}
                </Button>
              </div>
            </form>
          </DialogBody>
        </DialogContent>
      </Dialog>
    </>
  );
}

const emptyMember = { name: '', email: '', phone: '', role: 'OPERATOR' as const, password: '' };

export function CompanyMembersManager({
  company,
  token,
}: {
  company: AdminCompanyDetail;
  token: string;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Member | null>(null);
  const [form, setForm] = useState<{
    name: string;
    email: string;
    phone: string;
    role: 'OWNER' | 'OPERATOR';
    password: string;
  }>(emptyMember);
  const [error, setError] = useState<string | null>(null);
  function publish(updated: AdminCompanyDetail) {
    queryClient.setQueryData(['admin', 'company', company.id], updated);
    setOpen(false);
  }
  function start(member?: Member) {
    setEditing(member ?? null);
    setForm(
      member
        ? {
            name: member.user.name,
            email: member.user.email,
            phone: member.user.phone,
            role: member.role,
            password: '',
          }
        : emptyMember,
    );
    setError(null);
    setOpen(true);
  }
  const save = useMutation({
    mutationFn: () =>
      editing
        ? adminCompaniesApi.updateMember(
            token,
            company.id,
            editing.id,
            adminUpdateCompanyMemberSchema.parse(form),
          )
        : adminCompaniesApi.addMember(
            token,
            company.id,
            adminCreateCompanyMemberSchema.parse(form),
          ),
    onSuccess: publish,
    onError: (cause) =>
      setError(
        cause instanceof ApiError
          ? cause.message
          : cause instanceof Error
            ? cause.message
            : 'Nao foi possivel salvar o acesso.',
      ),
  });
  const active = useMutation({
    mutationFn: (member: Member) =>
      adminCompaniesApi.setMemberActive(token, company.id, member.id, !member.active),
    onSuccess: publish,
    onError: (cause) =>
      setError(cause instanceof ApiError ? cause.message : 'Nao foi possivel alterar o acesso.'),
  });
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => start()}>
        <Plus className="size-4" /> Novo responsavel
      </Button>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {company.teamMembers.map((member) => (
          <div key={member.id} className="rounded-xl border bg-muted/20 p-3">
            <div className="flex justify-between gap-2">
              <div>
                <p className="font-medium">{member.user.name}</p>
                <p className="text-sm text-muted-foreground">{member.user.email}</p>
                <p className="text-xs text-muted-foreground">
                  {member.role === 'OWNER' ? 'Responsavel' : 'Operador'} ·{' '}
                  {member.active ? 'ativo' : 'inativo'}
                </p>
              </div>
              <Button size="icon-sm" variant="ghost" onClick={() => start(member)}>
                <Pencil className="size-4" />
              </Button>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => active.mutate(member)}
                disabled={active.isPending}
              >
                {member.active ? 'Desativar acesso' : 'Reativar acesso'}
              </Button>
              {member.active && (
                <ChangePasswordDialog
                  targetName={member.user.name}
                  targetEmail={member.user.email}
                  changePassword={(password) =>
                    adminCompaniesApi.changeMemberPassword(token, company.id, member.id, {
                      password,
                    })
                  }
                  onChanged={() => undefined}
                >
                  <Button size="sm" variant="outline">
                    <KeyRound className="size-3.5" /> Senha
                  </Button>
                </ChangePasswordDialog>
              )}
            </div>
          </div>
        ))}
      </div>
      {error && !open && <p className="text-sm text-destructive">{error}</p>}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg" closeDisabled={save.isPending}>
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar responsavel' : 'Novo responsavel'}</DialogTitle>
            <DialogDescription>
              O e-mail sera usado para entrar no painel da empresa.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                save.mutate();
              }}
            >
              <div className="space-y-1.5">
                <Label htmlFor="member-name">Nome completo</Label>
                <Input
                  id="member-name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="member-email">E-mail</Label>
                <Input
                  id="member-email"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="member-phone">WhatsApp</Label>
                <Input
                  id="member-phone"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="member-role">Papel</Label>
                <select
                  id="member-role"
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                  value={form.role}
                  onChange={(e) =>
                    setForm({ ...form, role: e.target.value as 'OWNER' | 'OPERATOR' })
                  }
                >
                  <option value="OWNER">Responsavel</option>
                  <option value="OPERATOR">Operador</option>
                </select>
              </div>
              {!editing && (
                <div className="space-y-1.5">
                  <Label htmlFor="member-password">Senha inicial</Label>
                  <Input
                    id="member-password"
                    type="password"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                  />
                </div>
              )}
              {error && <p className="text-sm text-destructive">{error}</p>}
              <div className="flex justify-end">
                <Button type="submit" disabled={save.isPending}>
                  {save.isPending ? 'Salvando...' : 'Salvar acesso'}
                </Button>
              </div>
            </form>
          </DialogBody>
        </DialogContent>
      </Dialog>
    </>
  );
}
