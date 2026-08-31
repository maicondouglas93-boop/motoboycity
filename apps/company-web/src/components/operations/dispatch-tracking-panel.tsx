'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@motoboycity/api-client';
import type { DeliveryOperationsResult } from '@motoboycity/types';
import { Phone, RotateCw, X } from 'lucide-react';
import { io } from 'socket.io-client';
import { Button } from '@/components/ui/button';
import { ElapsedTime } from '@/components/orders/elapsed-time';
import { StatusChip } from '@/components/orders/status-chip';
import { apiBaseUrl, deliveriesApi } from '@/lib/api-client';
import { DispatchRadar, type DispatchRadarState } from './dispatch-radar';

const DISPATCH_RECOVERY_INTERVAL_MS = 30_000;
const REALTIME_REFRESH_DEBOUNCE_MS = 200;

export function deliveryUpdateTouchesTracking(
  payload: unknown,
  deliveryIds: string[],
  batchId: string | null,
): boolean {
  if (!payload || typeof payload !== 'object') return true;
  const update = payload as { id?: unknown; deliveryId?: unknown; batchId?: unknown };
  const updateId =
    typeof update.deliveryId === 'string'
      ? update.deliveryId
      : typeof update.id === 'string'
        ? update.id
        : null;
  const updateBatchId = typeof update.batchId === 'string' ? update.batchId : null;

  if (batchId && updateBatchId) return batchId === updateBatchId;
  if (updateId) return deliveryIds.includes(updateId);
  return true;
}

export function dispatchTrackingNeedsRecovery(
  data: DeliveryOperationsResult | undefined,
  deliveryIds: string[],
): boolean {
  if (!data || deliveryIds.length === 0) return deliveryIds.length > 0;
  const tracked = [...data.active, ...data.recent].filter((delivery) =>
    deliveryIds.includes(delivery.id),
  );
  return (
    tracked.length !== deliveryIds.length ||
    tracked.some(
      (delivery) => delivery.status === 'AWAITING_DRIVER' || delivery.status === 'SCHEDULED',
    )
  );
}

/**
 * O acompanhamento da busca, do momento em que o pedido sai até o aceite.
 *
 * Nasceu dentro de `CallDriverDialog` e saiu de lá para poder existir nos três
 * lugares em que se chama entregador: o atalho da barra, o formulário completo
 * da central e a criação feita pela administração em nome da loja. Espalhar
 * cópias faria a mesma espera parecer três produtos diferentes — e só uma delas
 * receberia a próxima correção.
 */
interface Props {
  token: string;
  /** Os pedidos criados nesta chamada. */
  deliveryIds: string[];
  /** Preenchido quando a criação foi em lote; a consulta prefere ele. */
  batchId: string | null;
  /** A criação ainda está no ar — o radar já gira, o pedido ainda não existe. */
  creating: boolean;
  /**
   * Cancelar e chamar de novo. A loja tem; a administração não, porque lá o
   * menu de ações do pedido já faz isso com muito mais poder.
   */
  allowActions?: boolean;
  detailHref: (deliveryId: string) => string;
  onError?: (message: string) => void;
}

