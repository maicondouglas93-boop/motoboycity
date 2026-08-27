'use client';

import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@motoboycity/api-client';
import type { CompanyCustomerAddress, CompanyCustomerSavedAddress } from '@motoboycity/types';
import { companyCustomerSavedAddressSchema } from '@motoboycity/validation';
import {
  GoogleAddressAutocomplete,
  type SelectedGoogleAddress,
} from '@/components/operations/google-address-autocomplete';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { companyCustomersApi } from '@/lib/api-client';
import { formatCustomerAddress } from '@/lib/company-customer';

interface Props {
  token: string;
  customerId: string;
  initial?: CompanyCustomerSavedAddress;
  onSaved: (address: CompanyCustomerSavedAddress) => void;
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

export function CustomerAddressForm({ token, customerId, initial, onSaved, onCancel }: Props) {
  const queryClient = useQueryClient();
  const [label, setLabel] = useState(initial?.label ?? 'Casa');
  const [addressSearch, setAddressSearch] = useState(initial ? formatCustomerAddress(initial) : '');
  const [address, setAddress] = useState<CompanyCustomerAddress | null>(initial ?? null);
  const [number, setNumber] = useState(initial?.number ?? '');
  const [complement, setComplement] = useState(initial?.complement ?? '');
  const [referenceNote, setReferenceNote] = useState(initial?.referenceNote ?? '');
  const [validationError, setValidationError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (payload: Parameters<typeof companyCustomersApi.createAddress>[2]) =>
      initial
        ? companyCustomersApi.updateAddress(token, customerId, initial.id, payload)
        : companyCustomersApi.createAddress(token, customerId, payload),
    onSuccess: (saved) => {
      void queryClient.invalidateQueries({ queryKey: ['company', 'customers'] });
      onSaved(saved);
    },
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setValidationError(null);
    const result = companyCustomerSavedAddressSchema.safeParse({
      label,
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
      setValidationError(result.error.issues[0]?.message ?? 'Revise o endereço.');
      return;
    }
    mutation.mutate(result.data);
  }

  const requestError = mutation.isError
    ? mutation.error instanceof ApiError
      ? mutation.error.message
      : 'Não foi possível salvar o endereço.'
    : null;

  return (
    <form className="space-y-4" onSubmit={submit} noValidate>
      <div className="space-y-1.5">
        <Label htmlFor="saved-address-label">Nome do endereço</Label>
        <Input
          id="saved-address-label"
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          placeholder="Casa, Trabalho, Loja..."
        />
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
          <Label htmlFor="saved-address-number">Número</Label>
          <Input
            id="saved-address-number"
            value={number}
            onChange={(event) => setNumber(event.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="saved-address-complement">Complemento</Label>
          <Input
            id="saved-address-complement"
            value={complement}
            onChange={(event) => setComplement(event.target.value)}
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="saved-address-reference">Referência</Label>
        <Input
          id="saved-address-reference"
          value={referenceNote}
          onChange={(event) => setReferenceNote(event.target.value)}
        />
      </div>
      {(validationError || requestError) && (
        <p className="text-sm text-destructive" role="alert">
          {validationError ?? requestError}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={mutation.isPending}>
          Cancelar
        </Button>
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? 'Salvando...' : 'Salvar endereço'}
        </Button>
      </div>
    </form>
  );
}
