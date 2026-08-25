'use client';

import { useRef, useState, type SubmitEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@motoboycity/api-client';
import type { AdminCompanyListItem, CustomerPaymentMethod } from '@motoboycity/types';
import type { CreateDeliveryPayload } from '@motoboycity/validation';
import { Building2, CalendarClock, MapPin, PackagePlus } from 'lucide-react';
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
import { Separator } from '@/components/ui/separator';
import { ActionFeedback } from '@/components/ui/action-feedback';
import { PendingButtonLabel } from '@/components/ui/pending-button-label';
import { adminCompaniesApi, adminDeliveriesApi, adminServiceTypesApi } from '@/lib/api-client';

interface Props {
  accessToken: string;
  companies: AdminCompanyListItem[];
  children: React.ReactNode;
}

interface IdempotencyAttempt {
  fingerprint: string;
  key: string;
}

export function CreateCompanyDeliveryDialog({ accessToken, companies, children }: Props) {
  const queryClient = useQueryClient();
  const attemptRef = useRef<IdempotencyAttempt | null>(null);
  const [open, setOpen] = useState(false);
  const [companyId, setCompanyId] = useState('');
  const [serviceTypeId, setServiceTypeId] = useState('');
  const [destinationKnown, setDestinationKnown] = useState(true);
  const [scheduledAt, setScheduledAt] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [recipientPhone, setRecipientPhone] = useState('');
  const [externalOrderNumber, setExternalOrderNumber] = useState('');
  const [customerPaymentMethod, setCustomerPaymentMethod] = useState<CustomerPaymentMethod | ''>(
    '',
  );
  const [driverNote, setDriverNote] = useState('');
  const [street, setStreet] = useState('');
  const [number, setNumber] = useState('');
  const [complement, setComplement] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [zip, setZip] = useState('');
  const [referenceNote, setReferenceNote] = useState('');
  const [requiresReturn, setRequiresReturn] = useState(false);
  const [requiresCollectionRecipient, setRequiresCollectionRecipient] = useState(false);
  const [requiresDeliveryProof, setRequiresDeliveryProof] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const activeCompanies = companies.filter((company) => company.status === 'ACTIVE');
  const companyLabels = Object.fromEntries(
    companies.map((company) => [
      company.id,
      `${company.tradeName}${company.status === 'ACTIVE' ? '' : ' (indisponível)'}`,
    ]),
  );

  const companyQuery = useQuery({
    queryKey: ['admin', 'companies', companyId],
    queryFn: () => adminCompaniesApi.detail(accessToken, companyId),
    enabled: open && Boolean(companyId),
  });
  const serviceTypesQuery = useQuery({
    queryKey: ['admin', 'service-types', { active: true }],
    queryFn: () => adminServiceTypesApi.list(accessToken, { active: true }),
    enabled: open,
  });

  const serviceTypes = serviceTypesQuery.data ?? [];
  const selectedServiceTypeId = serviceTypeId || serviceTypes[0]?.id || '';
  const serviceTypeLabels = Object.fromEntries(
    serviceTypes.map((serviceType) => [serviceType.id, serviceType.name]),
  );
  const pickupAddress = companyQuery.data?.addresses.find((address) => address.isPrimary) ?? null;

  const mutation = useMutation({
    mutationFn: ({
      targetCompanyId,
      payload,
    }: {
      targetCompanyId: string;
      payload: CreateDeliveryPayload;
    }) => adminDeliveriesApi.createForCompany(accessToken, targetCompanyId, payload),
    onSuccess: (delivery) => {
      attemptRef.current = null;
      setError(null);
      setSuccess(`Pedido #${delivery.displayNumber} criado para ${delivery.companyName}.`);
      void queryClient.invalidateQueries({ queryKey: ['deliveries'] });
      void queryClient.invalidateQueries({ queryKey: ['admin', 'operations'] });
    },
    onError: (mutationError) => {
      setSuccess(null);
      setError(
        mutationError instanceof ApiError
          ? mutationError.message
          : 'Não foi possível criar o pedido.',
      );
    },
  });

  function resetForm() {
    attemptRef.current = null;
    setServiceTypeId('');
    setDestinationKnown(true);
    setScheduledAt('');
    setRecipientName('');
    setRecipientPhone('');
    setExternalOrderNumber('');
    setCustomerPaymentMethod('');
    setDriverNote('');
    setStreet('');
    setNumber('');
    setComplement('');
    setCity('');
    setState('');
    setZip('');
    setReferenceNote('');
    setRequiresReturn(false);
    setRequiresCollectionRecipient(false);
    setRequiresDeliveryProof(false);
    setError(null);
    setSuccess(null);
  }

  function selectCompany(value: string | null) {
    setCompanyId(value ?? '');
    resetForm();
  }

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    if (!companyId) return setError('Selecione uma empresa.');
    if (!selectedServiceTypeId) return setError('Selecione um tipo de serviço.');
    if (!pickupAddress) return setError('A empresa não possui endereço principal de coleta.');
    if (destinationKnown && (!street || !number || !city || state.length !== 2 || !zip)) {
      return setError('Preencha o endereço de entrega completo.');
    }

    const payload: CreateDeliveryPayload = {
      serviceTypeId: selectedServiceTypeId,
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
      pickupSurchargeChargedToDriver: false,
      scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : undefined,
    };
    const fingerprint = JSON.stringify({ companyId, payload });
    if (attemptRef.current?.fingerprint !== fingerprint) {
      attemptRef.current = { fingerprint, key: crypto.randomUUID() };
    }

    mutation.mutate({
      targetCompanyId: companyId,
      payload: { ...payload, idempotencyKey: attemptRef.current.key },
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={children as React.ReactElement} />
      <DialogContent closeDisabled={mutation.isPending}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PackagePlus className="size-5 text-primary" /> Lançar pedido para empresa
          </DialogTitle>
          <DialogDescription>
            Selecione a empresa. O endereço de coleta e a tabela de preços dela serão usados.
          </DialogDescription>
        </DialogHeader>

        <form className="contents" onSubmit={submit}>
          <DialogBody className="space-y-5">
            <div className="space-y-1.5">
              <Label>Empresa</Label>
              <Select items={companyLabels} value={companyId} onValueChange={selectCompany}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Selecione uma empresa cadastrada" />
                </SelectTrigger>
                <SelectContent>
                  {companies.map((company) => (
                    <SelectItem
                      key={company.id}
                      value={company.id}
                      disabled={company.status !== 'ACTIVE'}
                    >
                      <Building2 className="size-4" />
                      {company.tradeName}
                      {company.status !== 'ACTIVE' && (
                        <span className="text-xs text-muted-foreground">Não ativa</span>
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {activeCompanies.length === 0 && (
                <p className="text-xs text-destructive">
                  Nenhuma empresa ativa pode receber pedidos.
                </p>
              )}
            </div>

            {companyId && (
              <>
                <div className="rounded-2xl border border-primary/15 bg-primary/5 p-4">
                  <p className="flex items-center gap-2 text-sm font-semibold">
                    <MapPin className="size-4 text-primary" /> Coleta
                  </p>
                  {companyQuery.isLoading ? (
                    <p className="mt-2 text-sm text-muted-foreground">Carregando endereço...</p>
                  ) : pickupAddress ? (
                    <p className="mt-2 text-sm text-muted-foreground">
                      {pickupAddress.street}, {pickupAddress.number}
                      {pickupAddress.complement ? ` - ${pickupAddress.complement}` : ''} ·{' '}
                      {pickupAddress.city}/{pickupAddress.state}
                    </p>
                  ) : (
                    <p className="mt-2 text-sm text-destructive">
                      Cadastre um endereço principal para esta empresa antes de lançar o pedido.
                    </p>
                  )}
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>Tipo de serviço</Label>
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
                  <div className="space-y-1.5">
                    <Label htmlFor="admin-delivery-scheduled-at">Agendar (opcional)</Label>
                    <div className="relative">
                      <CalendarClock className="pointer-events-none absolute top-2.5 left-3 size-4 text-muted-foreground" />
                      <Input
                        id="admin-delivery-scheduled-at"
                        type="datetime-local"
                        value={scheduledAt}
                        onChange={(event) => setScheduledAt(event.target.value)}
                        className="pl-9"
                      />
                    </div>
                  </div>
                </div>

                <Separator />

                <fieldset className="grid gap-2 sm:grid-cols-2">
                  <legend className="mb-2 text-sm font-medium">Destino</legend>
                  <label className="rounded-xl border p-3 text-sm has-checked:border-primary/60 has-checked:bg-primary/8">
                    <input
                      type="radio"
                      name="admin-destination"
                      checked={destinationKnown}
                      onChange={() => setDestinationKnown(true)}
                    />
                    <span className="ml-2 font-medium">Informar endereço agora</span>
                  </label>
                  <label className="rounded-xl border p-3 text-sm has-checked:border-primary/60 has-checked:bg-primary/8">
                    <input
                      type="radio"
                      name="admin-destination"
                      checked={!destinationKnown}
                      onChange={() => setDestinationKnown(false)}
                    />
                    <span className="ml-2 font-medium">Motoboy define pelo GPS</span>
                  </label>
                </fieldset>

                {destinationKnown && (
                  <div className="space-y-3 rounded-2xl border bg-card/60 p-4">
                    <p className="text-sm font-semibold">Endereço de entrega</p>
                    <Input
                      placeholder="Rua"
                      value={street}
                      onChange={(e) => setStreet(e.target.value)}
                    />
                    <div className="grid grid-cols-[110px_1fr] gap-2">
                      <Input
                        placeholder="Número"
                        value={number}
                        onChange={(e) => setNumber(e.target.value)}
                      />
                      <Input
                        placeholder="Complemento"
                        value={complement}
                        onChange={(e) => setComplement(e.target.value)}
                      />
                    </div>
                    <div className="grid grid-cols-[1fr_80px_130px] gap-2">
                      <Input
                        placeholder="Cidade"
                        value={city}
                        onChange={(e) => setCity(e.target.value)}
                      />
                      <Input
                        placeholder="UF"
                        maxLength={2}
                        value={state}
                        onChange={(e) => setState(e.target.value.toUpperCase())}
                      />
                      <Input
                        placeholder="CEP"
                        value={zip}
                        onChange={(e) => setZip(e.target.value)}
                      />
                    </div>
                    <Input
                      placeholder="Ponto de referência"
                      value={referenceNote}
                      onChange={(e) => setReferenceNote(e.target.value)}
                    />
                  </div>
                )}

                <div className="grid gap-2 sm:grid-cols-2">
                  <Input
                    placeholder="Nome do destinatário"
                    value={recipientName}
                    onChange={(e) => setRecipientName(e.target.value)}
                  />
                  <Input
                    placeholder="Telefone do destinatario"
                    value={recipientPhone}
                    onChange={(e) => setRecipientPhone(e.target.value)}
                  />
                  <Input
                    placeholder="Número externo do pedido"
                    value={externalOrderNumber}
                    onChange={(e) => setExternalOrderNumber(e.target.value)}
                  />
                  <select
                    className="h-9 rounded-lg border border-input bg-card/90 px-3 text-sm shadow-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/15"
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
                  className="w-full rounded-xl border border-input bg-card/90 px-3 py-2 text-sm shadow-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/15"
                />

                <div className="grid gap-2 text-sm sm:grid-cols-3">
                  <label className="flex items-center gap-2 rounded-xl border p-3">
                    <Checkbox
                      checked={requiresReturn}
                      onCheckedChange={(value) => setRequiresReturn(Boolean(value))}
                    />
                    Exige retorno
                  </label>
                  <label className="flex items-center gap-2 rounded-xl border p-3">
                    <Checkbox
                      checked={requiresCollectionRecipient}
                      onCheckedChange={(value) => setRequiresCollectionRecipient(Boolean(value))}
                    />
                    Confirmar coleta
                  </label>
                  <label className="flex items-center gap-2 rounded-xl border p-3">
                    <Checkbox
                      checked={requiresDeliveryProof}
                      onCheckedChange={(value) => setRequiresDeliveryProof(Boolean(value))}
                    />
                    Exigir comprovante
                  </label>
                </div>
              </>
            )}

            {error && (
              <ActionFeedback tone="error" title="Não foi possível lançar o pedido">
                {error}
              </ActionFeedback>
            )}
            {success && (
              <ActionFeedback tone="success" title="Pedido lançado">
                {success}
              </ActionFeedback>
            )}
          </DialogBody>

          <DialogFooter className="flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={mutation.isPending}
            >
              Fechar
            </Button>
            <Button
              type="submit"
              disabled={
                !companyId || !pickupAddress || serviceTypesQuery.isLoading || mutation.isPending
              }
            >
              <PendingButtonLabel pending={mutation.isPending} pendingLabel="Lançando...">
                Lançar pedido
              </PendingButtonLabel>
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
