'use client';

import { useState, type SubmitEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { CompanyAddressItem, ServiceTypeItem } from '@motoboycity/types';
import { ApiError } from '@motoboycity/api-client';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { deliveriesApi } from '@/lib/api-client';

interface CreateOrderFormProps {
  token: string;
  pickupAddress: CompanyAddressItem;
  serviceTypes: ServiceTypeItem[];
}

export function CreateOrderForm({ token, pickupAddress, serviceTypes }: CreateOrderFormProps) {
  const queryClient = useQueryClient();

  const [serviceTypeId, setServiceTypeId] = useState(serviceTypes[0]?.id ?? '');
  const [street, setStreet] = useState('');
  const [number, setNumber] = useState('');
  const [complement, setComplement] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [zip, setZip] = useState('');

  const [requiresReturn, setRequiresReturn] = useState(false);
  const [pickupSurchargeChargedToDriver, setPickupSurchargeChargedToDriver] = useState(false);
  const [requiresCollectionRecipient, setRequiresCollectionRecipient] = useState(false);
  const [requiresDeliveryProof, setRequiresDeliveryProof] = useState(false);

  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      deliveriesApi.create(token, {
        serviceTypeId,
        dropoffAddress: {
          street,
          number,
          complement: complement || undefined,
          city,
          state,
          zip,
        },
        requiresReturn,
        pickupSurchargeChargedToDriver,
        requiresCollectionRecipient,
        requiresDeliveryProof,
      }),
    onSuccess: (delivery) => {
      setFormError(null);
      const totalValueLabel =
        delivery.totalValue === null
          ? 'a calcular na entrega'
          : delivery.totalValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
      setSuccessMessage(`Pedido #${delivery.displayNumber} criado — total ${totalValueLabel}.`);
      setStreet('');
      setNumber('');
      setComplement('');
      setCity('');
      setState('');
      setZip('');
      setRequiresReturn(false);
      setPickupSurchargeChargedToDriver(false);
      setRequiresCollectionRecipient(false);
      setRequiresDeliveryProof(false);
      void queryClient.invalidateQueries({ queryKey: ['deliveries'] });
    },
    onError: (error) => {
      setSuccessMessage(null);
      setFormError(error instanceof ApiError ? error.message : 'Não foi possível criar o pedido.');
    },
  });

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setSuccessMessage(null);

    if (!serviceTypeId) {
      setFormError('Selecione um tipo de serviço.');
      return;
    }
    if (!street || !number || !city || !state || !zip) {
      setFormError('Preencha o endereço de entrega completo.');
      return;
    }

    mutation.mutate();
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">Coleta no endereço da loja</Label>
        <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
          {pickupAddress.street}, {pickupAddress.number}
          {pickupAddress.complement ? ` - ${pickupAddress.complement}` : ''} — {pickupAddress.city}
          {' - '}
          {pickupAddress.state}
        </p>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <Checkbox
            checked={pickupSurchargeChargedToDriver}
            onCheckedChange={(checked) => setPickupSurchargeChargedToDriver(Boolean(checked))}
          />
          Cobrar sobretaxa da coleta para o entregador
        </label>
      </div>

      {serviceTypes.length > 0 && (
        <div className="space-y-1.5">
          <Label>Tipo de serviço</Label>
          <Select value={serviceTypeId} onValueChange={(value) => setServiceTypeId(value ?? '')}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Selecione" />
            </SelectTrigger>
            <SelectContent>
              {serviceTypes.map((serviceType) => (
                <SelectItem key={serviceType.id} value={serviceType.id}>
                  {serviceType.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <Separator />

      <div className="space-y-1.5">
        <Label htmlFor="dropoff-street">Endereço de entrega</Label>
        <Input
          id="dropoff-street"
          placeholder="Rua"
          value={street}
          onChange={(e) => setStreet(e.target.value)}
        />
      </div>
      <div className="grid grid-cols-[1fr_100px] gap-2">
        <div className="space-y-1.5">
          <Label htmlFor="dropoff-number">Número</Label>
          <Input id="dropoff-number" value={number} onChange={(e) => setNumber(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="dropoff-complement">Complemento</Label>
          <Input
            id="dropoff-complement"
            value={complement}
            onChange={(e) => setComplement(e.target.value)}
          />
        </div>
      </div>
      <div className="grid grid-cols-[1fr_80px] gap-2">
        <div className="space-y-1.5">
          <Label htmlFor="dropoff-city">Cidade</Label>
          <Input id="dropoff-city" value={city} onChange={(e) => setCity(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="dropoff-state">UF</Label>
          <Input
            id="dropoff-state"
            maxLength={2}
            value={state}
            onChange={(e) => setState(e.target.value.toUpperCase())}
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="dropoff-zip">CEP</Label>
        <Input id="dropoff-zip" value={zip} onChange={(e) => setZip(e.target.value)} />
      </div>

      <div className="space-y-2">
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <Checkbox
            checked={requiresReturn}
            onCheckedChange={(checked) => setRequiresReturn(Boolean(checked))}
          />
          Motoboy precisa retornar ao local de coleta
        </label>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <Checkbox
            checked={requiresCollectionRecipient}
            onCheckedChange={(checked) => setRequiresCollectionRecipient(Boolean(checked))}
          />
          Solicitar recebimento na coleta
        </label>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <Checkbox
            checked={requiresDeliveryProof}
            onCheckedChange={(checked) => setRequiresDeliveryProof(Boolean(checked))}
          />
          Exigir comprovante de entrega
        </label>
      </div>

      {formError && <p className="text-sm text-destructive">{formError}</p>}
      {successMessage && <p className="text-sm text-emerald-600">{successMessage}</p>}

      <Button className="w-full" type="submit" disabled={mutation.isPending}>
        {mutation.isPending ? 'Lançando pedido...' : 'Lançar Pedido'}
      </Button>
    </form>
  );
}
