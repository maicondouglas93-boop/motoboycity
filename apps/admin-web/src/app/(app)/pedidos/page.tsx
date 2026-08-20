'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { DeliveryStatus } from '@motoboycity/types';
import { ApiError } from '@motoboycity/api-client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { deliveriesApi } from '@/lib/api-client';
import { session } from '@/lib/session';
import { useAdminActiveDeliveryTracking } from '@/lib/use-active-delivery-tracking';

const STATUS_FILTERS: { label: string; value: DeliveryStatus | 'ALL' }[] = [
  { label: 'Todos os Pedidos', value: 'ALL' },
  { label: 'Agendados', value: 'SCHEDULED' },
  { label: 'Buscando Entregador', value: 'AWAITING_DRIVER' },
  { label: 'Aceitos', value: 'ACCEPTED' },
  { label: 'Coletados', value: 'COLLECTED' },
  { label: 'Entregues', value: 'DELIVERED' },
  { label: 'Concluídos', value: 'COMPLETED' },
  { label: 'Cancelados', value: 'CANCELLED' },
  { label: 'Aguardando Pagamento', value: 'AWAITING_PAYMENT' },
];

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

const CANCELLABLE_STATUSES: DeliveryStatus[] = [
  'SCHEDULED',
  'AWAITING_DRIVER',
  'ACCEPTED',
  'COLLECTED',
  'DELIVERED',
  'AWAITING_PAYMENT',
];

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

export default function AdminOrdersPage() {
  const [statusFilter, setStatusFilter] = useState<DeliveryStatus | 'ALL'>('ALL');
  const [actionError, setActionError] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const trackingQuery = useAdminActiveDeliveryTracking();

  const token = session.getToken();

  const deliveriesQuery = useQuery({
    queryKey: ['admin', 'deliveries', statusFilter],
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
      void queryClient.invalidateQueries({ queryKey: ['admin', 'deliveries'] });
    },
    onError: (error) => {
      setActionError(
        error instanceof ApiError ? error.message : 'Não foi possível cancelar o pedido.',
      );
    },
  });

  if (!token) {
    return (
      <p className="text-sm text-muted-foreground">
        Faça login como administrador para ver os pedidos.
      </p>
    );
  }

  const deliveries = deliveriesQuery.data ?? [];
  const activeTracking = trackingQuery.data ?? [];

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_260px]">
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Gerencie e visualize todos os pedidos realizados na plataforma
        </p>

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
                Nenhuma entrega com rastreamento ativo.
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
                      {tracking.companyName} · {tracking.driver.name}
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
        {deliveriesQuery.isSuccess && deliveries.length === 0 && (
          <Card>
            <CardContent className="py-16 text-center text-sm text-muted-foreground">
              Nenhum pedido encontrado.
            </CardContent>
          </Card>
        )}

        <div className="space-y-2">
          {deliveries.map((delivery) => (
            <Card key={delivery.id}>
              <CardContent className="flex items-center justify-between py-4">
                <div>
                  <p className="font-medium">
                    #{delivery.displayNumber} — {delivery.companyName}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {delivery.serviceTypeName} ·{' '}
                    {delivery.distanceKm !== null ? `${delivery.distanceKm} km` : 'sem distância'}
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
                    Detalhes
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
      </div>

      <Card className="h-fit">
        <CardContent className="space-y-1 pt-6">
          {STATUS_FILTERS.map(({ label, value }) => (
            <button
              key={value}
              onClick={() => setStatusFilter(value)}
              className={`flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-accent ${
                statusFilter === value ? 'bg-accent font-medium' : ''
              }`}
            >
              {label}
            </button>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
