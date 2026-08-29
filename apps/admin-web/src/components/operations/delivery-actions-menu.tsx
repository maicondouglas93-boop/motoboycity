'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@motoboycity/api-client';
import type { DeliveryStatus, OperationalDeliveryItem } from '@motoboycity/types';
import {
  Ban,
  BellRing,
  CheckCircle2,
  EllipsisVertical,
  PackageCheck,
  Truck,
  UserCog,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Label } from '@/components/ui/label';
import {
  adminDeliveriesApi,
  adminDriversApi,
  adminOperationsApi,
  deliveriesApi,
} from '@/lib/api-client';
import { session } from '@/lib/session';
import { statusLabel } from '@/components/orders/status-chip';

type DeliveryAction = 'reoffer' | 'reassign' | 'collect' | 'deliver' | 'cancel' | 'complete';

const REASSIGNABLE: DeliveryStatus[] = ['ACCEPTED', 'COLLECTED', 'DELIVERED', 'FAILED'];
const CANCELLABLE: DeliveryStatus[] = [
  'SCHEDULED',
  'AWAITING_DRIVER',
  'ACCEPTED',
  'COLLECTED',
  'DELIVERED',
  'FAILED',
  'AWAITING_PAYMENT',
];
const FORCE_COMPLETABLE: DeliveryStatus[] = ['DELIVERED', 'FAILED'];

function actionCopy(action: DeliveryAction, order: OperationalDeliveryItem) {
  switch (action) {
    case 'reoffer':
      return {
        title: `Reenviar pedido #${order.displayNumber} para um motoboy`,
        description:
          'A oferta voltara a tocar somente para o motoboy escolhido, usando o prazo normal de resposta.',
        confirm: 'Fazer pedido tocar',
        pending: 'Enviando oferta...',
      };
    case 'reassign':
      return {
        title: `Alterar entregador do pedido #${order.displayNumber}`,
        description: 'O pedido mantém seu número e status. A troca fica registrada no histórico.',
        confirm: 'Alterar entregador',
        pending: 'Alterando...',
      };
    case 'collect':
      return {
        title: `Marcar pedido #${order.displayNumber} como coletado`,
        description: order.batchId
          ? 'A coleta é única para o lote: todos os itens aceitos avançam juntos.'
          : 'Confirme somente se a mercadoria já foi retirada na loja.',
        confirm: 'Marcar como coletado',
        pending: 'Marcando...',
      };
    case 'deliver':
      return {
        title: `Marcar pedido #${order.displayNumber} como entregue`,
        description: order.requiresReturn
          ? 'O pedido passará para retorno à loja e ainda não será finalizado.'
          : 'O pedido será concluído e o repasse do entregador será liberado.',
        confirm: 'Marcar como entregue',
        pending: 'Marcando...',
      };
    case 'cancel':
      return {
        title: `Cancelar pedido #${order.displayNumber}`,
        description:
          'O cancelamento é irreversível. A loja e o entregador serão atualizados pela operação.',
        confirm: 'Cancelar pedido',
        pending: 'Cancelando...',
      };
    case 'complete':
      return {
        title: `Finalizar pedido #${order.displayNumber}`,
        description:
          'Use quando a entrega ou devolução já terminou na rua. O pedido será concluído e o repasse liberado.',
        confirm: 'Finalizar pedido',
        pending: 'Finalizando...',
      };
  }
}

