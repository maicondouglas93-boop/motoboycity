'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Phone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ElapsedTime } from '@/components/orders/elapsed-time';
import { StatusChip } from '@/components/orders/status-chip';
import { deliveriesApi } from '@/lib/api-client';
import { DispatchRadar, type DispatchRadarState } from './dispatch-radar';

/**
 * O acompanhamento da busca, do momento em que o pedido sai até o aceite.
 *
 * Gêmeo do painel do portal da empresa (`company-web`), com uma diferença
 * deliberada: aqui não há cancelar nem chamar de novo. Quem lança pedido pela
 * administração já tem o menu de ações do pedido, que faz isso e muito mais —
 * repetir dois botões dele dentro do modal criaria um segundo caminho para a
 * mesma coisa, com metade das opções.
 */
interface Props {
  token: string;
  /** Os pedidos criados nesta chamada. */
  deliveryIds: string[];
  /** Preenchido quando a criação foi em lote; a consulta prefere ele. */
  batchId: string | null;
  /** A criação ainda está no ar — o radar já gira, o pedido ainda não existe. */
  creating: boolean;
  detailHref: (deliveryId: string) => string;
}

export function DispatchTrackingPanel({
  token,
  deliveryIds,
  batchId,
  creating,
  detailHref,
}: Props) {
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
    refetchInterval: 3_000,
  });

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
              className="rounded-xl border border-primary/15 bg-gradient-to-br from-card to-admin-soft/40 p-3 shadow-sm"
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
                <Link
                  href={detailHref(delivery.id)}
                  className="text-xs font-semibold text-admin underline decoration-admin/35 decoration-2 underline-offset-4 transition-colors hover:text-admin-deep"
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
