'use client';

import Link from 'next/link';
import { use } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { DeliveryAddressItem } from '@motoboycity/types';
import { AlertCircle, ChevronLeft } from 'lucide-react';
import { ApiError } from '@motoboycity/api-client';
import { StatusChip, statusLabel } from '@/components/orders/status-chip';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatCard } from '@/components/stat-card';
import { OrderDetailMap } from '@/components/operations/order-detail-map';
import { deliveriesApi, trackingApi } from '@/lib/api-client';
import { session } from '@/lib/session';

const currencyFormatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const dateFormatter = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

function formatCurrency(value: number | null): string {
  return value === null ? 'A calcular na entrega' : currencyFormatter.format(value);
}

function formatDate(value: string | null): string {
  return value ? dateFormatter.format(new Date(value)) : '—';
}

function formatAddress(address: DeliveryAddressItem): string {
  const firstLine =
    [address.street, address.number].filter(Boolean).join(', ') || 'Endereço não informado';
  return [
    firstLine,
    address.complement,
    [address.city, address.state].filter(Boolean).join(' - '),
    address.zip,
  ]
    .filter(Boolean)
    .join(' · ');
}

function mapsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}

function customerPaymentLabel(method: 'PREPAID' | 'CARD' | 'CASH' | 'PIX' | null): string {
  return method === 'PREPAID'
    ? 'Pré-pago'
    : method === 'CARD'
      ? 'Cartão'
      : method === 'CASH'
        ? 'Dinheiro'
        : method === 'PIX'
          ? 'Pix'
          : 'Não informado';
}