export function DeliveryActionsMenu({ order }: { order: OperationalDeliveryItem }) {
  const token = session.getToken();
  const queryClient = useQueryClient();
  const [action, setAction] = useState<DeliveryAction | null>(null);
  const [driverId, setDriverId] = useState('');
  const [reason, setReason] = useState('');
  const [distanceKm, setDistanceKm] = useState('');
  const [error, setError] = useState<string | null>(null);

  const canReassign = REASSIGNABLE.includes(order.status);
  const canReoffer = order.status === 'AWAITING_DRIVER';
  const canCollect = order.status === 'ACCEPTED';
  const canDeliver = order.status === 'COLLECTED' && order.destinationKnownAtCreation;
  const canCancel = CANCELLABLE.includes(order.status);
  const canComplete = FORCE_COMPLETABLE.includes(order.status);

  const driversQuery = useQuery({
    queryKey: ['admin', 'drivers', 'delivery-actions'],
    queryFn: () => adminDriversApi.list(token as string),
    enabled: Boolean(token) && (action === 'reassign' || action === 'reoffer'),
    staleTime: 30_000,
  });

  const availableDrivers = useMemo(
    () =>
      (driversQuery.data ?? []).filter((driver) => {
        const active =
          driver.approvalStatus === 'APPROVED' &&
          driver.accountStatus === 'ACTIVE' &&
          driver.id !== order.driver?.id;
        return active && (action !== 'reoffer' || driver.availability === 'AVAILABLE');
      }),
    [action, driversQuery.data, order.driver?.id],
  );

  const closeDialog = () => {
    setAction(null);
    setDriverId('');
    setReason('');
    setDistanceKm('');
    setError(null);
  };

  const openAction = (nextAction: DeliveryAction) => {
    setError(null);
    setDriverId('');
    setReason('');
    setDistanceKm('');
    setAction(nextAction);
  };

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['admin', 'operations'] });
    void queryClient.invalidateQueries({ queryKey: ['admin', 'delivery', order.id] });
    void queryClient.invalidateQueries({ queryKey: ['admin', 'deliveries'] });
    void queryClient.invalidateQueries({ queryKey: ['admin', 'driver-deliveries'] });
  };

  const mutation = useMutation({
    mutationFn: async () => {
      if (!token || !action) throw new Error('Sessão administrativa indisponível.');
      const payload = { reason: reason.trim() };
      const distancia = distanceKm.trim() ? Number(distanceKm.trim().replace(',', '.')) : undefined;
      switch (action) {
        case 'reoffer':
          return adminOperationsApi.reofferDelivery(token, order.id, {
            driverId,
            reason: payload.reason,
          });
        case 'reassign':
          return adminDeliveriesApi.reassignDriver(token, order.id, { ...payload, driverId });
        case 'collect':
          return adminDeliveriesApi.markCollected(token, order.id, payload);
        case 'deliver':
          return adminDeliveriesApi.markDelivered(token, order.id, {
            ...payload,
            ...(distancia !== undefined && { distanceKm: distancia }),
          });
        case 'cancel':
          return deliveriesApi.cancel(token, order.id, payload.reason);
        case 'complete':
          return adminDeliveriesApi.forceComplete(token, order.id, payload);
      }
    },
    onSuccess: () => {
      invalidate();
      closeDialog();
    },
    onError: (mutationError) => {
      setError(
        mutationError instanceof ApiError
          ? mutationError.message
          : mutationError instanceof Error
            ? mutationError.message
            : 'Não foi possível atualizar o pedido.',
      );
    },
  });

  const copy = action ? actionCopy(action, order) : null;
  const needsDriver = action === 'reassign' || action === 'reoffer';
  const canSubmit =
    Boolean(action) && reason.trim().length >= 5 && (!needsDriver || Boolean(driverId));

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={`Abrir ações do pedido #${order.displayNumber}`}
          className="grid size-7 place-items-center rounded-lg border border-border/75 bg-card/95 text-muted-foreground shadow-sm transition-colors hover:bg-admin-soft hover:text-primary focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
        >
          <EllipsisVertical className="size-4" aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuItem
            disabled={!canReoffer}
            onClick={() => openAction('reoffer')}
            title={canReoffer ? undefined : 'Disponivel enquanto busca motoboy'}
          >
            <BellRing /> Reenviar oferta
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!canReassign}
            onClick={() => openAction('reassign')}
            title={canReassign ? undefined : 'Disponível somente para pedidos em andamento'}
          >
            <UserCog /> Alterar entregador
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!canCollect}
            onClick={() => openAction('collect')}
            title={canCollect ? undefined : 'Disponível depois do aceite'}
          >
            <PackageCheck /> Marcar como coletado
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!canDeliver}
            onClick={() => openAction('deliver')}
            title={
              order.status === 'COLLECTED' && !order.destinationKnownAtCreation
                ? 'Este pedido precisa do GPS do aplicativo para calcular o valor'
                : 'Disponível depois da coleta'
            }
          >
            <Truck /> Marcar como entregue
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!canComplete}
            onClick={() => openAction('complete')}
            title={canComplete ? undefined : 'Disponível durante o retorno à loja'}
          >
            <CheckCircle2 /> Finalizar pedido
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            disabled={!canCancel}
            onClick={() => openAction('cancel')}
          >
            <Ban /> Cancelar pedido
          </DropdownMenuItem>
          {order.status === 'COLLECTED' && !order.destinationKnownAtCreation ? (
            <p className="px-2.5 py-1.5 text-[10px] leading-4 text-muted-foreground">
              A entrega deste pedido depende do GPS do app para calcular distância e valor.
            </p>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={action !== null} onOpenChange={(open) => !open && closeDialog()}>
        {copy ? (
          <DialogContent closeDisabled={mutation.isPending} className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>{copy.title}</DialogTitle>
              <DialogDescription>
                {order.companyName} · {statusLabel(order.status)}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 px-6 py-5">
              <p className="rounded-xl border border-primary/15 bg-admin-soft/55 p-3 text-sm text-muted-foreground">
                {copy.description}
              </p>

              {action === 'reassign' || action === 'reoffer' ? (
                <div className="space-y-1.5">
                  <Label htmlFor={`delivery-${order.id}-driver`}>
                    {action === 'reoffer' ? 'Motoboy que recebera a oferta' : 'Novo entregador'}
                  </Label>
                  <select
                    id={`delivery-${order.id}-driver`}
                    className="h-10 w-full rounded-lg border bg-background px-3 text-sm"
                    value={driverId}
                    onChange={(event) => setDriverId(event.target.value)}
                  >
                    <option value="">
                      {driversQuery.isLoading ? 'Carregando entregadores...' : 'Selecione'}
                    </option>
                    {availableDrivers.map((driver) => (
                      <option key={driver.id} value={driver.id}>
                        {driver.name}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}

              {/*
                O campo aparece em toda entrega manual porque a lista
                operacional nao diz se o pedido calcula o preco na entrega. Quem
                sabe e a API: ela exige a distancia nesses pedidos e RECUSA o
                numero nos que ja tem valor congelado, em vez de ignora-lo em
                silencio. Nos dois casos a mensagem chega aqui.
              */}
              {action === 'deliver' ? (
                <div className="space-y-1.5">
                  <Label htmlFor={`delivery-${order.id}-distance`}>Distância percorrida (km)</Label>
                  <input
                    id={`delivery-${order.id}-distance`}
                    inputMode="decimal"
                    autoComplete="off"
                    value={distanceKm}
                    onChange={(event) => setDistanceKm(event.target.value)}
                    placeholder="Ex.: 3,2"
                    className="h-10 w-full rounded-lg border border-input bg-card/90 px-3 text-sm shadow-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/15"
                  />
                  <p className="text-xs text-muted-foreground">
                    Preencha somente quando o pedido calcularia o valor pela localização da entrega
                    e ela não chegou. O preço sai da tabela vigente, e a distância fica no histórico
                    junto com o motivo.
                  </p>
                </div>
              ) : null}

              <div className="space-y-1.5">
                <Label htmlFor={`delivery-${order.id}-reason`}>Motivo da alteração</Label>
                <textarea
                  id={`delivery-${order.id}-reason`}
                  rows={3}
                  maxLength={300}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder="Ex.: confirmado por telefone com a loja ou entregador"
                  className="w-full rounded-xl border border-input bg-card/90 px-3 py-2 text-sm shadow-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/15"
                />
                <p className="text-xs text-muted-foreground">
                  O motivo e seu usuário ficam gravados no histórico do pedido.
                </p>
              </div>

              {error ? <p className="text-sm text-destructive">{error}</p> : null}
            </div>

            <DialogFooter className="flex justify-end gap-2">
              <DialogClose
                disabled={mutation.isPending}
                render={<Button variant="outline">Voltar</Button>}
              />
              <Button
                variant={action === 'cancel' ? 'destructive' : 'default'}
                disabled={!canSubmit || mutation.isPending}
                onClick={() => mutation.mutate()}
              >
                {mutation.isPending ? copy.pending : copy.confirm}
              </Button>
            </DialogFooter>
          </DialogContent>
        ) : null}
      </Dialog>
    </>
  );
}
