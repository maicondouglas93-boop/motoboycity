'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Package } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { DeliveryListItem, DeliveryStatus } from '@motoboycity/types';
import { ApiError } from '@motoboycity/api-client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { deliveriesApi } from '@/lib/api-client';
import { session } from '@/lib/session';
import { useCompanyActiveDeliveryTracking } from '@/lib/use-active-delivery-tracking';

const statusLabel: Record<DeliveryStatus, string> = {
  SCHEDULED: 'Agendado',
  AWAITING_DRIVER: 'Buscando entregador',
  ACCEPTED: 'Aceito',
  COLLECTED: 'Coletado',
  DELIVERED: 'Entregue',
  COMPLETED: 'Concluído',
  CANCELLED: 'Cancelado',
  AWAITING_PAYMENT: 'Aguardando pagamento',
};

const statusVariant: Record<DeliveryStatus, 'outline' | 'default' | 'destructive' | 'secondary'> = {
  SCHEDULED: 'outline',
  AWAITING_DRIVER: 'outline',
  ACCEPTED: 'default',
  COLLECTED: 'default',
  DELIVERED: 'default',
  COMPLETED: 'secondary',
  CANCELLED: 'destructive',
  AWAITING_PAYMENT: 'outline',
};

const CANCELLABLE_STATUSES: DeliveryStatus[] = ['SCHEDULED', 'AWAITING_DRIVER'];

function formatCurrency(value: number | null): string {
  if (value === null) {
    return 'A calcular na entrega';
  }
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

const trackingDateFormatter = new Intl.DateTimeFormat('pt-BR', {
  hour: '2-digit',
  minute: '2-digit',
});

function mapsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}

export default function CompanyOrdersPage() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<DeliveryStatus | 'ALL'>('ALL');
  const [actionError, setActionError] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const trackingQuery = useCompanyActiveDeliveryTracking();

  const token = session.getToken();

  const deliveriesQuery = useQuery({
    queryKey: ['deliveries', statusFilter],
    queryFn: () =>
      deliveriesApi.list(
        token as string,
        statusFilter === 'ALL' ? undefined : { status: statusFilter },
      ),
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

  const deliveries = deliveriesQuery.data ?? [];
  const activeTracking = trackingQuery.data ?? [];
  const filteredDeliveries = deliveries.filter((delivery: DeliveryListItem) =>
    `${delivery.displayNumber} ${delivery.serviceTypeName}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Input
          placeholder="Buscar pedido..."
          className="max-w-xs"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <select
          aria-label="Filtrar status dos pedidos"
          className="h-9 rounded-md border bg-background px-3 text-sm"
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value as DeliveryStatus | 'ALL')}
        >
          <option value="ALL">Todos os status</option>
          {Object.entries(statusLabel).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
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
        ) : activeTracking.length === 0 ? (
          <Card>
            <CardContent className="py-4 text-sm text-muted-foreground">
              Nenhuma entrega em andamento com rastreamento.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-2 md:grid-cols-2">
            {activeTracking.map((tracking) => (
              <Card key={tracking.deliveryId}>
                <CardContent className="space-y-1 py-4 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <Link
                      className="font-medium hover:underline"
                      href={`/pedidos/${tracking.deliveryId}`}
                    >
                      Pedido #{tracking.displayNumber}
                    </Link>
                    <Badge variant="default">{statusLabel[tracking.status]}</Badge>
                  </div>
                  <p className="text-muted-foreground">
                    Entregador: {tracking.driver.name} · {tracking.driver.phone}
                  </p>
                  {tracking.lastLocation ? (
                    <a
                      className="text-primary underline-offset-4 hover:underline"
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

      {deliveriesQuery.isSuccess && filteredDeliveries.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-16 text-muted-foreground">
            <Package className="size-8" />
            <p className="text-sm">Nenhum registro</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filteredDeliveries.map((delivery) => (
            <Card key={delivery.id}>
              <CardContent className="flex items-center justify-between py-4">
                <div>
                  <p className="font-medium">
                    #{delivery.displayNumber} — {delivery.serviceTypeName}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {delivery.distanceKm !== null
                      ? `${delivery.distanceKm} km`
                      : 'Distância não calculada'}
                    {delivery.requiresReturn && ' · com retorno'}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <Badge variant={statusVariant[delivery.status]}>
                      {statusLabel[delivery.status]}
                    </Badge>
                    <p className="font-medium">{formatCurrency(delivery.totalValue)}</p>
                  </div>
                  <Link
                    className="inline-flex h-8 items-center rounded-md border px-3 text-xs font-medium hover:bg-accent"
                    href={`/pedidos/${delivery.id}`}
                  >
                    Ver detalhes
                  </Link>
                  {CANCELLABLE_STATUSES.includes(delivery.status) && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={cancelMutation.isPending}
                      onClick={() => cancelMutation.mutate(delivery.id)}
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
    </div>
  );
}
