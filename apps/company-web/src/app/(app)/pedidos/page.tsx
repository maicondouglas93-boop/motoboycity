'use client';

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

export default function CompanyOrdersPage() {
  const [search, setSearch] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const token = session.getToken();

  const deliveriesQuery = useQuery({
    queryKey: ['deliveries'],
    queryFn: () => deliveriesApi.list(token as string),
    enabled: Boolean(token),
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => deliveriesApi.cancel(token as string, id),
    onSuccess: () => {
      setActionError(null);
      void queryClient.invalidateQueries({ queryKey: ['deliveries'] });
    },
    onError: (error) => {
      setActionError(error instanceof ApiError ? error.message : 'Não foi possível cancelar o pedido.');
    },
  });

  if (!token) {
    return <p className="text-sm text-muted-foreground">Faça login para ver os pedidos.</p>;
  }

  const deliveries = deliveriesQuery.data ?? [];
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
      </div>

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
                    {delivery.distanceKm !== null ? `${delivery.distanceKm} km` : 'Distância não calculada'}
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
      )}
    </div>
  );
}
