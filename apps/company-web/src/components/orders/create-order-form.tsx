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
  // Modo do destino. `true` (padrão) é o comportamento de sempre: endereço agora, preço
  // congelado na criação. `false` deixa o destino em aberto — quem define é a posição do
  // motoboy ao marcar entregue, e só então distância e valor existem.
  //
  // Mantido como padrão para não mudar, sem aviso, o que a empresa já conhece.
  const [destinationKnownAtCreation, setDestinationKnownAtCreation] = useState(true);
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
        destinationKnownAtCreation,
        // Sem destino conhecido o endereço não pode ir NEM VAZIO: o contrato recusa o
        // pedido se `dropoffAddress` vier junto de `destinationKnownAtCreation: false`
        // (create-delivery.schema.ts), justamente para não existir pedido meio definido.
        ...(destinationKnownAtCreation && {
          dropoffAddress: {
            street,
            number,
            complement: complement || undefined,
            city,
            state,
            zip,
          },
        }),
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
    if (destinationKnownAtCreation && (!street || !number || !city || !state || !zip)) {
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
          <Select
            items={Object.fromEntries(serviceTypes.map((item) => [item.id, item.name]))}
            value={serviceTypeId}
            onValueChange={(value) => setServiceTypeId(value ?? '')}
          >
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

      {/* O modo do destino muda o que a empresa vê e quando o valor existe, então precisa
          ser uma escolha explícita — e o rótulo diz a consequência (o valor sai só na
          entrega), não o nome técnico do campo. */}
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Destino</legend>
        <label className="flex cursor-pointer items-start gap-2 rounded-md border p-3 text-sm has-checked:border-primary has-checked:bg-primary/5">
          <input
            type="radio"
            name="destination-mode"
            className="mt-0.5"
            checked={destinationKnownAtCreation}
            onChange={() => setDestinationKnownAtCreation(true)}
          />
          <span>
            <span className="block font-medium">Sei o endereço agora</span>
            <span className="block text-xs text-muted-foreground">
              O valor do pedido é calculado e travado na criação.
            </span>
          </span>
        </label>
        <label className="flex cursor-pointer items-start gap-2 rounded-md border p-3 text-sm has-checked:border-primary has-checked:bg-primary/5">
          <input
            type="radio"
            name="destination-mode"
            className="mt-0.5"
            checked={!destinationKnownAtCreation}
            onChange={() => setDestinationKnownAtCreation(false)}
          />
          <span>
            <span className="block font-medium">O motoboy informa na entrega</span>
            <span className="block text-xs text-muted-foreground">
              Para quando o cliente ainda não passou o endereço. A distância e o valor saem da
              localização do motoboy no momento da entrega — o pedido fica sem valor até lá.
            </span>
          </span>
        </label>
      </fieldset>

      {!destinationKnownAtCreation && (
        <p className="rounded-md border border-dashed bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          Este pedido será criado sem endereço de entrega e sem valor. Os dois passam a existir
          quando o motoboy marcar a entrega como concluída.
        </p>
      )}

      {destinationKnownAtCreation && (
        <>
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
              <Input
                id="dropoff-number"
                value={number}
                onChange={(e) => setNumber(e.target.value)}
              />
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
        </>
      )}

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
      {successMessage && <p className="text-sm text-status-entregue">{successMessage}</p>}

      <Button className="w-full" type="submit" disabled={mutation.isPending}>
        {mutation.isPending ? 'Lançando pedido...' : 'Lançar Pedido'}
      </Button>
    </form>
  );
}
