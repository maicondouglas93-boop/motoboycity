'use client';

import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@motoboycity/api-client';
import type { CompanyCustomer, CompanyCustomerAddress } from '@motoboycity/types';
import { companyCustomerInputSchema } from '@motoboycity/validation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { companyCustomersApi } from '@/lib/api-client';
import { formatCustomerAddress, type CustomerRegistrationPrefill } from '@/lib/company-customer';
import {
  GoogleAddressAutocomplete,
  type SelectedGoogleAddress,
} from '@/components/operations/google-address-autocomplete';

interface Props {
  token: string;
  initial?: CompanyCustomer | CustomerRegistrationPrefill;
  onSaved: (customer: CompanyCustomer) => void;
  onCancel: () => void;
}

function addressFromGoogle(address: SelectedGoogleAddress): CompanyCustomerAddress {
  return {
    street: address.street,
    number: address.number,
    complement: null,
    city: address.city,
    state: address.state,
    zip: address.zip,
    lat: address.lat,
    lng: address.lng,
    referenceNote: null,
  };
}

export function CustomerForm({ token, initial, onSaved, onCancel }: Props) {
  const queryClient = useQueryClient();
  const customerId = initial && 'id' in initial ? initial.id : null;
  const [name, setName] = useState(initial?.name ?? '');
  const [cpf, setCpf] = useState(initial?.cpf ?? '');
  const [phone, setPhone] = useState(initial?.phone ?? '');
  const [addressSearch, setAddressSearch] = useState(
    initial ? formatCustomerAddress(initial.address) : '',
  );
  const [address, setAddress] = useState<CompanyCustomerAddress | null>(initial?.address ?? null);
  const [number, setNumber] = useState(initial?.address.number ?? '');
  const [complement, setComplement] = useState(initial?.address.complement ?? '');
  const [referenceNote, setReferenceNote] = useState(initial?.address.referenceNote ?? '');
  const [validationError, setValidationError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (payload: Parameters<typeof companyCustomersApi.create>[1]) =>
      customerId
        ? companyCustomersApi.update(token, customerId, payload)
        : companyCustomersApi.create(token, payload),
    onSuccess: (customer) => {
      void queryClient.invalidateQueries({ queryKey: ['company', 'customers'] });
      onSaved(customer);
    },
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setValidationError(null);
    const result = companyCustomerInputSchema.safeParse({
      name,
      cpf,
      phone,
      address: address
        ? {
            street: address.street,
            number: number || address.number,
            complement: complement || undefined,
            city: address.city,
            state: address.state,
            zip: address.zip,
            lat: address.lat ?? undefined,
            lng: address.lng ?? undefined,
            referenceNote: referenceNote || undefined,
          }
        : undefined,
    });
    if (!result.success) {
      setValidationError(result.error.issues[0]?.message ?? 'Revise os dados do cliente.');
      return;
    }
    mutation.mutate(result.data);
  }

  const requestError = mutation.isError
    ? mutation.error instanceof ApiError
      ? mutation.error.message
      : 'Não foi possível salvar o cliente.'
    : null;

  return (
    <form className="space-y-4" onSubmit={submit} noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="customer-name">Nome completo</Label>
          <Input
            id="customer-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoComplete="name"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="customer-cpf">CPF (opcional)</Label>
          <Input
            id="customer-cpf"
            value={cpf}
            onChange={(event) => setCpf(event.target.value)}
            inputMode="numeric"
            placeholder="000.000.000-00"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="customer-phone">Telefone</Label>
          <Input
            id="customer-phone"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            inputMode="tel"
            autoComplete="tel"
            placeholder="(33) 99999-9999"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Endereço completo</Label>
        <GoogleAddressAutocomplete
          value={addressSearch}
          onValueChange={setAddressSearch}
          onAddressChange={(selected) => {
            const next = selected ? addressFromGoogle(selected) : null;
            setAddress(next);
            setNumber(selected?.number ?? '');
          }}
        />
      </div>

      <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-2">
        <div className="space-y-1.5">
          <Label htmlFor="customer-number">Número</Label>
          <Input id="customer-number" value={number} onChange={(e) => setNumber(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="customer-complement">Complemento</Label>
          <Input
            id="customer-complement"
            value={complement}
            onChange={(e) => setComplement(e.target.value)}
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="customer-reference">Referência</Label>
        <Input
          id="customer-reference"
          value={referenceNote}
          onChange={(e) => setReferenceNote(e.target.value)}
        />
      </div>

      {validationError && (
        <p className="text-sm text-destructive" role="alert">
          {validationError}
        </p>
      )}
      {requestError && (
        <p className="text-sm text-destructive" role="alert">
          {requestError}
        </p>
      )}

      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={mutation.isPending}>
          Cancelar
        </Button>
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending
            ? 'Salvando...'
            : customerId
              ? 'Salvar alterações'
              : 'Cadastrar cliente'}
        </Button>
      </div>
    </form>
  );
}
