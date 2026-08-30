'use client';

import { useRef, useState, type SubmitEvent } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@motoboycity/api-client';
import type { CreateDeliveryPayload } from '@motoboycity/types';
import { Bike, Info, Receipt } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { companyAddressApi, deliveriesApi, serviceTypesApi } from '@/lib/api-client';
import { idempotencyAttemptFor, type IdempotencyAttempt } from '@/lib/idempotency';
import { session } from '@/lib/session';
import { DispatchTrackingPanel } from './dispatch-tracking-panel';
import { ServiceClosedNotice, useServiceHours } from './service-closed-notice';

/**
 * O lote da API começa em duas entregas; uma entrega é criação avulsa.
 * O limite de cima é o mesmo do schema de validação.
 */
const MIN_DELIVERIES = 1;
const MAX_DELIVERIES = 50;

export function CallDriverDialog({ children }: { children: React.ReactNode }) {
  const token = session.getToken();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const [quantity, setQuantity] = useState('1');
  const [serviceTypeId, setServiceTypeId] = useState('');
  const [requiresReturn, setRequiresReturn] = useState(false);
  const [driverNote, setDriverNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const creationAttempt = useRef<IdempotencyAttempt | null>(null);
  /**
   * Ids das entregas recem-criadas. Enquanto houver algum aqui, o modal deixa
   * de ser formulario e vira painel de acompanhamento — o momento de espera e
   * justamente quando a pessoa mais quer olhar a tela.
   */
  const [trackedIds, setTrackedIds] = useState<string[]>([]);
  const [trackedBatchId, setTrackedBatchId] = useState<string | null>(null);

  /**
   * O horário só é consultado com o modal aberto — mas o resultado é o mesmo
   * cache da Home (`['company', 'business-hours']`), então abrir o atalho não
   * dispara uma segunda consulta se a Home já perguntou.
   */
  const serviceHours = useServiceHours(open ? token : null);

  const addressQuery = useQuery({
    queryKey: ['company', 'address'],
    queryFn: () => companyAddressApi.get(token as string),
    enabled: Boolean(token) && open,
  });
  const serviceTypesQuery = useQuery({
    queryKey: ['service-types', { active: true }],
    queryFn: () => serviceTypesApi.list(token as string, { active: true }),
    enabled: Boolean(token) && open,
  });

  const pickupAddress = addressQuery.data?.address ?? null;
  const serviceTypes = serviceTypesQuery.data ?? [];
  const selectedServiceTypeId = serviceTypeId || serviceTypes[0]?.id || '';
  const parsedQuantity = Number(quantity);

  const mutation = useMutation({
    mutationFn: async () => {
      /**
       * Destino sempre por GPS: este é o caminho curto, em que o entregador
       * confirma os locais no ato. Quem já sabe o endereço usa o formulário
       * completo da central, que exige a sugestão do Google.
       */
      const delivery: CreateDeliveryPayload = {
        serviceTypeId: selectedServiceTypeId,
        destinationKnownAtCreation: false,
        requiresReturn,
        ...(driverNote.trim() && { driverNote: driverNote.trim() }),
      };

      const request =
        parsedQuantity === 1
          ? { kind: 'single' as const, delivery }
          : {
              kind: 'batch' as const,
              deliveries: Array.from({ length: parsedQuantity }, () => delivery),
            };
      const attempt = idempotencyAttemptFor(creationAttempt.current, request);
      creationAttempt.current = attempt;

      return request.kind === 'single'
        ? deliveriesApi.create(token as string, { ...delivery, idempotencyKey: attempt.key })
        : deliveriesApi.createBatch(token as string, {
            idempotencyKey: attempt.key,
            deliveries: request.deliveries,
          });
    },
    onSuccess: (result) => {
      creationAttempt.current = null;
      void queryClient.invalidateQueries({ queryKey: ['company', 'operations'] });
      void queryClient.invalidateQueries({ queryKey: ['deliveries'] });
      setTrackedIds(
        'deliveries' in result ? result.deliveries.map((item) => item.id) : [result.id],
      );
      setTrackedBatchId('deliveries' in result ? result.batchId : null);
      setError(null);
    },
    onError: (mutationError) => {
      setError(
        mutationError instanceof ApiError
          ? mutationError.message
          : 'Não foi possível chamar o entregador.',
      );
    },
  });

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!pickupAddress) return setError('Cadastre o endereço de coleta antes de chamar.');
    if (!selectedServiceTypeId) return setError('Selecione um tipo de serviço.');
    if (
      !Number.isInteger(parsedQuantity) ||
      parsedQuantity < MIN_DELIVERIES ||
      parsedQuantity > MAX_DELIVERIES
    ) {
      return setError(`Informe de ${MIN_DELIVERIES} a ${MAX_DELIVERIES} entregas.`);
    }
    mutation.mutate();
  }

  function reset() {
    creationAttempt.current = null;
    setTrackedIds([]);
    setTrackedBatchId(null);
    setQuantity('1');
    setRequiresReturn(false);
    setDriverNote('');
    setError(null);
  }

  // A confirmacao da API pode levar alguns segundos. Entrar no acompanhamento
  // no mesmo clique evita deixar a empresa presa no formulario ate a resposta.
  const isTracking = mutation.isPending || trackedIds.length > 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        // Fechar encerra o acompanhamento: as entregas seguem na central, que e
        // onde elas vivem depois de criadas.
        if (!next) reset();
      }}
    >
      <DialogTrigger render={children as React.ReactElement} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isTracking ? 'Acompanhando' : 'Chamar entregador'}</DialogTitle>
        </DialogHeader>

        {isTracking ? (
          <>
            <DialogBody className="space-y-3">
              <DispatchTrackingPanel
                token={token as string}
                deliveryIds={trackedIds}
                batchId={trackedBatchId}
                creating={mutation.isPending}
                allowActions
                detailHref={(id) => `/pedidos/${id}`}
                onError={setError}
              />
              {error && <p className="text-center text-sm text-destructive">{error}</p>}
            </DialogBody>

            <DialogFooter className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                disabled={mutation.isPending}
                onClick={reset}
              >
                Chamar outro
              </Button>
              <Button type="button" className="flex-1" onClick={() => setOpen(false)}>
                Fechar
              </Button>
            </DialogFooter>
          </>
        ) : (
          <form onSubmit={submit} className="contents">
            <DialogBody className="space-y-4">
              <div className="space-y-1.5">
                <Label>Coleta</Label>
                {pickupAddress ? (
                  <div className="rounded-xl border border-portal/15 bg-portal-soft/45 px-3 py-2.5 text-sm">
                    {pickupAddress.street}, {pickupAddress.number} · {pickupAddress.city}/
                    {pickupAddress.state}
                  </div>
                ) : (
                  <p className="text-sm text-destructive">
                    Nenhum endereço de coleta cadastrado.{' '}
                    <Link href="/" className="underline">
                      Cadastrar agora
                    </Link>
                  </p>
                )}
                {/*
                  O original tinha "salvar local de coleta para o proximo pedido".
                  Aqui o ponto de coleta e o endereco da propria empresa, ja
                  salvo e reutilizado sempre — a caixa nao teria o que controlar.
                */}
                <p className="text-xs text-muted-foreground">
                  Este é o endereço cadastrado da sua loja.{' '}
                  <Link href="/" className="underline underline-offset-2">
                    Alterar
                  </Link>
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="call-quantity">Número de entregas</Label>
                <Input
                  id="call-quantity"
                  inputMode="numeric"
                  value={quantity}
                  onChange={(event) => setQuantity(event.target.value.replace(/\D/g, ''))}
                  className="w-24"
                />
              </div>

              <ServiceClosedNotice token={open ? token : null} />

              <p className="flex items-start gap-2 rounded-xl border border-portal/20 bg-portal-soft/65 p-3 text-sm text-portal-deep">
                <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />O entregador confirma
                os locais de entrega no ato, direto no aplicativo.
              </p>

              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={requiresReturn}
                  onCheckedChange={(checked) => setRequiresReturn(Boolean(checked))}
                />
                Retorno ao local de coleta necessário
              </label>

              <div className="space-y-1.5">
                <Label htmlFor="call-note">Observação</Label>
                <textarea
                  id="call-note"
                  rows={3}
                  value={driverNote}
                  onChange={(event) => setDriverNote(event.target.value)}
                  placeholder="Se necessário, informe uma observação para acompanhar o pedido"
                  className="w-full rounded-lg border border-input bg-card/90 px-3 py-2 text-sm shadow-sm focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/15 focus-visible:outline-none"
                />
              </div>

              <fieldset className="space-y-2">
                <legend className="mb-2 text-sm font-medium">Selecione um tipo de serviço</legend>
                {/*
                  Cartoes com nome, sem foto: `ServiceType` nao guarda imagem, e
                  inventar uma ilustracao generica so ocuparia espaco sem ajudar a
                  distinguir as modalidades.
                */}
                <div className="grid grid-cols-2 gap-2">
                  {serviceTypes.map((serviceType) => (
                    <label
                      key={serviceType.id}
                      className="flex cursor-pointer items-center gap-2 rounded-xl border border-border/80 bg-card/70 p-3 text-sm transition-all has-checked:border-primary/60 has-checked:bg-primary/10 has-checked:shadow-sm hover:border-portal/20"
                    >
                      <input
                        type="radio"
                        name="serviceType"
                        className="sr-only"
                        checked={selectedServiceTypeId === serviceType.id}
                        onChange={() => setServiceTypeId(serviceType.id)}
                      />
                      <Bike className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                      <span className="font-medium">{serviceType.name}</span>
                    </label>
                  ))}
                </div>
              </fieldset>

              {/*
                Informativo, nao escolha: a API grava `paymentMethod: 'BILLED'`
                em toda entrega. Um cartao clicavel aqui prometeria uma opcao que
                nao existe.
              */}
              <p className="flex items-center gap-2 rounded-xl border border-dashed border-portal/25 bg-portal-soft/30 px-3 py-2 text-xs text-muted-foreground">
                <Receipt className="size-4 shrink-0" aria-hidden="true" />
                Pagamento faturado — entra na fatura da sua loja.
              </p>

              {error && <p className="text-sm text-destructive">{error}</p>}
            </DialogBody>

            <DialogFooter>
              {/*
                Desabilitar fora do horário, e não deixar tentar: a API recusa
                de qualquer jeito, e um botão que só serve para produzir erro é
                pior que um botão apagado com o motivo escrito logo acima.

                Se a consulta do horário falhar, `accepting` fica indefinido e o
                botão continua ativo — na dúvida, quem decide é a API, não a
                ausência de resposta de uma consulta secundária.
              */}
              <Button
                type="submit"
                className="w-full"
                disabled={mutation.isPending || serviceHours.data?.accepting === false}
              >
                {mutation.isPending ? 'Chamando...' : 'Chamar entregador'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
