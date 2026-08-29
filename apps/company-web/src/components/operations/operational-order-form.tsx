'use client';

import { useRef, useState, type SubmitEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@motoboycity/api-client';
import type {
  CompanyAddressItem,
  CreateDeliveryPayload,
  CustomerPaymentMethod,
  ServiceTypeItem,
} from '@motoboycity/types';
import { Copy, Minus, Plus, X } from 'lucide-react';
import { CustomerAutocomplete } from '@/components/customers/customer-autocomplete';
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
import { companyCustomersApi, deliveriesApi } from '@/lib/api-client';
import {
  buildCustomerRegistrationCandidates,
  customerToDeliveryFields,
  type CustomerRegistrationPrefill,
} from '@/lib/company-customer';
import { idempotencyAttemptFor, type IdempotencyAttempt } from '@/lib/idempotency';
import type { CloneSeed } from './clone-delivery';
import {
  GoogleAddressAutocomplete,
  type SelectedGoogleAddress,
} from './google-address-autocomplete';

interface DeliveryDraft {
  key: string;
  customerId: string | null;
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
  /**
   * Preenchimento vindo de "clonar pedido".
   *
   * A tela remonta o formulario a cada clonagem (`key` no componente), entao
   * isto e lido uma unica vez, na montagem — sem efeito reagindo a prop, que
   * geraria render em cascata.
   */
  clone?: { seed: CloneSeed; displayNumber: number } | null;
  onUnregisteredCustomers?: (customers: CustomerRegistrationPrefill[]) => void;
}

function draftFromSeed(seed: CloneSeed): DeliveryDraft {
  return {
    key: crypto.randomUUID(),
    customerId: null,
    recipientName: seed.recipientName,
    recipientPhone: seed.recipientPhone,
    // Numero externo nao vem no clone: ele identifica UM pedido no sistema da
    // propria loja, e e por ele que a conciliacao acontece depois.
    externalOrderNumber: '',
    customerPaymentMethod: seed.customerPaymentMethod,
    driverNote: seed.driverNote,
    addressSearch: seed.addressSearch,
    address: seed.address,
    number: seed.number,
    complement: seed.complement,
    referenceNote: seed.referenceNote,
  };
}

function emptyDraft(): DeliveryDraft {
  return {
    key: crypto.randomUUID(),
    customerId: null,
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

export function OperationalOrderForm({
  token,
  pickupAddress,
  serviceTypes,
  clone,
  onUnregisteredCustomers,
}: Props) {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<'single' | 'batch'>('single');
  const [serviceTypeId, setServiceTypeId] = useState(clone?.seed.serviceTypeId ?? '');
  const [destinationKnown, setDestinationKnown] = useState(clone?.seed.destinationKnown ?? true);
  const [requiresReturn, setRequiresReturn] = useState(clone?.seed.requiresReturn ?? false);
  const [drafts, setDrafts] = useState<DeliveryDraft[]>(() => [
    clone ? draftFromSeed(clone.seed) : emptyDraft(),
  ]);
  /**
   * A faixa de "clonado de" e estado proprio, e nao a prop: ela some depois de
   * criar o pedido, senao continuaria dizendo que o formulario e uma copia
   * quando ja esta vazio.
   */
  const [clonedFrom, setClonedFrom] = useState<number | null>(clone?.displayNumber ?? null);
  const [cloneWarnings, setCloneWarnings] = useState<string[]>(clone?.seed.warnings ?? []);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const creationAttempt = useRef<IdempotencyAttempt | null>(null);

  function discardClone() {
    setClonedFrom(null);
    setCloneWarnings([]);
    setServiceTypeId('');
    setDestinationKnown(true);
    setRequiresReturn(false);
    setDrafts([emptyDraft()]);
  }
  const selectedServiceTypeId = serviceTypeId || serviceTypes[0]?.id || '';
  /**
   * `items` mapeia id para nome.
   *
   * Sem ele o Base UI mostra o VALOR do item selecionado no gatilho, e como o
   * valor aqui e o id da modalidade, a tela exibia um UUID cru no lugar do
   * nome. E o proprio contrato do componente: "When specified, <Select.Value>
   * renders the label of the selected item instead of the raw value."
   */
  const serviceTypeLabels = Object.fromEntries(
    serviceTypes.map((serviceType) => [serviceType.id, serviceType.name]),
  );

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

  async function identifyUnregisteredCustomers(submittedDrafts: DeliveryDraft[]) {
    const candidates = buildCustomerRegistrationCandidates(submittedDrafts);

    const missing: CustomerRegistrationPrefill[] = [];
    for (const candidate of candidates) {
      try {
        const match = await companyCustomersApi.match(token, { phone: candidate.phone });
        if (!match.customer) missing.push(candidate);
      } catch {
        // A entrega ja foi criada. Se a verificacao falhar por rede, ainda e
        // seguro oferecer o cadastro: a API impedira eventual duplicidade.
        missing.push(candidate);
      }
    }
    onUnregisteredCustomers?.(missing);
  }

  const mutation = useMutation({
    mutationFn: async () => {
      const request =
        mode === 'batch'
          ? { kind: 'batch' as const, deliveries: drafts.map(payloadFor) }
          : { kind: 'single' as const, delivery: payloadFor(drafts[0]!) };
      const attempt = idempotencyAttemptFor(creationAttempt.current, request);
      creationAttempt.current = attempt;

      const result =
        request.kind === 'batch'
          ? await deliveriesApi.createBatch(token, {
              idempotencyKey: attempt.key,
              deliveries: request.deliveries,
            })
          : await deliveriesApi.create(token, {
              ...request.delivery,
              idempotencyKey: attempt.key,
            });
      return { result, submittedDrafts: drafts };
    },
    onSuccess: ({ result, submittedDrafts }) => {
      creationAttempt.current = null;
      const count = 'deliveries' in result ? result.deliveries.length : 1;
      setMessage(
        count === 1 ? 'Pedido criado e enviado ao despacho.' : `${count} pedidos criados.`,
      );
      setError(null);
      setDrafts(mode === 'batch' ? [emptyDraft(), emptyDraft()] : [emptyDraft()]);
      setClonedFrom(null);
      setCloneWarnings([]);
      void queryClient.invalidateQueries({ queryKey: ['deliveries'] });
      void queryClient.invalidateQueries({ queryKey: ['company', 'operations'] });
      void identifyUnregisteredCustomers(submittedDrafts);
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
    creationAttempt.current = null;
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
    const incompleto = (draft: DeliveryDraft) =>
      !draft.address ||
      !draft.address.street ||
      !(draft.number || draft.address.number) ||
      !draft.address.city ||
      !draft.address.state ||
      !draft.address.zip;

    if (destinationKnown && drafts.some(incompleto)) {
      /**
       * Diz QUAL e o problema quando ele vem do cadastro.
       *
       * O endereco salvo de um cliente pode estar sem coordenada — o contrato
       * aceita, mesmo que o painel sempre mande o ponto do Places. Nesse caso o
       * cliente escolhido preenchia nome e telefone, o endereco chegava vazio, e
       * a pessoa lia "selecione no Google um endereco completo" sem entender por
       * que o cliente que ela acabou de escolher nao servia. Salvar o endereco de
       * novo pelo cadastro resolve de vez, porque a API passou a geocodificar.
       */
      const veioDeClienteSalvo = drafts.some((draft) => incompleto(draft) && draft.customerId);
      return setError(
        veioDeClienteSalvo
          ? 'O endereço salvo deste cliente está sem localização. Selecione o endereço no Google aqui, ou abra o cliente e salve o endereço novamente para corrigir de vez.'
          : 'Selecione no Google um endereço completo para cada destino.',
      );
    }
    mutation.mutate();
  }

  return (
    <form className="space-y-4" onSubmit={submit}>
      <div className="grid grid-cols-2 gap-2">
        <Button
          type="button"
          variant={mode === 'single' ? 'default' : 'outline'}
          onClick={() => changeMode('single')}
        >
          Pedido avulso
        </Button>
        <Button
          type="button"
          variant={mode === 'batch' ? 'default' : 'outline'}
          onClick={() => changeMode('batch')}
        >
          Lote
        </Button>
      </div>

      {clonedFrom !== null && (
        <div className="rounded-xl border border-colete/40 bg-gradient-to-r from-colete/14 to-colete/5 p-3 text-xs shadow-sm">
          <div className="flex items-start justify-between gap-2">
            <p className="flex items-center gap-1.5 font-medium">
              <Copy className="size-3.5" aria-hidden="true" />
              Clonado do pedido #{clonedFrom}
            </p>
            <button
              type="button"
              onClick={discardClone}
              className="text-muted-foreground hover:text-foreground"
              aria-label="Descartar a copia e comecar em branco"
            >
              <X className="size-3.5" />
            </button>
          </div>
          {cloneWarnings.length > 0 && (
            <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-muted-foreground">
              {cloneWarnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="rounded-xl border border-portal/15 bg-portal-soft/40 p-3 text-xs">
        <span className="font-medium">Coleta:</span> {pickupAddress.street}, {pickupAddress.number}{' '}
        · {pickupAddress.city}/{pickupAddress.state}
      </div>

      <div className="space-y-1.5">
        <Label>Modalidade</Label>
        <Select
          items={serviceTypeLabels}
          value={selectedServiceTypeId}
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

      <fieldset className="grid grid-cols-2 gap-2 text-sm">
        <label className="rounded-xl border border-border/80 bg-card/65 p-3 transition-all has-checked:border-primary/60 has-checked:bg-primary/10 has-checked:shadow-sm">
          <input
            type="radio"
            name="destination"
            checked={destinationKnown}
            onChange={() => setDestinationKnown(true)}
          />
          <span className="ml-2 font-medium">Destino conhecido</span>
        </label>
        <label className="rounded-xl border border-border/80 bg-card/65 p-3 transition-all has-checked:border-primary/60 has-checked:bg-primary/10 has-checked:shadow-sm">
          <input
            type="radio"
            name="destination"
            checked={!destinationKnown}
            onChange={() => setDestinationKnown(false)}
          />
          <span className="ml-2 font-medium">Definir pelo GPS</span>
        </label>
      </fieldset>

      <label className="flex items-center gap-2 text-sm">
        <Checkbox
          checked={requiresReturn}
          onCheckedChange={(checked) => setRequiresReturn(Boolean(checked))}
        />
        Exige retorno à coleta
      </label>

      <div className="space-y-3">
        {drafts.map((draft, index) => (
          <section
            key={draft.key}
            className="space-y-3 rounded-2xl border border-portal/15 bg-card/65 p-3 shadow-sm"
          >
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">Entrega {index + 1}</p>
              {mode === 'batch' && drafts.length > 2 && (
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  onClick={() =>
                    setDrafts((items) => items.filter((_, itemIndex) => itemIndex !== index))
                  }
                >
                  <Minus className="size-4" />
                </Button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="col-span-2">
                <CustomerAutocomplete
                  token={token}
                  selectedName={draft.customerId ? draft.recipientName : undefined}
                  onClear={() => updateDraft(index, { customerId: null })}
                  onSelect={(customer, address) =>
                    updateDraft(index, customerToDeliveryFields(customer, address))
                  }
                />
              </div>
              <Input
                placeholder="Destinatário"
                value={draft.recipientName}
                onChange={(event) =>
                  updateDraft(index, { recipientName: event.target.value, customerId: null })
                }
              />
              <Input
                placeholder="Telefone"
                value={draft.recipientPhone}
                onChange={(event) =>
                  updateDraft(index, { recipientPhone: event.target.value, customerId: null })
                }
              />
              <Input
                placeholder="Nº externo"
                value={draft.externalOrderNumber}
                onChange={(event) =>
                  updateDraft(index, { externalOrderNumber: event.target.value })
                }
              />
              <select
                className="h-9 rounded-lg border border-input bg-card/90 px-3 text-sm shadow-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/15"
                value={draft.customerPaymentMethod}
                onChange={(event) =>
                  updateDraft(index, {
                    customerPaymentMethod: event.target.value as CustomerPaymentMethod | '',
                  })
                }
              >
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
                  onAddressChange={(address) =>
                    updateDraft(index, { address, number: address?.number ?? '' })
                  }
                />
                <div className="grid grid-cols-[100px_1fr] gap-2">
                  <Input
                    placeholder="Número"
                    value={draft.number}
                    onChange={(event) => updateDraft(index, { number: event.target.value })}
                  />
                  <Input
                    placeholder="Complemento"
                    value={draft.complement}
                    onChange={(event) => updateDraft(index, { complement: event.target.value })}
                  />
                </div>
                <Input
                  placeholder="Referência"
                  value={draft.referenceNote}
                  onChange={(event) => updateDraft(index, { referenceNote: event.target.value })}
                />
              </>
            )}
            <Input
              placeholder="Observação ao motoboy"
              value={draft.driverNote}
              onChange={(event) => updateDraft(index, { driverNote: event.target.value })}
            />
          </section>
        ))}
      </div>

      {mode === 'batch' && drafts.length < 50 && (
        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={() => setDrafts((items) => [...items, emptyDraft()])}
        >
          <Plus className="mr-2 size-4" /> Adicionar entrega
        </Button>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
      {message && <p className="text-sm text-status-entregue">{message}</p>}
      <Button type="submit" className="w-full" disabled={mutation.isPending}>
        {mutation.isPending
          ? 'Criando...'
          : mode === 'batch'
            ? `Criar lote (${drafts.length})`
            : 'Criar pedido'}
      </Button>
    </form>
  );
}
