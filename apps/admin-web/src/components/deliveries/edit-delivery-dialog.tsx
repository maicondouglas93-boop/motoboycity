'use client';

import { useState, type SubmitEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@motoboycity/api-client';
import type { CustomerPaymentMethod, DeliveryDetail } from '@motoboycity/types';
import type { CreateDeliveryPayload } from '@motoboycity/validation';
import { PencilLine } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { adminDeliveriesApi, adminServiceTypesApi } from '@/lib/api-client';

function toLocalDateTime(value: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export function EditDeliveryDialog({
  accessToken,
  delivery,
}: {
  accessToken: string;
  delivery: DeliveryDetail;
}) {
  const queryClient = useQueryClient();
  const dropoff = delivery.addresses.find((address) => address.type === 'DROPOFF');
  const [open, setOpen] = useState(false);
  const [serviceTypeId, setServiceTypeId] = useState(delivery.serviceTypeId);
  const [destinationKnown, setDestinationKnown] = useState(delivery.destinationKnownAtCreation);
  const [scheduledAt, setScheduledAt] = useState(toLocalDateTime(delivery.scheduledAt));
  const [recipientName, setRecipientName] = useState(delivery.recipientName ?? '');
  const [recipientPhone, setRecipientPhone] = useState(delivery.recipientPhone ?? '');
  const [externalOrderNumber, setExternalOrderNumber] = useState(
    delivery.externalOrderNumber ?? '',
  );
  const [customerPaymentMethod, setCustomerPaymentMethod] = useState<CustomerPaymentMethod | ''>(
    delivery.customerPaymentMethod ?? '',
  );
  const [driverNote, setDriverNote] = useState(delivery.driverNote ?? '');
  const [street, setStreet] = useState(dropoff?.street ?? '');
  const [number, setNumber] = useState(dropoff?.number ?? '');
  const [complement, setComplement] = useState(dropoff?.complement ?? '');
  const [city, setCity] = useState(dropoff?.city ?? '');
  const [state, setState] = useState(dropoff?.state ?? '');
  const [zip, setZip] = useState(dropoff?.zip ?? '');
  const [referenceNote, setReferenceNote] = useState(dropoff?.referenceNote ?? '');
  const [requiresReturn, setRequiresReturn] = useState(delivery.requiresReturn);
  const [requiresCollectionRecipient, setRequiresCollectionRecipient] = useState(
    delivery.requiresCollectionRecipient,
  );
  const [requiresDeliveryProof, setRequiresDeliveryProof] = useState(
    delivery.requiresDeliveryProof,
  );
  const [error, setError] = useState<string | null>(null);

  const serviceTypesQuery = useQuery({
    queryKey: ['admin', 'service-types', { active: true }],
    queryFn: () => adminServiceTypesApi.list(accessToken, { active: true }),
    enabled: open,
  });
  const serviceTypes = serviceTypesQuery.data ?? [];
  const serviceTypeItems = Object.fromEntries(
    serviceTypes.map((serviceType) => [serviceType.id, serviceType.name]),
  );
  if (!serviceTypeItems[delivery.serviceTypeId]) {
    serviceTypeItems[delivery.serviceTypeId] = delivery.serviceTypeName;
  }

  const mutation = useMutation({
    mutationFn: (payload: CreateDeliveryPayload) =>
      adminDeliveriesApi.updateBeforeAcceptance(accessToken, delivery.id, payload),
    onSuccess: () => {
      setError(null);
      setOpen(false);
      void queryClient.invalidateQueries({ queryKey: ['admin', 'delivery', delivery.id] });
      void queryClient.invalidateQueries({ queryKey: ['admin', 'deliveries'] });
      void queryClient.invalidateQueries({ queryKey: ['admin', 'operations'] });
    },
    onError: (mutationError) =>
      setError(
        mutationError instanceof ApiError
          ? mutationError.message
          : 'Não foi possível atualizar o pedido.',
      ),
  });

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!serviceTypeId) return setError('Selecione a modalidade.');
    if (destinationKnown && (!street || !number || !city || state.length !== 2 || !zip)) {
      return setError('Preencha o endereço de entrega completo.');
    }

    mutation.mutate({
      serviceTypeId,
      destinationKnownAtCreation: destinationKnown,
      ...(destinationKnown && {
        dropoffAddress: {
          street,
          number,
          complement: complement || undefined,
          city,
          state,
          zip,
          referenceNote: referenceNote || undefined,
        },
      }),
      recipientName: recipientName || undefined,
      recipientPhone: recipientPhone || undefined,
      externalOrderNumber: externalOrderNumber || undefined,
      customerPaymentMethod: customerPaymentMethod || undefined,
      driverNote: driverNote || undefined,
      requiresReturn,
      requiresCollectionRecipient,
      requiresDeliveryProof,
      pickupSurchargeChargedToDriver: delivery.pickupSurchargeChargedToDriver,
      scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : undefined,
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm">
            <PencilLine className="size-4" /> Editar pedido
          </Button>
        }
      />
      <DialogContent className="sm:max-w-3xl" closeDisabled={mutation.isPending}>
        <DialogHeader>
          <DialogTitle>Editar pedido #{delivery.displayNumber}</DialogTitle>
          <DialogDescription>
            Rota e preço serão recalculados. A edição é bloqueada assim que uma oferta estiver
            aguardando resposta ou um motoboy aceitar.
          </DialogDescription>
        </DialogHeader>
        <form className="contents" onSubmit={submit}>
          <DialogBody className="max-h-[70vh] space-y-5 overflow-y-auto">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Modalidade</Label>
                <Select
                  items={serviceTypeItems}
                  value={serviceTypeId}
                  onValueChange={(value) => setServiceTypeId(value ?? '')}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(serviceTypeItems).map(([id, name]) => (
                      <SelectItem key={id} value={id}>
                        {name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-delivery-scheduled">Agendamento</Label>
                <Input
                  id="edit-delivery-scheduled"
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={(event) => setScheduledAt(event.target.value)}
                />
              </div>
            </div>

            <fieldset className="grid gap-2 sm:grid-cols-2">
              <legend className="mb-2 text-sm font-medium">Destino</legend>
              <label className="rounded-xl border p-3 text-sm has-checked:border-primary/60 has-checked:bg-primary/8">
                <input
                  type="radio"
                  name="edit-destination"
                  checked={destinationKnown}
                  onChange={() => setDestinationKnown(true)}
                />
                <span className="ml-2 font-medium">Endereço informado</span>
              </label>
              <label className="rounded-xl border p-3 text-sm has-checked:border-primary/60 has-checked:bg-primary/8">
                <input
                  type="radio"
                  name="edit-destination"
                  checked={!destinationKnown}
                  onChange={() => setDestinationKnown(false)}
                />
                <span className="ml-2 font-medium">Definido pelo GPS</span>
              </label>
            </fieldset>

            {destinationKnown && (
              <div className="space-y-3 rounded-2xl border bg-card/60 p-4">
                <p className="text-sm font-semibold">Endereço de entrega</p>
                <Input
                  placeholder="Rua"
                  value={street}
                  onChange={(event) => setStreet(event.target.value)}
                />
                <div className="grid grid-cols-[110px_1fr] gap-2">
                  <Input
                    placeholder="Número"
                    value={number}
                    onChange={(event) => setNumber(event.target.value)}
                  />
                  <Input
                    placeholder="Complemento"
                    value={complement}
                    onChange={(event) => setComplement(event.target.value)}
                  />
                </div>
                <div className="grid gap-2 sm:grid-cols-[1fr_80px_140px]">
                  <Input
                    placeholder="Cidade"
                    value={city}
                    onChange={(event) => setCity(event.target.value)}
                  />
                  <Input
                    placeholder="UF"
                    maxLength={2}
                    value={state}
                    onChange={(event) => setState(event.target.value.toUpperCase())}
                  />
                  <Input
                    placeholder="CEP"
                    value={zip}
                    onChange={(event) => setZip(event.target.value)}
                  />
                </div>
                <Input
                  placeholder="Ponto de referência"
                  value={referenceNote}
                  onChange={(event) => setReferenceNote(event.target.value)}
                />
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                placeholder="Nome do destinatário"
                value={recipientName}
                onChange={(event) => setRecipientName(event.target.value)}
              />
              <Input
                placeholder="Telefone do destinatário"
                value={recipientPhone}
                onChange={(event) => setRecipientPhone(event.target.value)}
              />
              <Input
                placeholder="Número externo"
                value={externalOrderNumber}
                onChange={(event) => setExternalOrderNumber(event.target.value)}
              />
              <select
                className="h-9 rounded-lg border border-input bg-card/90 px-3 text-sm shadow-sm outline-none"
                value={customerPaymentMethod}
                onChange={(event) =>
                  setCustomerPaymentMethod(event.target.value as CustomerPaymentMethod | '')
                }
              >
                <option value="">Pagamento do cliente</option>
                <option value="PREPAID">Pré-pago</option>
                <option value="CARD">Cartão</option>
                <option value="CASH">Dinheiro</option>
                <option value="PIX">Pix</option>
              </select>
            </div>
            <textarea
              rows={3}
              value={driverNote}
              onChange={(event) => setDriverNote(event.target.value)}
              placeholder="Observação para o motoboy"
              className="w-full rounded-xl border border-input bg-card/90 px-3 py-2 text-sm shadow-sm outline-none"
            />
            <div className="grid gap-2 text-sm sm:grid-cols-3">
              <label className="flex items-center gap-2 rounded-xl border p-3">
                <Checkbox
                  checked={requiresReturn}
                  onCheckedChange={(value) => setRequiresReturn(Boolean(value))}
                />{' '}
                Exige retorno
              </label>
              <label className="flex items-center gap-2 rounded-xl border p-3">
                <Checkbox
                  checked={requiresCollectionRecipient}
                  onCheckedChange={(value) => setRequiresCollectionRecipient(Boolean(value))}
                />{' '}
                Confirmar coleta
              </label>
              <label className="flex items-center gap-2 rounded-xl border p-3">
                <Checkbox
                  checked={requiresDeliveryProof}
                  onCheckedChange={(value) => setRequiresDeliveryProof(Boolean(value))}
                />{' '}
                Exigir comprovante
              </label>
            </div>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
          </DialogBody>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={mutation.isPending}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={mutation.isPending || serviceTypesQuery.isLoading}>
              {mutation.isPending ? 'Recalculando...' : 'Salvar e recalcular'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
