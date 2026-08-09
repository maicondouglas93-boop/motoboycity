'use client';

import { useState, type SubmitEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@motoboycity/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { companyAddressApi } from '@/lib/api-client';

export function AddressSetupForm({ token }: { token: string }) {
  const queryClient = useQueryClient();
  const [street, setStreet] = useState('');
  const [number, setNumber] = useState('');
  const [complement, setComplement] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [zip, setZip] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      companyAddressApi.upsert(token, {
        street,
        number,
        complement: complement || undefined,
        city,
        state,
        zip,
      }),
    onSuccess: () => {
      setFormError(null);
      void queryClient.invalidateQueries({ queryKey: ['company', 'address'] });
    },
    onError: (error) => {
      setFormError(error instanceof ApiError ? error.message : 'Não foi possível salvar o endereço.');
    },
  });

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    mutation.mutate();
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Cadastre o endereço de coleta da sua loja antes de lançar o primeiro pedido.
      </p>
      <form className="space-y-3" onSubmit={handleSubmit}>
        <div className="grid grid-cols-[1fr_100px] gap-2">
          <div className="space-y-1.5">
            <Label htmlFor="pickup-street">Rua</Label>
            <Input id="pickup-street" value={street} onChange={(e) => setStreet(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pickup-number">Número</Label>
            <Input id="pickup-number" value={number} onChange={(e) => setNumber(e.target.value)} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pickup-complement">Complemento</Label>
          <Input
            id="pickup-complement"
            value={complement}
            onChange={(e) => setComplement(e.target.value)}
          />
        </div>
        <div className="grid grid-cols-[1fr_80px] gap-2">
          <div className="space-y-1.5">
            <Label htmlFor="pickup-city">Cidade</Label>
            <Input id="pickup-city" value={city} onChange={(e) => setCity(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pickup-state">UF</Label>
            <Input
              id="pickup-state"
              maxLength={2}
              value={state}
              onChange={(e) => setState(e.target.value.toUpperCase())}
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pickup-zip">CEP</Label>
          <Input id="pickup-zip" value={zip} onChange={(e) => setZip(e.target.value)} />
        </div>

        {formError && <p className="text-sm text-destructive">{formError}</p>}

        <Button className="w-full" type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? 'Salvando...' : 'Salvar endereço de coleta'}
        </Button>
      </form>
    </div>
  );
}
