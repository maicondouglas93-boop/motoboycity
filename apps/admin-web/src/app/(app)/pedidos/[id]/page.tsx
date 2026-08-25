'use client';

import Link from 'next/link';
import { use, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { DeliveryAddressItem, DeliveryStatus } from '@motoboycity/types';
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
import { CancelDeliveryDialog } from '@/components/operations/cancel-delivery-dialog';
import { StatusChip, statusLabel, statusRailClass } from '@/components/orders/status-chip';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatCard } from '@/components/stat-card';
import { OrderDetailMap } from '@/components/operations/order-detail-map';
import { DeliveryOverrides } from '@/components/operations/delivery-overrides';
import { EditDeliveryDialog } from '@/components/deliveries/edit-delivery-dialog';
import { adminOperationsApi, deliveriesApi, trackingApi } from '@/lib/api-client';
import { session } from '@/lib/session';
import { useMoney } from '@/lib/money';

const dateFormatter = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

const cancellableStatuses: DeliveryStatus[] = [
  'SCHEDULED',
  'AWAITING_DRIVER',
  'ACCEPTED',
  'COLLECTED',
  'DELIVERED',
  'AWAITING_PAYMENT',
];

function formatDate(value: string | null): string {
  return value ? dateFormatter.format(new Date(value)) : '—';
}

function formatAddress(address: DeliveryAddressItem): string {
  const firstLine =
    [address.street, address.number].filter(Boolean).join(', ') || 'Endereço não informado';
  const cityLine = [address.city, address.state].filter(Boolean).join(' - ');
  return [firstLine, address.complement, cityLine, address.zip].filter(Boolean).join(' · ');
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

/**
 * Resposta da oferta em português. A trilha de despacho é lida por quem
 * investiga por que um pedido demorou — "DECLINED" não conta essa história.
 */
const offerResponseLabel: Record<string, string> = {
  PENDING: 'Aguardando resposta',
  ACCEPTED: 'Aceitou',
  DECLINED: 'Recusou',
  EXPIRED: 'Expirou',
};

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
      className={`min-w-0 rounded-xl border border-primary/10 bg-admin-soft/45 p-3 ${className}`}
    >
      <p className="flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.1em] text-muted-foreground uppercase">
        <span className="text-primary">{icon}</span>
        {label}
      </p>
      <div className="mt-1.5 min-w-0 text-sm font-medium text-admin-deep">{children}</div>
    </div>
  );
}

