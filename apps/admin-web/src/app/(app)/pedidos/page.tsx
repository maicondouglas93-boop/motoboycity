'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { DeliveryStatus } from '@motoboycity/types';
import { ApiError } from '@motoboycity/api-client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { deliveriesApi } from '@/lib/api-client';
import { session } from '@/lib/session';

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

export default function AdminOrdersPage() {
  const [statusFilter, setStatusFilter] = useState<DeliveryStatus | 'ALL'>('ALL');
  const [actionError, setActionError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const token = session.getToken();

  const deliveriesQuery = useQuery({
    queryKey: ['admin', 'deliveries', statusFilter],
    queryFn: () =>
      deliveriesApi.list(token as string, statusFilter === 'ALL' ? undefined : { status: statusFilter }),
    enabled: Boolean(token),
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => deliveriesApi.cancel(token as string, id),
    onSuccess: () => {
      setActionError(null);
      void queryClient.invalidateQueries({ queryKey: ['admin', 'deliveries'] });
    },
    onError: (error) => {
      setActionError(error instanceof ApiError ? error.message : 'Não foi possível cancelar o pedido.');
    },
  });

  if (!token) {
    return <p className="text-sm text-muted-foreground">Faça login como administrador para ver os pedidos.</p>;
  }

  const deliveries = deliveriesQuery.data ?? [];

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_260px]">
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Gerencie e visualize todos os pedidos realizados na plataforma
        </p>

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
