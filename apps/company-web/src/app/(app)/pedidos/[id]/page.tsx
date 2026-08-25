'use client';

import Link from 'next/link';
import { use, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { DeliveryAddressItem } from '@motoboycity/types';
import {
  AlertCircle,
  ArrowRight,
  Bike,
  Building2,
  CalendarClock,
  ChevronLeft,
  Clock3,
  CreditCard,
  FileText,
  MapPin,
  PackageCheck,
  Phone,
  ReceiptText,
  Route,
  UserRound,
  WalletCards,
} from 'lucide-react';
import { ApiError } from '@motoboycity/api-client';
import { StatusChip, statusLabel, statusRailClass } from '@/components/orders/status-chip';
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

function DetailField({
  label,
  icon,
  children,
  className = '',
}: {
  label: string;
  icon: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`min-w-0 rounded-xl border border-portal/10 bg-portal-soft/45 p-3 ${className}`}
    >
      <p className="flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.1em] text-muted-foreground uppercase">
        <span className="text-portal">{icon}</span>
        {label}
      </p>
      <div className="mt-1.5 min-w-0 text-sm font-medium text-portal-deep">{children}</div>
    </div>
  );
}

export default function CompanyOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const token = session.getToken();
  const queryClient = useQueryClient();
  const deliveryQuery = useQuery({
    queryKey: ['company', 'delivery', id],
    queryFn: () => deliveriesApi.detail(token as string, id),
    enabled: Boolean(token),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === 'COMPLETED' || status === 'CANCELLED' ? false : 10_000;
    },
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
              onClick={() => {
                if (window.confirm(`Cancelar o pedido #${delivery.displayNumber}?`)) {
                  cancelMutation.mutate();
                }
              }}
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

      <section className="grid items-stretch gap-4 xl:grid-cols-3">
        <Card size="sm" className="premium-panel h-full">
          <CardHeader className="border-b border-portal/10 pb-3">
            <CardTitle className="flex items-center gap-2">
              <UserRound className="size-4 text-portal" aria-hidden="true" />
              Destinatário e instruções
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-2">
            <DetailField label="Destinatário" icon={<UserRound className="size-3" />}>
              {delivery.recipientName ?? 'Não informado'}
            </DetailField>
            <DetailField label="Telefone" icon={<Phone className="size-3" />}>
              {delivery.recipientPhone ?? 'Não informado'}
            </DetailField>
            <DetailField label="Número externo" icon={<FileText className="size-3" />}>
              {delivery.externalOrderNumber ?? 'Não informado'}
            </DetailField>
            <DetailField label="Pagamento do cliente" icon={<WalletCards className="size-3" />}>
              {customerPaymentLabel(delivery.customerPaymentMethod)}
            </DetailField>
            {delivery.driverNote && (
              <div className="rounded-xl border border-status-rota/20 bg-status-rota/10 p-3 text-sm sm:col-span-2">
                <p className="text-[10px] font-semibold tracking-[0.1em] text-[#8a5200] uppercase">
                  Instrução ao entregador
                </p>
                <p className="mt-1.5">{delivery.driverNote}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card size="sm" className="premium-panel h-full">
          <CardHeader className="border-b border-portal/10 pb-3">
            <CardTitle className="flex items-center gap-2">
              <Route className="size-4 text-portal" aria-hidden="true" /> Operação
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-2">
            <DetailField label="Modalidade" icon={<Bike className="size-3" />}>
              {delivery.serviceTypeName}
            </DetailField>
            <DetailField label="Status atualizado" icon={<Clock3 className="size-3" />}>
              {formatDate(delivery.statusChangedAt)}
            </DetailField>
            <DetailField label="Agendamento" icon={<CalendarClock className="size-3" />}>
              {formatDate(delivery.scheduledAt)}
            </DetailField>
            <DetailField label="Entregador" icon={<UserRound className="size-3" />}>
              <span
                className="block truncate"
                title={
                  delivery.driver
                    ? `${delivery.driver.name} · ${delivery.driver.phone}`
                    : 'Aguardando atribuição'
                }
              >
                {delivery.driver
                  ? `${delivery.driver.name} · ${delivery.driver.phone}`
                  : 'Aguardando atribuição'}
              </span>
            </DetailField>
          </CardContent>
        </Card>

        <Card size="sm" className="premium-panel h-full">
          <CardHeader className="border-b border-portal/10 pb-3">
            <CardTitle className="flex items-center gap-2">
              <ReceiptText className="size-4 text-portal" aria-hidden="true" /> Faturamento
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-2">
            <DetailField label="Método" icon={<CreditCard className="size-3" />}>
              {delivery.paymentMethod === 'BILLED' ? 'Faturado' : 'Online'}
            </DetailField>
            <DetailField label="Fatura" icon={<ReceiptText className="size-3" />}>
              {delivery.invoice ? (
                <Link
                  className="block truncate text-portal underline-offset-4 hover:text-portal-deep hover:underline"
                  href={`/faturas/${delivery.invoice.id}`}
                  title={`${delivery.invoice.number} · ${delivery.invoice.status}`}
                >
                  {delivery.invoice.number} · {delivery.invoice.status}
                </Link>
              ) : (
                'Ainda não faturado'
              )}
            </DetailField>
            <DetailField label="Tipo de destino" icon={<MapPin className="size-3" />}>
              {delivery.destinationKnownAtCreation
                ? 'Informado na criação'
                : 'Capturado na conclusão'}
            </DetailField>
            <DetailField label="Lote" icon={<PackageCheck className="size-3" />}>
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
                'Pedido avulso'
              )}
            </DetailField>
          </CardContent>
        </Card>
      </section>

      <section className="grid items-stretch gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(380px,0.55fr)]">
        <OrderDetailMap addresses={delivery.addresses} points={trackingQuery.data?.points ?? []} />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
          <Card size="sm" className="premium-panel h-full">
            <CardHeader className="border-b border-portal/10 pb-3">
              <CardTitle className="flex items-center gap-2">
                <Building2 className="size-4 text-portal" aria-hidden="true" /> Coleta
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p className="font-medium text-portal-deep">
                {pickup ? formatAddress(pickup) : 'Endereço de coleta não registrado'}
              </p>
              {pickup?.referenceNote && (
                <p className="text-muted-foreground">Referência: {pickup.referenceNote}</p>
              )}
              {pickup?.lat !== null &&
                pickup?.lat !== undefined &&
                pickup.lng !== null &&
                pickup.lng !== undefined && (
                  <a
                    className="inline-flex items-center gap-1 text-xs font-medium text-portal hover:text-portal-deep hover:underline"
                    href={mapsUrl(pickup.lat, pickup.lng)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <MapPin className="size-3" aria-hidden="true" />
                    {pickup.lat}, {pickup.lng}
                  </a>
                )}
            </CardContent>
          </Card>

          <Card size="sm" className="premium-panel h-full">
            <CardHeader className="border-b border-portal/10 pb-3">
              <CardTitle className="flex items-center gap-2">
                <MapPin className="size-4 text-portal" aria-hidden="true" /> Entrega
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p className="font-medium text-portal-deep">
                {dropoff ? formatAddress(dropoff) : 'Destino será definido por GPS na entrega'}
              </p>
              {dropoff?.referenceNote && (
                <p className="text-muted-foreground">Referência: {dropoff.referenceNote}</p>
              )}
              {dropoff?.lat !== null &&
                dropoff?.lat !== undefined &&
                dropoff.lng !== null &&
                dropoff.lng !== undefined && (
                  <a
                    className="inline-flex items-center gap-1 text-xs font-medium text-portal hover:text-portal-deep hover:underline"
                    href={mapsUrl(dropoff.lat, dropoff.lng)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <MapPin className="size-3" aria-hidden="true" />
                    {dropoff.lat}, {dropoff.lng}
                  </a>
                )}
            </CardContent>
          </Card>
        </div>
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
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 font-semibold">
            <Clock3 className="size-4 text-portal" aria-hidden="true" /> Histórico do pedido
          </h2>
          <span className="rounded-full bg-portal-soft px-2.5 py-1 text-xs font-medium text-portal">
            {delivery.statusHistory.length} etapa
            {delivery.statusHistory.length === 1 ? '' : 's'}
          </span>
        </div>
        {delivery.statusHistory.length === 0 ? (
          <Card>
            <CardContent className="py-6 text-sm text-muted-foreground">
              Nenhum evento histórico registrado.
            </CardContent>
          </Card>
        ) : (
          <div className="grid items-stretch gap-3 sm:grid-cols-2 xl:grid-cols-3 min-[1700px]:grid-cols-5">
            {delivery.statusHistory.map((entry, index) => (
              <Card
                key={`${entry.changedAt}-${index}`}
                size="sm"
                className="order-list-card h-full min-w-0 border-portal/15"
              >
                <span
                  aria-hidden="true"
                  className={`absolute inset-y-0 left-0 w-1 ${statusRailClass(entry.toStatus)}`}
                />
                <CardContent className="flex h-full min-w-0 flex-col gap-3 pl-4 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-portal-soft text-xs font-bold text-portal">
                      {index + 1}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      {formatDate(entry.changedAt)}
                    </span>
                  </div>

                  <div className="min-w-0">
                    {entry.fromStatus && (
                      <p className="truncate text-xs text-muted-foreground">
                        {statusLabel(entry.fromStatus)}
                      </p>
                    )}
                    <p className="mt-0.5 flex items-center gap-1.5 font-semibold text-portal-deep">
                      {entry.fromStatus && (
                        <ArrowRight className="size-3.5 shrink-0 text-portal" aria-hidden="true" />
                      )}
                      <span className="truncate" title={statusLabel(entry.toStatus)}>
                        {statusLabel(entry.toStatus)}
                      </span>
                    </p>
                  </div>

                  {entry.note && (
                    <p className="rounded-lg bg-muted/70 p-2 text-xs text-muted-foreground">
                      {entry.note}
                    </p>
                  )}

                  <div className="mt-auto space-y-1 border-t border-portal/10 pt-2 text-[11px] text-muted-foreground">
                    {index > 0 && (
                      <p className="flex items-center gap-1.5">
                        <Clock3 className="size-3 text-portal" aria-hidden="true" />
                        {durationLabel(
                          delivery.statusHistory[index - 1]!.changedAt,
                          entry.changedAt,
                        )}{' '}
                        desde a etapa anterior
                      </p>
                    )}
                    <p className="flex items-center gap-1.5">
                      <UserRound className="size-3 text-portal" aria-hidden="true" />
                      <span className="truncate">
                        {entry.changedBy?.name ?? 'Evento do sistema'}
                      </span>
                    </p>
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