export function DispatchTrackingPanel({
  token,
  deliveryIds,
  batchId,
  creating,
  allowActions = false,
  detailHref,
  onError,
}: Props) {
  const queryClient = useQueryClient();
  const [actingOnId, setActingOnId] = useState<string | null>(null);
  const trackingScope = batchId ?? deliveryIds[0] ?? null;
  const trackingIdsKey = deliveryIds.join(',');

  /**
   * Consulta somente o lote ou pedido criado. Nesse recorte a API não limita
   * os terminais recentes; assim um lote grande nunca perde cancelados nem
   * declara aceite sem ter confirmado todos os pedidos.
   */
  const trackedOperationsQuery = useQuery({
    queryKey: ['deliveries', 'tracked-operations', batchId ?? deliveryIds[0]],
    queryFn: () =>
      deliveriesApi.operations(token, {
        ...(batchId ? { batchId } : { deliveryId: deliveryIds[0] as string }),
      }),
    enabled: Boolean(token) && deliveryIds.length > 0,
    refetchInterval: (query) =>
      dispatchTrackingNeedsRecovery(query.state.data, deliveryIds)
        ? DISPATCH_RECOVERY_INTERVAL_MS
        : false,
  });

  /**
   * O socket e o caminho principal. O intervalo acima existe somente para
   * reconciliar um evento perdido durante uma queda de rede.
   *
   * A primeira conexao tambem invalida a consulta: o aceite pode acontecer no
   * pequeno intervalo entre a resposta da criacao e a assinatura do evento.
   */
  useEffect(() => {
    if (!token || !trackingScope || !trackingIdsKey) return;
    const trackedDeliveryIds = trackingIdsKey.split(',');
    const socket = io(apiBaseUrl, { auth: { token } });
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    const refreshTrackedOperation = () => {
      if (refreshTimer) return;
      refreshTimer = setTimeout(() => {
        refreshTimer = null;
        void queryClient.invalidateQueries({
          queryKey: ['deliveries', 'tracked-operations', trackingScope],
          exact: true,
        });
      }, REALTIME_REFRESH_DEBOUNCE_MS);
    };
    const refreshMatchingOperation = (payload: unknown) => {
      if (deliveryUpdateTouchesTracking(payload, trackedDeliveryIds, batchId)) {
        refreshTrackedOperation();
      }
    };

    socket.on('connect', refreshTrackedOperation);
    socket.on('delivery:updated', refreshMatchingOperation);
    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      socket.disconnect();
    };
  }, [batchId, queryClient, token, trackingIdsKey, trackingScope]);

  const tracked = [
    ...(trackedOperationsQuery.data?.active ?? []),
    ...(trackedOperationsQuery.data?.recent ?? []),
  ].filter((delivery) => deliveryIds.includes(delivery.id));
  const trackingIncomplete = tracked.length !== deliveryIds.length;

  /**
   * Quantas ainda procuram entregador.
   *
   * O sinal e o STATUS, nao a ausencia de entregador: um pedido cancelado
   * tambem nao tem entregador, e contando por ausencia ele aparecia como "ainda
   * procurando" para sempre.
   */
  const pendingCount = tracked.filter(
    (delivery) => delivery.status === 'AWAITING_DRIVER' || delivery.status === 'SCHEDULED',
  ).length;
  const cancelledCount = tracked.filter((delivery) => delivery.status === 'CANCELLED').length;

  function trackingMessage(): string {
    if (creating) {
      return 'Enviando o pedido e iniciando a busca por um entregador...';
    }
    if (trackedOperationsQuery.isError) {
      return 'Não foi possível consultar o andamento. Tente novamente.';
    }
    if (trackedOperationsQuery.isLoading || trackingIncomplete) {
      return 'Atualizando o andamento de todos os pedidos...';
    }
    if (cancelledCount === deliveryIds.length) {
      return deliveryIds.length === 1 ? 'Pedido cancelado.' : 'Pedidos cancelados.';
    }
    if (pendingCount === 0) {
      if (cancelledCount > 0) {
        const acceptedCount = deliveryIds.length - cancelledCount;
        return `${acceptedCount} aceito(s) e ${cancelledCount} cancelado(s).`;
      }
      return tracked.length === 1 ? 'Entregador a caminho.' : 'Todos os pedidos foram aceitos.';
    }
    if (pendingCount === deliveryIds.length) {
      return deliveryIds.length === 1
        ? 'Pedido criado. Acompanhe até um entregador aceitar.'
        : `${deliveryIds.length} pedidos criados. Acompanhe até um entregador aceitar.`;
    }
    return `${pendingCount} de ${deliveryIds.length} ainda procurando entregador.`;
  }

  /**
   * O estado do radar sai da mesma contagem que escreve o texto.
   *
   * Enquanto a criação está no ar ou a consulta ainda não trouxe todos, o radar
   * continua procurando: parar a animação antes de ter a resposta faria a cena
   * anunciar um desfecho que ninguém confirmou.
   */
  function radarState(): DispatchRadarState {
    if (creating || trackedOperationsQuery.isLoading || trackingIncomplete) return 'searching';
    if (cancelledCount === deliveryIds.length && deliveryIds.length > 0) return 'ended';
    if (pendingCount > 0) return 'searching';
    return tracked.length > 0 ? 'found' : 'searching';
  }

  function relatarErro(erro: unknown, padrao: string) {
    onError?.(erro instanceof ApiError ? erro.message : padrao);
  }

  const cancelMutation = useMutation({
    mutationFn: (id: string) => deliveriesApi.cancel(token, id),
    onMutate: (id: string) => setActingOnId(id),
    onError: (erro) => relatarErro(erro, 'Não foi possível cancelar o pedido.'),
    onSettled: () => {
      setActingOnId(null);
      void queryClient.invalidateQueries({ queryKey: ['company', 'operations'] });
      void trackedOperationsQuery.refetch();
    },
  });

  const redispatchMutation = useMutation({
    mutationFn: (id: string) => deliveriesApi.redispatch(token, id),
    onMutate: (id: string) => setActingOnId(id),
    onError: (erro) => relatarErro(erro, 'Não foi possível chamar novamente.'),
    onSettled: () => {
      setActingOnId(null);
      void queryClient.invalidateQueries({ queryKey: ['company', 'operations'] });
      void trackedOperationsQuery.refetch();
    },
  });

  return (
    <div className="space-y-4">
      <DispatchRadar state={radarState()} label={trackingMessage()} />

      {trackedOperationsQuery.isError ? (
        <div className="flex justify-center">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void trackedOperationsQuery.refetch()}
          >
            Tentar novamente
          </Button>
        </div>
      ) : tracked.length === 0 ? null : (
        <ul className="space-y-2">
          {tracked.map((delivery) => (
            <li
              key={delivery.id}
              className="rounded-xl border border-portal/15 bg-gradient-to-br from-card to-portal-soft/35 p-3 shadow-sm"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-baseline gap-2">
                  <span className="font-mono text-sm font-semibold">#{delivery.displayNumber}</span>
                  {/* Ha quanto tempo neste estado — o mesmo medidor da fila. */}
                  <ElapsedTime since={delivery.statusChangedAt} />
                </span>
                <StatusChip status={delivery.status} />
              </div>

              {delivery.driver ? (
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                  <span className="font-medium">{delivery.driver.name}</span>
                  {delivery.driver.phone && (
                    <a
                      href={`tel:${delivery.driver.phone}`}
                      className="inline-flex items-center gap-1 text-muted-foreground underline underline-offset-2"
                    >
                      <Phone className="size-3.5" aria-hidden="true" />
                      {delivery.driver.phone}
                    </a>
                  )}
                </div>
              ) : null}

              <div className="mt-3 flex flex-wrap items-center gap-2">
                {/*
                  A API so aceita cancelamento da empresa em SCHEDULED e
                  AWAITING_DRIVER. Mostrar o botao depois do aceite ofereceria
                  uma acao que volta erro.

                  E no lote o cancelamento pega TODOS os irmaos, entao o texto
                  diz isso — "Cancelar" seco faria a pessoa achar que perde so
                  um dos pedidos.
                */}
                {allowActions && delivery.status === 'AWAITING_DRIVER' && (
                  <>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={actingOnId === delivery.id}
                      onClick={() => redispatchMutation.mutate(delivery.id)}
                    >
                      <RotateCw className="mr-1.5 size-3.5" aria-hidden="true" />
                      Chamar de novo
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="text-destructive hover:text-destructive"
                      disabled={actingOnId === delivery.id}
                      onClick={() => {
                        const message =
                          delivery.batchId && deliveryIds.length > 1
                            ? `Cancelar os ${deliveryIds.length} pedidos deste lote?`
                            : `Cancelar o pedido #${delivery.displayNumber}?`;
                        if (window.confirm(message)) {
                          cancelMutation.mutate(delivery.id);
                        }
                      }}
                    >
                      <X className="mr-1.5 size-3.5" aria-hidden="true" />
                      {delivery.batchId && deliveryIds.length > 1
                        ? `Cancelar os ${deliveryIds.length}`
                        : 'Cancelar'}
                    </Button>
                  </>
                )}
                <Link
                  href={detailHref(delivery.id)}
                  className="text-xs font-semibold text-portal underline decoration-portal/35 decoration-2 underline-offset-4 transition-colors hover:text-portal-deep"
                >
                  Abrir detalhes
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
