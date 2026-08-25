'use client';

import Link from 'next/link';
import { useDeferredValue, useState } from 'react';
import { CalendarClock, Package, ReceiptText, Route, RotateCcw } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { DeliveryStatus } from '@motoboycity/types';
import { ApiError } from '@motoboycity/api-client';
import { StatusChip, STATUS_OPTIONS, statusRailClass } from '@/components/orders/status-chip';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { deliveriesApi } from '@/lib/api-client';
import { session } from '@/lib/session';
import { useCompanyActiveDeliveryTracking } from '@/lib/use-active-delivery-tracking';

const CANCELLABLE_STATUSES: DeliveryStatus[] = ['SCHEDULED', 'AWAITING_DRIVER'];
const PAGE_SIZE = 25;

function formatCurrency(value: number | null): string {
  if (value === null) {
    return 'A calcular na entrega';
  }
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

const trackingDateFormatter = new Intl.DateTimeFormat('pt-BR', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'America/Sao_Paulo',
});

const orderDateFormatter = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'America/Sao_Paulo',
});

function mapsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}

export default function CompanyOrdersPage() {
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search.trim());
  const [statusFilter, setStatusFilter] = useState<DeliveryStatus | 'ALL'>('ALL');
  const [page, setPage] = useState(1);
  const [actionError, setActionError] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const trackingQuery = useCompanyActiveDeliveryTracking();

  const token = session.getToken();

  const deliveriesQuery = useQuery({
    queryKey: ['deliveries', 'search', deferredSearch, statusFilter, page],
    queryFn: () =>
      deliveriesApi.search(token as string, {
        ...(deferredSearch && { q: deferredSearch }),
        ...(statusFilter !== 'ALL' && { status: statusFilter }),
        page,
        pageSize: PAGE_SIZE,
      }),
    enabled: Boolean(token),
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => deliveriesApi.cancel(token as string, id),
    onSuccess: () => {
      setActionError(null);
      void queryClient.invalidateQueries({ queryKey: ['deliveries'] });
    },
    onError: (error) => {
      setActionError(
        error instanceof ApiError ? error.message : 'Não foi possível cancelar o pedido.',
      );
    },
  });

  if (!token) {
    return <p className="text-sm text-muted-foreground">Faça login para ver os pedidos.</p>;
  }

  const deliveries = deliveriesQuery.data?.items ?? [];
  const total = deliveriesQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const activeTracking = trackingQuery.data ?? [];

  return (
    <div className="space-y-5">
      <div className="premium-panel flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/80 bg-card/85 p-3 shadow-sm backdrop-blur">
        <Input
          placeholder="Buscar pedido..."
          className="max-w-xs"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
        />
        <select
          aria-label="Filtrar status dos pedidos"
          className="h-9 rounded-lg border border-input bg-card/90 px-3 text-sm shadow-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/15"
          value={statusFilter}
          onChange={(event) => {
            setStatusFilter(event.target.value as DeliveryStatus | 'ALL');
            setPage(1);
          }}
        >
          <option value="ALL">Todos os status</option>
          {STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <section className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-semibold">Rastreamento ao vivo</h2>
          <span className="text-xs text-muted-foreground">
            {activeTracking.length} entrega{activeTracking.length === 1 ? '' : 's'} ativa
            {activeTracking.length === 1 ? '' : 's'}
          </span>
        </div>
        {trackingQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando rastreamento...</p>
        ) : trackingQuery.isError ? (
          <p className="text-sm text-destructive">
            Não foi possível atualizar o rastreamento ao vivo.
          </p>
        ) : activeTracking.length === 0 ? (
          <Card className="premium-panel">
            <CardContent className="py-4 text-sm text-muted-foreground">
              Nenhuma entrega em andamento com rastreamento.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-2 md:grid-cols-2">
            {activeTracking.map((tracking) => (
              <Card key={tracking.deliveryId} className="interactive-card">
                <CardContent className="space-y-1 py-4 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <Link
                      className="font-medium hover:underline"
                      href={`/pedidos/${tracking.deliveryId}`}
                    >
                      Pedido #{tracking.displayNumber}
                    </Link>
                    <StatusChip status={tracking.status} />
                  </div>
                  <p className="text-muted-foreground">
                    Entregador: {tracking.driver.name} · {tracking.driver.phone}
                  </p>
                  {tracking.lastLocation ? (
                    <a
                      className="text-portal underline-offset-4 hover:text-portal-deep hover:underline"
                      href={mapsUrl(tracking.lastLocation.lat, tracking.lastLocation.lng)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Ver posição ({tracking.lastLocation.lat.toFixed(5)},{' '}
                      {tracking.lastLocation.lng.toFixed(5)}) ·{' '}
                      {trackingDateFormatter.format(new Date(tracking.lastLocation.capturedAt))}
                    </a>
                  ) : (
                    <p className="text-muted-foreground">Aguardando o primeiro ponto de GPS.</p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      {actionError && <p className="text-sm text-destructive">{actionError}</p>}

      {deliveriesQuery.isLoading && (
        <p className="text-sm text-muted-foreground">Carregando pedidos...</p>
      )}
      {deliveriesQuery.isError && (
        <p className="text-sm text-destructive">Não foi possível carregar os pedidos.</p>
      )}

      {deliveriesQuery.isSuccess && deliveries.length === 0 ? (
        <Card className="premium-panel">
          <CardContent className="flex flex-col items-center gap-2 py-16 text-muted-foreground">
            <Package className="size-8" />
            <p className="text-sm">Nenhum registro</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {deliveries.map((delivery) => (
            <Card
              key={delivery.id}
              className="order-list-card relative h-full overflow-hidden border-border/70 bg-card/90"
            >
              <span
                aria-hidden="true"
                className={`absolute inset-y-0 left-0 w-1 ${statusRailClass(delivery.status)}`}
              />
              <CardContent className="flex h-full flex-col gap-4 p-4 pl-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-mono text-sm font-bold text-foreground">
                      #{delivery.displayNumber}
                    </p>
                    <h3 className="mt-1 truncate text-sm font-semibold">
                      {delivery.serviceTypeName}
                    </h3>
                  </div>
                  <StatusChip status={delivery.status} />
                </div>

                {delivery.externalOrderNumber && (
                  <p className="-mt-2 truncate text-xs text-muted-foreground">
                    Referência: {delivery.externalOrderNumber}
                  </p>
                )}

                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <CalendarClock className="size-3.5 shrink-0 text-portal" />
                  <span className="truncate">
                    {delivery.scheduledAt ? 'Agendado para ' : 'Criado em '}
                    {orderDateFormatter.format(
                      new Date(delivery.scheduledAt ?? delivery.createdAt),
                    )}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-xl border border-border/65 bg-muted/35 p-2.5">
                    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      <Route className="size-3.5 text-portal" /> Distância
                    </div>
                    <p className="mt-1 text-sm font-semibold">
                      {delivery.distanceKm !== null ? `${delivery.distanceKm} km` : 'A calcular'}
                    </p>
                  </div>
                  <div className="rounded-xl border border-border/65 bg-muted/35 p-2.5">
                    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      <RotateCcw className="size-3.5 text-portal" /> Retorno
                    </div>
                    <p className="mt-1 text-sm font-semibold">
                      {delivery.requiresReturn ? 'Incluído' : 'Não'}
                    </p>
                  </div>
                </div>

                <div className="mt-auto flex items-end justify-between gap-3 border-t border-border/60 pt-3">
                  <div>
                    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      <ReceiptText className="size-3.5 text-portal" />
                      {delivery.paymentMethod === 'BILLED' ? 'Faturado' : 'Online'}
                    </div>
                    <p className="mt-1 text-base font-bold text-foreground">
                      {formatCurrency(delivery.totalValue)}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <Link
                    className={`inline-flex h-9 items-center justify-center rounded-lg border border-portal/20 bg-portal-soft px-3 text-xs font-semibold text-portal-deep shadow-sm transition-colors hover:border-portal/35 hover:bg-portal/15 ${
                      CANCELLABLE_STATUSES.includes(delivery.status) ? '' : 'col-span-2'
                    }`}
                    href={`/pedidos/${delivery.id}`}
                  >
                    Ver detalhes
                  </Link>
                  {CANCELLABLE_STATUSES.includes(delivery.status) && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full"
                      disabled={cancelMutation.isPending}
                      onClick={() => {
                        if (window.confirm(`Cancelar o pedido #${delivery.displayNumber}?`)) {
                          cancelMutation.mutate(delivery.id);
                        }
                      }}
                    >
                      {cancelMutation.isPending && cancelMutation.variables === delivery.id
                        ? 'Cancelando...'
                        : 'Cancelar'}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {deliveriesQuery.isSuccess && total > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
          <span>
            {total.toLocaleString('pt-BR')} pedido(s) · página {page} de {totalPages}
          </span>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
            >
              Anterior
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
            >
              Próxima
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