export default function AdminOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const money = useMoney();
  const { id } = use(params);
  const token = session.getToken();
  const queryClient = useQueryClient();
  const deliveryQuery = useQuery({
    queryKey: ['admin', 'delivery', id],
    queryFn: () => deliveriesApi.detail(token as string, id),
    enabled: Boolean(token),
  });
  const trackingQuery = useQuery({
    queryKey: ['admin', 'tracking', id],
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
    queryKey: ['admin', 'delivery-group', id],
    queryFn: () => deliveriesApi.group(token as string, id),
    enabled: Boolean(token && deliveryQuery.data),
  });
  const dispatchAuditQuery = useQuery({
    queryKey: ['admin', 'delivery-dispatch-audit', id],
    queryFn: () => adminOperationsApi.dispatchAudit(token as string, id),
    enabled: Boolean(token),
  });
  const cancelMutation = useMutation({
    mutationFn: () => deliveriesApi.cancel(token as string, id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'delivery', id] });
      void queryClient.invalidateQueries({ queryKey: ['admin', 'deliveries'] });
      void queryClient.invalidateQueries({ queryKey: ['admin', 'driver-deliveries'] });
    },
  });

  if (!token) {
    return (
      <p className="text-sm text-muted-foreground">
        Faça login como administrador para ver o pedido.
      </p>
    );
  }
  if (deliveryQuery.isLoading) {
    return <p className="text-sm text-muted-foreground">Carregando pedido...</p>;
  }
  if (deliveryQuery.isError || !deliveryQuery.data) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
        <AlertCircle className="size-4" /> Não foi possível carregar o pedido.
      </div>
    );
  }

  const delivery = deliveryQuery.data;
  const pickup = delivery.addresses.find((address) => address.type === 'PICKUP');
  const dropoff = delivery.addresses.find((address) => address.type === 'DROPOFF');

  return (
    <div className="space-y-4">
      <Link href="/pedidos" className="flex w-fit items-center gap-1 text-sm text-muted-foreground">
        <ChevronLeft className="size-4" /> Voltar para pedidos
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Pedido #{delivery.displayNumber}</h1>
          <p className="text-sm text-muted-foreground">
            {delivery.companyName} · criado em {formatDate(delivery.createdAt)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StatusChip status={delivery.status} />
          {(delivery.status === 'SCHEDULED' || delivery.status === 'AWAITING_DRIVER') &&
            !delivery.batchId && <EditDeliveryDialog accessToken={token} delivery={delivery} />}
          {cancellableStatuses.includes(delivery.status) && (
            <CancelDeliveryDialog
              token={token}
              deliveryId={delivery.id}
              displayNumber={delivery.displayNumber}
              companyName={delivery.companyName}
              status={delivery.status}
              driverName={delivery.driver?.name}
            />
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
        <StatCard label="Valor total" value={money(delivery.totalValue)} />
        <StatCard label="Repasse" value={money(delivery.driverValue)} />
        <StatCard label="Receita plataforma" value={money(delivery.platformValue)} />
        <StatCard
          label="Distância"
          value={delivery.distanceKm === null ? 'Não calculada' : `${delivery.distanceKm} km`}
        />
        <StatCard
          label="Retorno"
          value={delivery.requiresReturn ? money(delivery.returnValue) : 'Não'}
        />
      </section>

      {/*
        As intervencoes ficam antes dos detalhes de propostito: quem abriu esta
        pagina por causa de um pedido travado veio para agir, nao para ler.
        O componente some sozinho quando nenhuma acao e possivel no estado atual.
      */}
      <DeliveryOverrides delivery={delivery} />

      <section className="grid items-stretch gap-4 xl:grid-cols-3">
        <Card size="sm" className="premium-panel h-full">
          <CardHeader className="border-b border-primary/10 pb-3">
            <CardTitle className="flex items-center gap-2">
              <UserRound className="size-4 text-primary" aria-hidden="true" />
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
          <CardHeader className="border-b border-primary/10 pb-3">
            <CardTitle className="flex items-center gap-2">
              <Route className="size-4 text-primary" aria-hidden="true" /> Operação
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
              {delivery.driver ? (
                <Link
                  className="block truncate text-primary underline-offset-4 hover:underline"
                  href={`/entregadores/${delivery.driver.id}`}
                  title={`${delivery.driver.name} · ${delivery.driver.phone}`}
                >
                  {delivery.driver.name} · {delivery.driver.phone}
                </Link>
              ) : (
                'Sem entregador vinculado'
              )}
            </DetailField>
          </CardContent>
        </Card>

        <Card size="sm" className="premium-panel h-full">
          <CardHeader className="border-b border-primary/10 pb-3">
            <CardTitle className="flex items-center gap-2">
              <ReceiptText className="size-4 text-primary" aria-hidden="true" /> Faturamento
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-2">
            <DetailField label="Método" icon={<CreditCard className="size-3" />}>
              {delivery.paymentMethod === 'BILLED' ? 'Faturado' : 'Online'}
            </DetailField>
            <DetailField label="Fatura" icon={<ReceiptText className="size-3" />}>
              {delivery.invoice ? (
                <Link
                  className="text-primary underline-offset-4 hover:underline"
                  href={`/faturas/${delivery.invoice.id}`}
                >
                  {delivery.invoice.number} · {delivery.invoice.status}
                </Link>
              ) : (
                'Sem fatura vinculada'
              )}
            </DetailField>
            <DetailField label="Tipo de destino" icon={<MapPin className="size-3" />}>
              {delivery.destinationKnownAtCreation
                ? 'Informado na criação'
                : 'Definido por GPS na entrega'}
            </DetailField>
            <DetailField label="Lote" icon={<PackageCheck className="size-3" />}>
              {groupQuery.data && groupQuery.data.deliveries.length > 1 ? (
                <div className="flex flex-wrap gap-2">
                  {groupQuery.data.deliveries.map((item) => (
                    <Link
                      key={item.id}
                      className="text-primary hover:underline"
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
            <CardHeader className="border-b border-primary/10 pb-3">
              <CardTitle className="flex items-center gap-2">
                <Building2 className="size-4 text-primary" aria-hidden="true" /> Coleta
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p className="font-medium text-admin-deep">
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
                    className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
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
            <CardHeader className="border-b border-primary/10 pb-3">
              <CardTitle className="flex items-center gap-2">
                <MapPin className="size-4 text-primary" aria-hidden="true" /> Entrega
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p className="font-medium text-admin-deep">
                {dropoff ? formatAddress(dropoff) : 'Endereço de entrega ainda não registrado'}
              </p>
              {dropoff?.referenceNote && (
                <p className="text-muted-foreground">Referência: {dropoff.referenceNote}</p>
              )}
              {dropoff?.lat !== null &&
                dropoff?.lat !== undefined &&
                dropoff.lng !== null &&
                dropoff.lng !== undefined && (
                  <a
                    className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
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

      <section className="grid items-start gap-4 xl:grid-cols-2">
        <Card size="sm" className="premium-panel">
          <CardHeader className="border-b border-primary/10 pb-3">
            <CardTitle className="flex items-center gap-2">
              <MapPin className="size-4 text-primary" aria-hidden="true" /> Rastreamento GPS
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {trackingQuery.isLoading ? (
              <p className="text-muted-foreground">Carregando pontos de localização...</p>
            ) : trackingQuery.data?.lastLocation ? (
              <>
                <p>
                  Última posição:{' '}
                  <a
                    className="text-primary underline-offset-4 hover:underline"
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
                <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border p-2 text-xs">
                  {trackingQuery.data.points.map((point) => (
                    <a
                      key={point.id}
                      className="block text-primary underline-offset-4 hover:underline"
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

        <Card size="sm" className="premium-panel">
          <CardHeader className="border-b border-primary/10 pb-3">
            <CardTitle className="flex items-center gap-2">
              <Bike className="size-4 text-primary" aria-hidden="true" /> Auditoria do despacho
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {dispatchAuditQuery.data?.offers.map((offer) => (
              <div
                key={offer.id}
                className="flex flex-wrap items-center justify-between gap-2 border-t py-2 first:border-0"
              >
                <Link
                  className="text-primary hover:underline"
                  href={`/entregadores/${offer.driver.id}`}
                >
                  {offer.driver.name}
                </Link>
                <span>{offerResponseLabel[offer.response]}</span>
                <span className="text-muted-foreground">
                  {formatDate(offer.offeredAt)}
                  {offer.respondedAt ? ` → ${formatDate(offer.respondedAt)}` : ''}
                </span>
              </div>
            ))}
            {dispatchAuditQuery.data?.offers.length === 0 && (
              <p className="text-muted-foreground">Nenhuma oferta registrada.</p>
            )}
          </CardContent>
        </Card>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 font-semibold">
            <Clock3 className="size-4 text-primary" aria-hidden="true" /> Histórico do pedido
          </h2>
          <span className="rounded-full bg-admin-soft px-2.5 py-1 text-xs font-medium text-primary">
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
                className="order-list-card h-full min-w-0 border-primary/15"
              >
                <span
                  aria-hidden="true"
                  className={`absolute inset-y-0 left-0 w-1 ${statusRailClass(entry.toStatus)}`}
                />
                <CardContent className="flex h-full min-w-0 flex-col gap-3 pl-4 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-admin-soft text-xs font-bold text-primary">
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
                    <p className="mt-0.5 flex items-center gap-1.5 font-semibold text-admin-deep">
                      {entry.fromStatus && (
                        <ArrowRight className="size-3.5 shrink-0 text-primary" aria-hidden="true" />
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

                  <div className="mt-auto space-y-1 border-t border-primary/10 pt-2 text-[11px] text-muted-foreground">
                    {index > 0 && (
                      <p className="flex items-center gap-1.5">
                        <Clock3 className="size-3 text-primary" aria-hidden="true" />
                        {durationLabel(
                          delivery.statusHistory[index - 1]!.changedAt,
                          entry.changedAt,
                        )}{' '}
                        desde a etapa anterior
                      </p>
                    )}
                    <p className="flex items-center gap-1.5">
                      <UserRound className="size-3 text-primary" aria-hidden="true" />
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
