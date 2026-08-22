'use client';

import { useState, type SubmitEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@motoboycity/api-client';
import type {
  CompanyAddressItem,
  CreateDeliveryPayload,
  CustomerPaymentMethod,
  ServiceTypeItem,
} from '@motoboycity/types';
import { Minus, Plus } from 'lucide-react';
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
import { deliveriesApi } from '@/lib/api-client';
import {
  GoogleAddressAutocomplete,
  type SelectedGoogleAddress,
} from './google-address-autocomplete';

interface DeliveryDraft {
  key: string;
  recipientName: string;
  recipientPhone: string;
  externalOrderNumber: string;
  customerPaymentMethod: CustomerPaymentMethod | '';
  driverNote: string;
  addressSearch: string;
  address: SelectedGoogleAddress | null;
  number: string;
  complement: string;
  referenceNote: string;
}

interface Props {
  token: string;
  pickupAddress: CompanyAddressItem;
  serviceTypes: ServiceTypeItem[];
}

function emptyDraft(): DeliveryDraft {
  return {
    key: crypto.randomUUID(),
    recipientName: '',
    recipientPhone: '',
    externalOrderNumber: '',
    customerPaymentMethod: '',
    driverNote: '',
    addressSearch: '',
    address: null,
    number: '',
    complement: '',
    referenceNote: '',
  };
}

export function OperationalOrderForm({ token, pickupAddress, serviceTypes }: Props) {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<'single' | 'batch'>('single');
  const [serviceTypeId, setServiceTypeId] = useState('');
  const [destinationKnown, setDestinationKnown] = useState(true);
  const [requiresReturn, setRequiresReturn] = useState(false);
  const [drafts, setDrafts] = useState<DeliveryDraft[]>([emptyDraft()]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const selectedServiceTypeId = serviceTypeId || serviceTypes[0]?.id || '';

  function updateDraft(index: number, patch: Partial<DeliveryDraft>) {
    setDrafts((current) =>
      current.map((draft, draftIndex) => (draftIndex === index ? { ...draft, ...patch } : draft)),
    );
  }

  function payloadFor(draft: DeliveryDraft): CreateDeliveryPayload {
    return {
      serviceTypeId: selectedServiceTypeId,
      destinationKnownAtCreation: destinationKnown,
      recipientName: draft.recipientName || undefined,
      recipientPhone: draft.recipientPhone || undefined,
      externalOrderNumber: draft.externalOrderNumber || undefined,
      customerPaymentMethod: draft.customerPaymentMethod || undefined,
      driverNote: draft.driverNote || undefined,
      requiresReturn,
      ...(destinationKnown && draft.address
        ? {
            dropoffAddress: {
              street: draft.address.street,
              number: draft.number || draft.address.number,
              complement: draft.complement || undefined,
              city: draft.address.city,
              state: draft.address.state,
              zip: draft.address.zip,
              referenceNote: draft.referenceNote || undefined,
              lat: draft.address.lat,
              lng: draft.address.lng,
            },
          }
        : {}),
    };
  }

  const mutation = useMutation({
    mutationFn: async () =>
      mode === 'batch'
        ? deliveriesApi.createBatch(token, { deliveries: drafts.map(payloadFor) })
        : deliveriesApi.create(token, payloadFor(drafts[0]!)),
    onSuccess: (result) => {
      const count = 'deliveries' in result ? result.deliveries.length : 1;
      setMessage(count === 1 ? 'Pedido criado e enviado ao despacho.' : `${count} pedidos criados.`);
      setError(null);
      setDrafts(mode === 'batch' ? [emptyDraft(), emptyDraft()] : [emptyDraft()]);
      void queryClient.invalidateQueries({ queryKey: ['deliveries'] });
      void queryClient.invalidateQueries({ queryKey: ['company', 'operations'] });
    },
    onError: (mutationError) => {
      setMessage(null);
      setError(
        mutationError instanceof ApiError
          ? mutationError.message
          : 'Não foi possível criar o pedido.',
      );
    },
  });

  function changeMode(nextMode: 'single' | 'batch') {
    setMode(nextMode);
    setDrafts((current) =>
      nextMode === 'batch'
        ? current.length >= 2
          ? current
          : [...current, emptyDraft()]
        : [current[0] ?? emptyDraft()],
    );
  }

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    if (!selectedServiceTypeId) return setError('Selecione uma modalidade.');
    if (mode === 'batch' && (drafts.length < 2 || drafts.length > 50)) {
      return setError('O lote precisa ter entre 2 e 50 entregas.');
    }
    if (
      destinationKnown &&
      drafts.some(
        (draft) =>
          !draft.address ||
          !draft.address.street ||
          !(draft.number || draft.address.number) ||
          !draft.address.city ||
          !draft.address.state ||
          !draft.address.zip,
      )
    ) {
      return setError('Selecione no Google um endereço completo para cada destino.');
    }
    mutation.mutate();
  }

  return (
    <form className="space-y-4" onSubmit={submit}>
      <div className="grid grid-cols-2 gap-2">
        <Button type="button" variant={mode === 'single' ? 'default' : 'outline'} onClick={() => changeMode('single')}>
          Pedido avulso
        </Button>
        <Button type="button" variant={mode === 'batch' ? 'default' : 'outline'} onClick={() => changeMode('batch')}>
          Lote
        </Button>
      </div>

      <div className="rounded-lg border bg-muted/30 p-3 text-xs">
        <span className="font-medium">Coleta:</span> {pickupAddress.street}, {pickupAddress.number} ·{' '}
        {pickupAddress.city}/{pickupAddress.state}
      </div>

      <div className="space-y-1.5">
        <Label>Modalidade</Label>
        <Select value={selectedServiceTypeId} onValueChange={(value) => setServiceTypeId(value ?? '')}>
          <SelectTrigger className="w-full"><SelectValue placeholder="Selecione" /></SelectTrigger>
          <SelectContent>
            {serviceTypes.map((serviceType) => (
              <SelectItem key={serviceType.id} value={serviceType.id}>{serviceType.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <fieldset className="grid grid-cols-2 gap-2 text-sm">
        <label className="rounded-lg border p-3 has-checked:border-primary has-checked:bg-primary/5">
          <input type="radio" name="destination" checked={destinationKnown} onChange={() => setDestinationKnown(true)} />
          <span className="ml-2 font-medium">Destino conhecido</span>
        </label>
        <label className="rounded-lg border p-3 has-checked:border-primary has-checked:bg-primary/5">
          <input type="radio" name="destination" checked={!destinationKnown} onChange={() => setDestinationKnown(false)} />
          <span className="ml-2 font-medium">Definir pelo GPS</span>
        </label>
      </fieldset>

      <label className="flex items-center gap-2 text-sm">
        <Checkbox checked={requiresReturn} onCheckedChange={(checked) => setRequiresReturn(Boolean(checked))} />
        Exige retorno à coleta
      </label>

      <div className="space-y-3">
        {drafts.map((draft, index) => (
          <section key={draft.key} className="space-y-3 rounded-xl border p-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">Entrega {index + 1}</p>
              {mode === 'batch' && drafts.length > 2 && (
                <Button type="button" size="icon" variant="ghost" onClick={() => setDrafts((items) => items.filter((_, itemIndex) => itemIndex !== index))}>
                  <Minus className="size-4" />
                </Button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Input placeholder="Destinatário" value={draft.recipientName} onChange={(event) => updateDraft(index, { recipientName: event.target.value })} />
              <Input placeholder="Telefone" value={draft.recipientPhone} onChange={(event) => updateDraft(index, { recipientPhone: event.target.value })} />
              <Input placeholder="Nº externo" value={draft.externalOrderNumber} onChange={(event) => updateDraft(index, { externalOrderNumber: event.target.value })} />
              <select className="h-9 rounded-md border bg-background px-3 text-sm" value={draft.customerPaymentMethod} onChange={(event) => updateDraft(index, { customerPaymentMethod: event.target.value as CustomerPaymentMethod | '' })}>
                <option value="">Pagamento</option>
                <option value="PREPAID">Pré-pago</option>
                <option value="CARD">Cartão</option>
                <option value="CASH">Dinheiro</option>
                <option value="PIX">Pix</option>
              </select>
            </div>
            {destinationKnown && (
              <>
                <GoogleAddressAutocomplete
                  value={draft.addressSearch}
                  onValueChange={(addressSearch) => updateDraft(index, { addressSearch })}
                  onAddressChange={(address) => updateDraft(index, { address, number: address?.number ?? '' })}
                />
                <div className="grid grid-cols-[100px_1fr] gap-2">
                  <Input placeholder="Número" value={draft.number} onChange={(event) => updateDraft(index, { number: event.target.value })} />
                  <Input placeholder="Complemento" value={draft.complement} onChange={(event) => updateDraft(index, { complement: event.target.value })} />
                </div>
                <Input placeholder="Referência" value={draft.referenceNote} onChange={(event) => updateDraft(index, { referenceNote: event.target.value })} />
              </>
            )}
            <Input placeholder="Observação ao motoboy" value={draft.driverNote} onChange={(event) => updateDraft(index, { driverNote: event.target.value })} />
          </section>
        ))}
      </div>

      {mode === 'batch' && drafts.length < 50 && (
        <Button type="button" variant="outline" className="w-full" onClick={() => setDrafts((items) => [...items, emptyDraft()])}>
          <Plus className="mr-2 size-4" /> Adicionar entrega
        </Button>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
      {message && <p className="text-sm text-status-entregue">{message}</p>}
      <Button type="submit" className="w-full" disabled={mutation.isPending}>
        {mutation.isPending ? 'Criando...' : mode === 'batch' ? `Criar lote (${drafts.length})` : 'Criar pedido'}
      </Button>
    </form>
  );
}