function durationLabel(from: string, to: string): string {
  const minutes = Math.max(
    0,
    Math.round((new Date(to).getTime() - new Date(from).getTime()) / 60_000),
  );
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)}h ${minutes % 60}min`;
}

export default function CompanyOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const token = session.getToken();
  const queryClient = useQueryClient();
  const deliveryQuery = useQuery({
    queryKey: ['company', 'delivery', id],
    queryFn: () => deliveriesApi.detail(token as string, id),
    enabled: Boolean(token),
  });
  const trackingQuery = useQuery({
    queryKey: ['company', 'tracking', id],
    queryFn: () => trackingApi.detail(token as string, id, { limit: 500 }),
    enabled: Boolean(token),
    refetchInterval:
      deliveryQuery.data?.status === 'ACCEPTED' ||
      deliveryQuery.data?.status === 'COLLECTED' ||
      deliveryQuery.data?.status === 'DELIVERED'
        ? 30_000
        : false,
  });
  const groupQuery = useQuery({
    queryKey: ['company', 'delivery-group', id],
    queryFn: () => deliveriesApi.group(token as string, id),
    enabled: Boolean(token && deliveryQuery.data),
  });
  const cancelMutation = useMutation({
    mutationFn: () => deliveriesApi.cancel(token as string, id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['company', 'delivery', id] });
      void queryClient.invalidateQueries({ queryKey: ['deliveries'] });
    },
  });

  if (!token) {
    return <p className="text-sm text-muted-foreground">Faça login para consultar este pedido.</p>;
  }
  if (deliveryQuery.isLoading) {
    return <p className="text-sm text-muted-foreground">Carregando pedido...</p>;
  }
  if (deliveryQuery.isError || !deliveryQuery.data) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
        <AlertCircle className="size-4" /> Não foi possível carregar este pedido.
      </div>
    );
  }

  const delivery = deliveryQuery.data;
  const pickup = delivery.addresses.find((address) => address.type === 'PICKUP');
  const dropoff = delivery.addresses.find((address) => address.type === 'DROPOFF');
  const companyCanCancel = delivery.status === 'SCHEDULED' || delivery.status === 'AWAITING_DRIVER';

  return (
    <div className="space-y-6">
      <Link
        href="/pedidos"
        className="flex w-fit items-center gap-1 text-sm font-semibold text-portal transition-colors hover:text-portal-deep"
      >
        <ChevronLeft className="size-4" /> Voltar para pedidos
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Pedido #{delivery.displayNumber}</h1>
          <p className="text-sm text-muted-foreground">
            Criado em {formatDate(delivery.createdAt)} · {delivery.serviceTypeName}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StatusChip status={delivery.status} />
          {companyCanCancel && (
            <Button
              variant="outline"
              disabled={cancelMutation.isPending}
              onClick={() => cancelMutation.mutate()}
            >
              {cancelMutation.isPending ? 'Cancelando...' : 'Cancelar pedido'}
            </Button>
          )}
        </div>
      </header>

      {cancelMutation.isError && (
        <p className="text-sm text-destructive">
          {cancelMutation.error instanceof ApiError
            ? cancelMutation.error.message
            : 'Não foi possível cancelar o pedido.'}
        </p>
      )}

      <section className="grid grid-cols-2 gap-4 xl:grid-cols-5">
        <StatCard label="Valor do pedido" value={formatCurrency(delivery.totalValue)} />
        <StatCard
          label="Distância"
          value={
            delivery.distanceKm === null ? 'A calcular na entrega' : `${delivery.distanceKm} km`
          }
        />
        <StatCard
          label="Retorno"
          value={delivery.requiresReturn ? formatCurrency(delivery.returnValue) : 'Não'}
        />
        <StatCard
          label="Pagamento"
          value={delivery.paymentMethod === 'BILLED' ? 'Faturado' : 'Online'}
        />
        <StatCard label="Status atualizado" value={formatDate(delivery.statusChangedAt)} />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Destinatário e instruções</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              <span className="text-muted-foreground">Destinatário:</span>{' '}
              {delivery.recipientName ?? 'Não informado'}
            </p>
            <p>
              <span className="text-muted-foreground">Telefone:</span>{' '}
              {delivery.recipientPhone ?? 'Não informado'}
            </p>
            <p>
              <span className="text-muted-foreground">Número externo:</span>{' '}
              {delivery.externalOrderNumber ?? 'Não informado'}
            </p>
            <p>
              <span className="text-muted-foreground">Pagamento do cliente:</span>{' '}
              {customerPaymentLabel(delivery.customerPaymentMethod)}
            </p>
            {delivery.driverNote && (
              <p className="rounded-xl border border-portal/10 bg-portal-soft/45 p-2.5">
                {delivery.driverNote}
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Coleta</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>{pickup ? formatAddress(pickup) : 'Endereço de coleta não registrado'}</p>
            {pickup?.referenceNote && (
              <p className="text-muted-foreground">Referência: {pickup.referenceNote}</p>
            )}
            {pickup?.lat !== null && pickup?.lat !== undefined && (
              <p className="text-xs text-muted-foreground">
                GPS: {pickup.lat}, {pickup.lng}
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Entrega</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>{dropoff ? formatAddress(dropoff) : 'Destino será definido por GPS na entrega'}</p>
            {dropoff?.referenceNote && (
              <p className="text-muted-foreground">Referência: {dropoff.referenceNote}</p>
            )}
            {dropoff?.lat !== null && dropoff?.lat !== undefined && (
              <p className="text-xs text-muted-foreground">
                GPS: {dropoff.lat}, {dropoff.lng}
              </p>
            )}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Execução</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div>
              <p className="text-muted-foreground">Entregador</p>
              <p>
                {delivery.driver
                  ? `${delivery.driver.name} · ${delivery.driver.phone}`
                  : 'Aguardando atribuição'}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Agendamento</p>
              <p>{formatDate(delivery.scheduledAt)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Lote</p>
              {groupQuery.data && groupQuery.data.deliveries.length > 1 ? (
                <div className="flex flex-wrap gap-2">
                  {groupQuery.data.deliveries.map((item) => (
                    <Link
                      key={item.id}
                      className="text-portal hover:text-portal-deep hover:underline"
                      href={`/pedidos/${item.id}`}
                    >
                      #{item.displayNumber}
                    </Link>
                  ))}
                </div>
              ) : (
                <p>Pedido avulso</p>
              )}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Faturamento</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div>
              <p className="text-muted-foreground">Fatura vinculada</p>
              {delivery.invoice ? (
                <Link
                  className="text-portal underline-offset-4 hover:text-portal-deep hover:underline"
                  href={`/faturas/${delivery.invoice.id}`}
                >
                  {delivery.invoice.number} · {delivery.invoice.status}
                </Link>
              ) : (
                <p>Ainda não faturado</p>
              )}
            </div>
            <div>
              <p className="text-muted-foreground">Destino</p>
              <p>
                {delivery.destinationKnownAtCreation
                  ? 'Informado na criação'
                  : 'Capturado na conclusão'}
              </p>
            </div>
          </CardContent>
        </Card>
      </section>

      <section>
        <OrderDetailMap addresses={delivery.addresses} points={trackingQuery.data?.points ?? []} />
      </section>

      <section>
        <Card>
          <CardHeader>
            <CardTitle>Rastreamento GPS</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {trackingQuery.isLoading ? (
              <p className="text-muted-foreground">Carregando pontos de localização...</p>
            ) : trackingQuery.data?.lastLocation ? (
              <>
                <p>
                  Última posição:{' '}
                  <a
                    className="text-portal underline-offset-4 hover:text-portal-deep hover:underline"
                    href={mapsUrl(
                      trackingQuery.data.lastLocation.lat,
                      trackingQuery.data.lastLocation.lng,
                    )}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {trackingQuery.data.lastLocation.lat.toFixed(5)},{' '}
                    {trackingQuery.data.lastLocation.lng.toFixed(5)}
                  </a>{' '}
                  em {formatDate(trackingQuery.data.lastLocation.capturedAt)}
                </p>
                <p className="text-muted-foreground">
                  {trackingQuery.data.points.length} ponto(s) no período consultado. O histórico é
                  mantido por até 30 dias.
                </p>
                <div className="max-h-48 space-y-1 overflow-y-auto rounded-xl border border-portal/12 bg-portal-soft/25 p-2.5 text-xs">
                  {trackingQuery.data.points.map((point) => (
                    <a
                      key={point.id}
                      className="block text-portal underline-offset-4 hover:text-portal-deep hover:underline"
                      href={mapsUrl(point.lat, point.lng)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {formatDate(point.capturedAt)} · {point.lat.toFixed(5)},{' '}
                      {point.lng.toFixed(5)}
                    </a>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-muted-foreground">
                {trackingQuery.isError
                  ? 'Não foi possível carregar o rastreamento deste pedido.'
                  : 'Nenhum ponto de GPS foi registrado para este pedido.'}
              </p>
            )}
          </CardContent>
        </Card>
      </section>

      <section>
        <h2 className="mb-3 font-semibold">Histórico do pedido</h2>
        {delivery.statusHistory.length === 0 ? (
          <Card>
            <CardContent className="py-6 text-sm text-muted-foreground">
              Nenhum evento histórico registrado.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {delivery.statusHistory.map((entry, index) => (
              <Card key={`${entry.changedAt}-${index}`} className="order-list-card">
                <CardContent className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                  <div>
                    <p className="font-medium">
                      {entry.fromStatus ? `${statusLabel(entry.fromStatus)} → ` : ''}
                      {statusLabel(entry.toStatus)}
                    </p>
                    {entry.note && <p className="text-muted-foreground">{entry.note}</p>}
                  </div>
                  <div className="text-right text-muted-foreground">
                    <p>{formatDate(entry.changedAt)}</p>
                    {index > 0 && (
                      <p>
                        {durationLabel(
                          delivery.statusHistory[index - 1]!.changedAt,
                          entry.changedAt,
                        )}{' '}
                        desde a etapa anterior
                      </p>
                    )}
                    <p>{entry.changedBy?.name ?? 'Evento do sistema'}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
