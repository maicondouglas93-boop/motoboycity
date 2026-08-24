'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { DeliveryStatus, OperationalDeliveryItem } from '@motoboycity/types';
import { io } from 'socket.io-client';
import {
  AlertTriangle,
  Bike,
  Building2,
  ChevronDown,
  ChevronRight,
  Clock3,
  Layers3,
  ListFilter,
  MapPin,
  Radio,
  Route,
  Search,
  WalletCards,
  Wifi,
  WifiOff,
} from 'lucide-react';
import {
  AdminOperationsMap,
  type AdminMapSelection,
  type MapMode,
} from '@/components/operations/admin-operations-map';
import {
  StatusChip,
  STATUS_OPTIONS,
  statusLabel,
  statusRailClass,
} from '@/components/orders/status-chip';
import { ElapsedTime } from '@/components/orders/elapsed-time';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import {
  adminCompaniesApi,
  adminDriversApi,
  adminOperationsApi,
  adminPlatformSettingsApi,
  baseUrl,
  deliveriesApi,
} from '@/lib/api-client';
import { formatRelativeTime } from '@/lib/format';
import { session } from '@/lib/session';
import { useAdminActivityFeed } from '@/lib/use-admin-activity-feed';
import { operationTime } from '@/lib/operation-clock';
import { CompanyQueues } from '@/components/operations/company-queues';
import { SilentDrivers } from '@/components/operations/silent-drivers';
import { slaAlertMinutesFor } from '@/lib/sla';

const filterStatuses = STATUS_OPTIONS.map((option) => option.value).filter(
  (status) => status !== 'COMPLETED',
);
const sectionStatuses: DeliveryStatus[] = [
  'SCHEDULED',
  'AWAITING_DRIVER',
  'ACCEPTED',
  'COLLECTED',
  'DELIVERED',
  'FAILED',
  'AWAITING_PAYMENT',
  'CANCELLED',
];

const currencyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

function OperationRow({
  order,
  onSelect,
  hideCompany = false,
  grouped = false,
  selected = false,
  slaAlertMinutes = null,
}: {
  order: OperationalDeliveryItem;
  onSelect: () => void;
  /**
   * Dentro do grupo da empresa o nome ja esta no cabecalho. Repeti-lo em cada
   * linha rouba a largura que o nome do motoboy precisa numa tela densa.
   */
  hideCompany?: boolean;
  /** Remove o efeito de cards empilhados quando a linha ja vive num grupo. */
  grouped?: boolean;
  /** Destaca qual pedido esta aberto no mapa/painel lateral. */
  selected?: boolean;
  /** Minutos a partir dos quais o cronometro acende. Null = sem sinalizacao. */
  slaAlertMinutes?: number | null;
}) {
  const destination = order.addresses.find((address) => address.type === 'DROPOFF');
  const addressLabel =
    order.destinationKnownAtCreation && destination?.street
      ? [destination.street, destination.number].filter(Boolean).join(', ')
      : 'Destino definido na entrega';
  const totalLabel =
    order.totalValue === null ? 'A calcular' : currencyFormatter.format(order.totalValue);

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`group/order relative w-full overflow-hidden text-left text-xs transition-all focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none ${
        grouped
          ? 'rounded-none border-0 border-b border-border/65 bg-transparent px-3.5 py-3 last:border-b-0 hover:bg-admin-soft/45'
          : 'rounded-xl border border-border/80 bg-card/75 px-3.5 py-3 shadow-sm hover:-translate-y-0.5 hover:border-primary/25 hover:bg-card hover:shadow-md'
      } ${selected ? 'bg-admin-soft/75 ring-1 ring-inset ring-primary/25' : ''}`}
    >
      <span
        aria-hidden="true"
        className={`absolute inset-y-2 left-0 w-0.5 rounded-r-full ${statusRailClass(order.status)}`}
      />

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <strong className="font-mono text-[13px] text-admin-deep">#{order.displayNumber}</strong>
        <span className="inline-flex items-center gap-1 font-mono text-[10px] font-medium whitespace-nowrap text-muted-foreground">
          <Clock3 className="size-3" aria-hidden="true" />
          {operationTime(order.createdAt)}
        </span>
        <ElapsedTime
          since={order.statusChangedAt}
          alertAfterMinutes={slaAlertMinutes}
          className="rounded-full bg-muted/80 px-2 py-0.5 text-[10px] whitespace-nowrap ring-1 ring-inset ring-foreground/5"
        />
        <StatusChip status={order.status} className="ml-auto px-2 py-0.5 text-[10px]" />
      </div>

      <div className="mt-2 flex min-w-0 items-center gap-2">
        <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-admin-soft text-primary ring-1 ring-inset ring-primary/10">
          {hideCompany ? (
            <Bike className="size-3.5" aria-hidden="true" />
          ) : (
            <Building2 className="size-3.5" aria-hidden="true" />
          )}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-xs font-semibold text-foreground">
            {hideCompany ? (order.driver?.name ?? 'Sem motoboy') : order.companyName}
          </span>
          <span className="block truncate text-[10px] text-muted-foreground">
            {hideCompany
              ? order.serviceTypeName
              : (order.driver?.name ?? `${order.serviceTypeName} · sem motoboy`)}
          </span>
        </span>
      </div>

      <p className="mt-2 flex min-w-0 items-center gap-1.5 text-[10px] text-muted-foreground">
        <MapPin className="size-3 shrink-0 text-primary" aria-hidden="true" />
        <span className="truncate">{addressLabel}</span>
      </p>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
        <span className="inline-flex items-center gap-1 whitespace-nowrap">
          <Route className="size-3" aria-hidden="true" />
          {order.distanceKm === null ? 'Distância pendente' : `${order.distanceKm} km`}
        </span>
        <span className="inline-flex items-center gap-1 font-semibold whitespace-nowrap text-foreground">
          <WalletCards className="size-3 text-status-entregue" aria-hidden="true" />
          {totalLabel}
        </span>
        {order.requiresReturn && (
          <span className="rounded-full bg-admin-soft px-1.5 py-0.5 font-medium text-primary">
            Com retorno
          </span>
        )}
      </div>
    </button>
  );
}

