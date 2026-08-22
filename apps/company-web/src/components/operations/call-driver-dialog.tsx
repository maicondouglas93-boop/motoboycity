'use client';

import { useState, type SubmitEvent } from 'react';
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
import { session } from '@/lib/session';

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

      return parsedQuantity === 1
        ? deliveriesApi.create(token as string, delivery)
        : deliveriesApi.createBatch(token as string, {
            deliveries: Array.from({ length: parsedQuantity }, () => delivery),
          });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['company', 'operations'] });
      void queryClient.invalidateQueries({ queryKey: ['deliveries'] });
      setOpen(false);
      setQuantity('1');
      setRequiresReturn(false);
      setDriverNote('');
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

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={children as React.ReactElement} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Chamar entregador</DialogTitle>
        </DialogHeader>

        <form onSubmit={submit} className="contents">
          <DialogBody className="space-y-4">
            <div className="space-y-1.5">
              <Label>Coleta</Label>
              {pickupAddress ? (
                <div className="rounded-lg border bg-muted/30 px-3 py-2 text-sm">
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

            <p className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
              <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />O entregador confirma os
              locais de entrega no ato, direto no aplicativo.
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
                className="w-full rounded-lg border bg-transparent px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
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
                    className="flex cursor-pointer items-center gap-2 rounded-lg border p-3 text-sm transition-colors has-checked:border-primary has-checked:bg-primary/5"
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
            <p className="flex items-center gap-2 rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground">
              <Receipt className="size-4 shrink-0" aria-hidden="true" />
              Pagamento faturado — entra na fatura da sua loja.
            </p>

            {error && <p className="text-sm text-destructive">{error}</p>}
          </DialogBody>

          <DialogFooter>
            <Button type="submit" className="w-full" disabled={mutation.isPending}>
              {mutation.isPending ? 'Chamando...' : 'Chamar entregador'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
