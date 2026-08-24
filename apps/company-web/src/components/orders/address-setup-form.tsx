'use client';

import { useState, type SubmitEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@motoboycity/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  GoogleAddressAutocomplete,
  type SelectedGoogleAddress,
} from '@/components/operations/google-address-autocomplete';
import { companyAddressApi } from '@/lib/api-client';

/**
 * O endereço de coleta precisa de `lat`/`lng`: `complete-return` mede a
 * distância em linha reta entre o motoboy e este ponto para liberar o
 * fechamento do retorno. Antes esta tela enviava só rua/número/cidade/UF/CEP,
 * então a empresa terminava o cadastro com um endereço que parecia completo e
 * o retorno só falhava lá na rua.
 *
 * Por isso o endereço vem obrigatoriamente de uma sugestão do Google, e não de
 * digitação livre — é o que garante o par de coordenadas.
 */
export function AddressSetupForm({ token }: { token: string }) {
  const queryClient = useQueryClient();
  const [addressSearch, setAddressSearch] = useState('');
  const [selected, setSelected] = useState<SelectedGoogleAddress | null>(null);
  const [number, setNumber] = useState('');
  const [complement, setComplement] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (address: SelectedGoogleAddress) =>
      companyAddressApi.upsert(token, {
        street: address.street,
        number: number.trim(),
        complement: complement.trim() || undefined,
        city: address.city,
        state: address.state,
        zip: address.zip,
        lat: address.lat,
        lng: address.lng,
      }),
    onSuccess: () => {
      setFormError(null);
      void queryClient.invalidateQueries({ queryKey: ['company', 'address'] });
    },
    onError: (error) => {
      setFormError(
        error instanceof ApiError ? error.message : 'Não foi possível salvar o endereço.',
      );
    },
  });

  function handleAddressChange(address: SelectedGoogleAddress | null) {
    setSelected(address);
    // O Google costuma omitir o número em endereços brasileiros; quando vem,
    // pré-preenche, e quando não vem o campo fica para a empresa completar.
    if (address) {
      setNumber(address.number);
    }
  }

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    if (!selected) {
      setFormError('Selecione o endereço na lista de sugestões do Google.');
      return;
    }
    if (!number.trim()) {
      setFormError('Informe o número.');
      return;
    }
    if (!selected.city || !selected.state || !selected.zip) {
      setFormError(
        'O endereço selecionado não trouxe cidade, UF ou CEP. Escolha uma sugestão mais específica.',
      );
      return;
    }

    mutation.mutate(selected);
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Cadastre o endereço de coleta da sua loja antes de lançar o primeiro pedido.
      </p>
      <form className="space-y-3" onSubmit={handleSubmit}>
        <div className="space-y-1.5">
          <Label htmlFor="pickup-address">Endereço</Label>
          <GoogleAddressAutocomplete
            value={addressSearch}
            onValueChange={setAddressSearch}
            onAddressChange={handleAddressChange}
          />
          <p className="text-xs text-muted-foreground">
            Selecione uma sugestão da lista. O ponto exato é usado para liberar o fechamento do
            retorno do motoboy.
          </p>
        </div>

        <div className="grid grid-cols-[100px_1fr] gap-2">
          <div className="space-y-1.5">
            <Label htmlFor="pickup-number">Número</Label>
            <Input
              id="pickup-number"
              value={number}
              onChange={(event) => setNumber(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pickup-complement">Complemento</Label>
            <Input
              id="pickup-complement"
              value={complement}
              onChange={(event) => setComplement(event.target.value)}
            />
          </div>
        </div>

        {selected && (
          <dl className="space-y-0.5 rounded-xl border border-portal/15 bg-portal-soft/40 p-3 text-xs text-muted-foreground">
            <div className="flex gap-2">
              <dt>Cidade/UF:</dt>
              <dd className="text-foreground">
                {selected.city}/{selected.state}
              </dd>
            </div>
            <div className="flex gap-2">
              <dt>CEP:</dt>
              <dd className="text-foreground">{selected.zip || '—'}</dd>
            </div>
            <div className="flex gap-2">
              <dt>Coordenadas:</dt>
              <dd className="text-foreground">
                {selected.lat.toFixed(6)}, {selected.lng.toFixed(6)}
              </dd>
            </div>
          </dl>
        )}

        {formError && <p className="text-sm text-destructive">{formError}</p>}

        <Button className="w-full" type="submit" disabled={mutation.isPending || !selected}>
          {mutation.isPending ? 'Salvando...' : 'Salvar endereço de coleta'}
        </Button>
      </form>
    </div>
  );
}