type QueueMode = 'status' | 'company';

export default function AdminDashboardPage() {
  const token = session.getToken();
  const [queueMode, setQueueMode] = useState<QueueMode>('status');
  const queryClient = useQueryClient();
  const { events, connected: activityConnected } = useAdminActivityFeed();
  const [query, setQuery] = useState('');
  const [companyId, setCompanyId] = useState('');
  const [driverId, setDriverId] = useState('');
  const [statuses, setStatuses] = useState<DeliveryStatus[]>([]);
  const [mode, setMode] = useState<MapMode>('all');
  const [selection, setSelection] = useState<AdminMapSelection>(null);
  const [connected, setConnected] = useState(false);
  const [collapsedStatusQueues, setCollapsedStatusQueues] = useState<
    Partial<Record<DeliveryStatus, boolean>>
  >({});

  const operationsQuery = useQuery({
    queryKey: ['admin', 'operations', { query, companyId, driverId, statuses }],
    queryFn: () =>
      adminOperationsApi.overview(token as string, {
        q: query || undefined,
        companyId: companyId || undefined,
        driverId: driverId || undefined,
        statuses: statuses.length ? statuses : undefined,
      }),
    enabled: Boolean(token),
    refetchInterval: 30_000,
  });
  /**
   * Os limites de SLA vem das configuracoes e sao comparados NO CLIENTE, junto
   * do cronometro que ja bate a cada segundo. Se viessem resolvidos do servidor,
   * a linha so acenderia na proxima consulta — e a hora de acender e justamente
   * enquanto alguem esta olhando a fila.
   */
  const settingsQuery = useQuery({
    queryKey: ['admin', 'platform-settings'],
    queryFn: () => adminPlatformSettingsApi.get(token as string),
    enabled: Boolean(token),
    staleTime: 5 * 60_000,
  });
  const slaSettings = settingsQuery.data ?? null;

  const companiesQuery = useQuery({
    queryKey: ['admin', 'companies', 'operations-filter'],
    queryFn: () => adminCompaniesApi.list(token as string),
    enabled: Boolean(token),
  });
  const driversQuery = useQuery({
    queryKey: ['admin', 'drivers', 'operations-filter'],
    queryFn: () => adminDriversApi.list(token as string),
    enabled: Boolean(token),
  });

  useEffect(() => {
    if (!token) return;
    const socket = io(baseUrl, { auth: { token } });
    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    const refresh = () => void queryClient.invalidateQueries({ queryKey: ['admin', 'operations'] });
    socket.on('delivery:updated', refresh);
    socket.on('driver:location', refresh);
    socket.on('driver:presence', refresh);
    return () => {
      socket.disconnect();
    };
  }, [queryClient, token]);

  const cancelMutation = useMutation({
    mutationFn: (deliveryId: string) => deliveriesApi.cancel(token as string, deliveryId),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['admin', 'operations'] }),
  });
  const selectMapItem = useCallback(
    (item: NonNullable<AdminMapSelection>) => setSelection(item),
    [],
  );
  const data = operationsQuery.data;
  const allOrders = useMemo(() => [...(data?.active ?? []), ...(data?.recent ?? [])], [data]);
  const selectedOrder =
    selection?.kind === 'delivery'
      ? (allOrders.find((item) => item.id === selection.id) ?? null)
      : null;
  const selectedDriver =
    selection?.kind === 'driver'
      ? (data?.onlineDrivers.find((item) => item.id === selection.id) ?? null)
      : null;

  if (!token)
    return <p className="text-sm text-muted-foreground">Faça login como administrador.</p>;

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Operação global</h1>
          <p className="text-sm text-muted-foreground">
            Pedidos ativos e motoboys com heartbeat válido.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-primary/15 bg-card/85 px-3 py-1.5 text-xs shadow-sm ring-1 ring-white/70 backdrop-blur">
          {connected && activityConnected ? (
            <Wifi className="size-3.5 text-status-entregue" />
          ) : (
            <WifiOff className="size-3.5 text-status-cancelado" />
          )}
          {connected && activityConnected ? 'Tempo real conectado' : 'Reconectando'}
        </div>
      </header>

      {/* Acima da grade: e alerta, e alerta que some sozinho quando nao ha
          ninguem em silencio. Dentro de uma coluna ele passaria batido. */}
      <SilentDrivers />

      <section className="grid min-h-[760px] gap-4 2xl:grid-cols-[300px_minmax(0,1fr)_360px]">
        <div className="space-y-4">
          <Card className="premium-panel">
            <CardHeader className="py-3">
              <CardTitle className="text-sm">Filtros</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 pt-0">
              <div className="relative">
                <Search className="absolute top-2.5 left-3 size-4 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder="Pedido ou nº externo"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </div>
              <select
                className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                value={companyId}
                onChange={(event) => setCompanyId(event.target.value)}
              >
                <option value="">Todas as empresas</option>
                {companiesQuery.data?.map((company) => (
                  <option key={company.id} value={company.id}>
                    {company.tradeName}
                  </option>
                ))}
              </select>
              <select
                className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                value={driverId}
                onChange={(event) => setDriverId(event.target.value)}
              >
                <option value="">Todos os motoboys</option>
                {driversQuery.data?.map((driver) => (
                  <option key={driver.id} value={driver.id}>
                    {driver.name}
                  </option>
                ))}
              </select>
              <div className="grid grid-cols-2 gap-2">
                {filterStatuses.map((status) => (
                  <label key={status} className="flex items-start gap-2 text-xs">
                    <Checkbox
                      checked={statuses.includes(status)}
                      onCheckedChange={(checked) =>
                        setStatuses((current) =>
                          checked
                            ? [...current, status]
                            : current.filter((item) => item !== status),
                        )
                      }
                    />
                    {statusLabel(status)}
                  </label>
                ))}
              </div>
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={() => {
                  setQuery('');
                  setCompanyId('');
                  setDriverId('');
                  setStatuses([]);
                }}
              >
                Limpar filtros
              </Button>
            </CardContent>
          </Card>

          <Card className="premium-panel gap-0 overflow-hidden py-0">
            <CardHeader className="border-b border-primary/10 bg-gradient-to-r from-admin-soft/75 to-card px-3 py-3">
              <CardTitle className="space-y-3 text-sm">
                <span className="flex items-center gap-2.5">
                  <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm">
                    <Layers3 className="size-4" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block">Filas operacionais</span>
                    <span className="mt-0.5 block text-[10px] font-normal tracking-normal text-muted-foreground">
                      {allOrders.length} pedido{allOrders.length === 1 ? '' : 's'} monitorado
                      {allOrders.length === 1 ? '' : 's'}
                    </span>
                  </span>
                </span>
                {/*
                  Duas lentes sobre a mesma fila, e cada uma responde uma
                  pergunta: por status, "o que esta travado agora"; por empresa,
                  "algum cliente esta sendo mal atendido". A segunda e a que faz
                  o telefone tocar, e a lista por status nao a mostra porque
                  espalha os pedidos de uma mesma loja por varias secoes.
                */}
                <span className="grid grid-cols-2 rounded-xl border border-primary/10 bg-card/80 p-1 text-xs font-normal shadow-inner">
                  {(
                    [
                      ['status', 'Por status', ListFilter],
                      ['company', 'Por empresa', Building2],
                    ] as const
                  ).map(([modo, rotulo, Icon]) => (
                    <button
                      key={modo}
                      type="button"
                      onClick={() => setQueueMode(modo)}
                      className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 transition-all ${
                        queueMode === modo
                          ? 'bg-primary font-semibold text-primary-foreground shadow-sm'
                          : 'text-muted-foreground hover:bg-admin-soft hover:text-admin-deep'
                      }`}
                    >
                      <Icon className="size-3.5" aria-hidden="true" />
                      {rotulo}
                    </button>
                  ))}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="max-h-[520px] space-y-2.5 overflow-y-auto p-2.5">
              {queueMode === 'company' ? (
                <CompanyQueues
                  orders={allOrders}
                  renderOrder={(order) => (
                    <OperationRow
                      order={order}
                      hideCompany
                      grouped
                      selected={selection?.kind === 'delivery' && selection.id === order.id}
                      slaAlertMinutes={slaAlertMinutesFor(order.status, slaSettings)}
                      onSelect={() => setSelection({ kind: 'delivery', id: order.id })}
                    />
                  )}
                />
              ) : (
                sectionStatuses.map((status) => {
                  const orders = allOrders.filter((order) => order.status === status).slice(0, 8);
                  const total = data?.counts[status] ?? orders.length;
                  // Enquanto o administrador não escolhe, fila vazia fica
                  // compacta e fila que recebeu pedido abre automaticamente.
                  const collapsed = collapsedStatusQueues[status] ?? total === 0;
                  const contentId = `status-queue-${status.toLowerCase()}`;
                  return (
                    <div
                      key={status}
                      className="overflow-hidden rounded-xl border border-primary/10 bg-card/70"
                    >
                      <button
                        type="button"
                        aria-expanded={!collapsed}
                        aria-controls={contentId}
                        title={collapsed ? 'Expandir fila' : 'Recolher fila'}
                        onClick={() =>
                          setCollapsedStatusQueues((current) => ({
                            ...current,
                            [status]: !collapsed,
                          }))
                        }
                        className="flex w-full items-center justify-between gap-3 bg-admin-soft/55 px-3 py-2 text-left text-xs font-semibold text-admin-deep transition-colors hover:bg-admin-soft focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary focus-visible:outline-none"
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="grid size-5 shrink-0 place-items-center rounded-md bg-card/80 text-primary ring-1 ring-inset ring-primary/10">
                            {collapsed ? (
                              <ChevronRight className="size-3.5" aria-hidden="true" />
                            ) : (
                              <ChevronDown className="size-3.5" aria-hidden="true" />
                            )}
                          </span>
                          <span className="truncate">{statusLabel(status)}</span>
                        </span>
                        <Badge variant="secondary">{total}</Badge>
                      </button>
                      <div id={contentId} hidden={collapsed}>
                        {orders.map((order) => (
                          <OperationRow
                            key={order.id}
                            order={order}
                            grouped
                            selected={selection?.kind === 'delivery' && selection.id === order.id}
                            slaAlertMinutes={slaAlertMinutesFor(order.status, slaSettings)}
                            onSelect={() => setSelection({ kind: 'delivery', id: order.id })}
                          />
                        ))}
                        {orders.length === 0 && (
                          <p className="px-3 py-3 text-[10px] text-muted-foreground">
                            Nenhum pedido nesta fila.
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>
        </div>

        <div className="relative">
          <div className="absolute top-3 right-3 z-10 flex rounded-xl border border-primary/15 bg-card/90 p-1 shadow-lg ring-1 ring-white/70 backdrop-blur-xl">
            {(['orders', 'drivers', 'all'] as MapMode[]).map((item) => (
              <Button
                key={item}
                type="button"
                size="sm"
                variant={mode === item ? 'default' : 'ghost'}
                onClick={() => setMode(item)}
              >
                {item === 'orders' ? 'Pedidos' : item === 'drivers' ? 'Motoboys' : 'Todos'}
              </Button>
            ))}
          </div>
          <AdminOperationsMap
            data={data}
            mode={mode}
            selection={selection}
            onSelect={selectMapItem}
          />
        </div>

        <div className="flex min-h-0 flex-col gap-4">
          {(selectedOrder || selectedDriver) && (
            <Card className="border-primary/40">
              <CardContent className="space-y-2 pt-4 text-sm">
                {selectedOrder && (
                  <>
                    <div className="flex items-center justify-between">
                      <strong>Pedido #{selectedOrder.displayNumber}</strong>
                      <StatusChip status={selectedOrder.status} />
                    </div>
                    <p>{selectedOrder.companyName}</p>
                    {selectedOrder.driver && (
                      <p className="text-muted-foreground">{selectedOrder.driver.name}</p>
                    )}
                    <div className="flex gap-2">
                      <Link
                        className="inline-flex h-7 items-center rounded-lg border px-2.5 text-xs font-medium hover:bg-muted"
                        href={`/pedidos/${selectedOrder.id}`}
                      >
                        Abrir detalhe
                      </Link>
                      {!['COMPLETED', 'CANCELLED'].includes(selectedOrder.status) && (
                        <Button
                          size="sm"
                          variant="destructive"
                          disabled={cancelMutation.isPending}
                          onClick={() => cancelMutation.mutate(selectedOrder.id)}
                        >
                          Cancelar
                        </Button>
                      )}
                    </div>
                  </>
                )}
                {selectedDriver && (
                  <>
                    <div className="flex items-center justify-between">
                      <strong>{selectedDriver.name}</strong>
                      <Badge className="bg-status-entregue text-white">Online</Badge>
                    </div>
                    <p className="text-muted-foreground">
                      App {selectedDriver.appVersion ?? 'desconhecido'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      GPS {formatRelativeTime(selectedDriver.location.capturedAt)} · precisão{' '}
                      {selectedDriver.location.accuracy ?? 0}m
                    </p>
                    <Link
                      className="inline-flex h-7 items-center rounded-lg border px-2.5 text-xs font-medium hover:bg-muted"
                      href={`/entregadores/${selectedDriver.id}`}
                    >
                      Abrir motoboy
                    </Link>
                  </>
                )}
              </CardContent>
            </Card>
          )}

          <Card className="premium-panel">
            <CardHeader className="py-3">
              <CardTitle className="flex items-center justify-between text-sm">
                Motoboys online <Badge variant="secondary">{data?.onlineDrivers.length ?? 0}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="max-h-56 space-y-2 overflow-y-auto pt-0">
              {data?.onlineDrivers.map((driver) => {
                const age =
                  new Date(data.generatedAt).getTime() -
                  new Date(driver.location.capturedAt).getTime();
                const stale = age > 90_000;
                return (
                  <button
                    type="button"
                    key={driver.id}
                    className="flex w-full items-center justify-between rounded-lg border p-2 text-left text-xs hover:bg-muted"
                    onClick={() => setSelection({ kind: 'driver', id: driver.id })}
                  >
                    <span>
                      <strong>{driver.name}</strong>
                      <span className="block text-muted-foreground">
                        {driver.activeDeliveryIds.length} pedido(s)
                      </span>
                    </span>
                    {stale ? (
                      <AlertTriangle className="size-4 text-alerta" />
                    ) : (
                      <Radio className="size-4 text-status-entregue" />
                    )}
                  </button>
                );
              })}
              {data?.onlineDrivers.length === 0 && (
                <p className="text-sm text-muted-foreground">Nenhum heartbeat válido.</p>
              )}
            </CardContent>
          </Card>

          <Card className="premium-panel min-h-0 flex-1 overflow-hidden">
            <CardHeader className="py-3">
              <CardTitle className="text-sm">Atividade auditável</CardTitle>
            </CardHeader>
            <CardContent className="max-h-[420px] space-y-2 overflow-y-auto pt-0">
              {events.map((event) => (
                <div key={event.id} className="border-t pt-2 text-xs first:border-0 first:pt-0">
                  <div className="flex items-start justify-between gap-2">
                    <span>{event.message}</span>
                    <span className="shrink-0 text-muted-foreground">
                      {formatRelativeTime(event.at)}
                    </span>
                  </div>
                  <div className="mt-1 flex gap-2 text-primary">
                    {event.deliveryId && <Link href={`/pedidos/${event.deliveryId}`}>Pedido</Link>}
                    {event.companyId && <Link href={`/clientes/${event.companyId}`}>Empresa</Link>}
                    {event.driverId && (
                      <Link href={`/entregadores/${event.driverId}`}>Motoboy</Link>
                    )}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}
