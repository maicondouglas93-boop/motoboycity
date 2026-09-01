'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AdminOperationsResult,
  DeliveryStatus,
  OperationalDeliveryItem,
} from '@motoboycity/types';
import { io } from 'socket.io-client';
import {
  AlertTriangle,
  Bike,
  Building2,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  Clock3,
  Layers3,
  ListFilter,
  MapPin,
  RadioTower,
  RotateCcw,
  Route,
  Search,
  WalletCards,
  Wifi,
  WifiOff,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import { AdminPageHeader } from '@/components/layout/admin-page-header';
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
  adminReportsApi,
  baseUrl,
} from '@/lib/api-client';
import { formatRelativeTime } from '@/lib/format';
import { session } from '@/lib/session';
import { useMoney } from '@/lib/money';
import { isDriverPresenceActivity, useAdminActivityFeed } from '@/lib/use-admin-activity-feed';
import { operationTime } from '@/lib/operation-clock';
import { CancelDeliveryDialog } from '@/components/operations/cancel-delivery-dialog';
import { CompanyQueues } from '@/components/operations/company-queues';
import { DeliveryActionsMenu } from '@/components/operations/delivery-actions-menu';
import { SilentDrivers } from '@/components/operations/silent-drivers';
import { DispatchQueue } from '@/components/operations/dispatch-queue';
import { slaAlertMinutesFor } from '@/lib/sla';

/**
 * Quantos pedidos cada fila lista antes de mandar para a tela de pedidos.
 *
 * A coluna e estreita e ha oito filas: listar tudo aqui empurraria as filas de
 * baixo para fora da tela. O que nao cabe vira um link com a contagem.
 */
const LIMITE_POR_FILA = 8;

const filterStatuses = STATUS_OPTIONS.map((option) => option.value).filter(
  (status) => status !== 'COMPLETED',
);
type SectionStatus = Exclude<DeliveryStatus, 'COMPLETED'>;

const sectionStatuses: SectionStatus[] = [
  'SCHEDULED',
  'AWAITING_DRIVER',
  'ACCEPTED',
  'COLLECTED',
  'DELIVERED',
  'FAILED',
  'AWAITING_PAYMENT',
  'CANCELLED',
];

/**
 * Cada fila usa uma cor propria apenas para reconhecimento rapido. O status
 * continua vindo da mesma fonte de verdade usada nos cards e nos filtros.
 */
const STATUS_QUEUE_VISUALS: Record<
  SectionStatus,
  { icon: LucideIcon; iconClass: string; iconSurfaceClass: string }
> = {
  SCHEDULED: {
    icon: CalendarDays,
    iconClass: 'text-blue-600',
    iconSurfaceClass: 'bg-blue-50 ring-blue-100',
  },
  AWAITING_DRIVER: {
    icon: Search,
    iconClass: 'text-orange-600',
    iconSurfaceClass: 'bg-orange-50 ring-orange-100',
  },
  ACCEPTED: {
    icon: Bike,
    iconClass: 'text-emerald-600',
    iconSurfaceClass: 'bg-emerald-50 ring-emerald-100',
  },
  COLLECTED: {
    icon: Route,
    iconClass: 'text-violet-600',
    iconSurfaceClass: 'bg-violet-50 ring-violet-100',
  },
  DELIVERED: {
    icon: RotateCcw,
    iconClass: 'text-indigo-600',
    iconSurfaceClass: 'bg-indigo-50 ring-indigo-100',
  },
  FAILED: {
    icon: AlertTriangle,
    iconClass: 'text-rose-600',
    iconSurfaceClass: 'bg-rose-50 ring-rose-100',
  },
  AWAITING_PAYMENT: {
    icon: WalletCards,
    iconClass: 'text-amber-600',
    iconSurfaceClass: 'bg-amber-50 ring-amber-100',
  },
  CANCELLED: {
    icon: XCircle,
    iconClass: 'text-slate-500',
    iconSurfaceClass: 'bg-slate-100 ring-slate-200',
  },
};

function formatAverageDuration(minutes: number): string {
  const totalMinutes = Math.max(0, Math.round(minutes));
  const hours = Math.floor(totalMinutes / 60);
  const remainingMinutes = totalMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(remainingMinutes).padStart(2, '0')}`;
}

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
  /**
   * O MESMO formatador do resto do painel.
   *
   * Esta tela tinha o proprio `Intl.NumberFormat` e era a ultima do admin que
   * ainda tinha: com o botao de esconder valores ligado, todas as outras
   * mascaravam e a fila de pedidos continuava mostrando dinheiro na tela.
   */
  const money = useMoney();
  const destination = order.addresses.find((address) => address.type === 'DROPOFF');
  const addressLabel =
    order.destinationKnownAtCreation && destination?.street
      ? [destination.street, destination.number].filter(Boolean).join(', ')
      : 'Destino definido na entrega';
  const totalLabel = order.totalValue === null ? 'A calcular' : money(order.totalValue);

  return (
    <div
      className={`group/order relative w-full overflow-hidden text-left text-xs transition-all focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none ${
        grouped
          ? 'rounded-none border-0 border-b border-border/65 bg-transparent px-3.5 py-3 last:border-b-0 hover:bg-admin-soft/45'
          : 'rounded-xl border border-border/80 bg-card/75 px-3.5 py-3 shadow-sm hover:-translate-y-0.5 hover:border-primary/25 hover:bg-card hover:shadow-md'
      } ${selected ? 'bg-admin-soft/75 ring-1 ring-inset ring-primary/25' : ''}`}
    >
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        aria-label={`Selecionar pedido #${order.displayNumber}`}
        className="absolute inset-0 z-0 rounded-[inherit] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary focus-visible:outline-none"
      />
      <span
        aria-hidden="true"
        className={`absolute inset-y-2 left-0 w-0.5 rounded-r-full ${statusRailClass(order.status)}`}
      />

      <div className="pointer-events-none relative z-[1]">
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
          <StatusChip status={order.status} className="ml-auto mr-7 px-2 py-0.5 text-[10px]" />
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
      </div>

      <div className="pointer-events-auto absolute top-2 right-2 z-10">
        <DeliveryActionsMenu order={order} />
      </div>
    </div>
  );
}

type QueueMode = 'status' | 'company';
type ActivityMode = 'operations' | 'presence' | 'all';

interface DriverLocationRealtimeEvent {
  driverId: string;
  lat: number;
  lng: number;
  accuracy: number | null;
  capturedAt: string;
}

export default function AdminDashboardPage() {
  const token = session.getToken();
  const [queueMode, setQueueMode] = useState<QueueMode>('status');
  const [activityMode, setActivityMode] = useState<ActivityMode>('operations');
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

  const operationDate = operationsQuery.data?.generatedAt
    ? new Date(operationsQuery.data.generatedAt).toLocaleDateString('en-CA', {
        timeZone: 'America/Sao_Paulo',
      })
    : null;
  const todayReportQuery = useQuery({
    queryKey: ['admin', 'reports', 'operations', 'today', operationDate],
    queryFn: () =>
      adminReportsApi.operations(token as string, {
        from: operationDate as string,
        to: operationDate as string,
      }),
    enabled: Boolean(token && operationDate),
    refetchInterval: 60_000,
  });

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
    const refreshOperation = () =>
      void queryClient.invalidateQueries({ queryKey: ['admin', 'operations'] });
    const refreshDelivery = () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'operations'] });
      void queryClient.invalidateQueries({
        queryKey: ['admin', 'reports', 'operations', 'today'],
      });
    };
    const updateDriverLocation = (payload: DriverLocationRealtimeEvent) => {
      if (
        !payload?.driverId ||
        !Number.isFinite(payload.lat) ||
        !Number.isFinite(payload.lng) ||
        !payload.capturedAt
      ) {
        return;
      }

      queryClient.setQueriesData<AdminOperationsResult>(
        { queryKey: ['admin', 'operations'] },
        (current) => {
          if (!current?.onlineDrivers.some((driver) => driver.id === payload.driverId)) {
            return current;
          }
          return {
            ...current,
            onlineDrivers: current.onlineDrivers.map((driver) =>
              driver.id === payload.driverId
                ? {
                    ...driver,
                    location: {
                      ...driver.location,
                      lat: payload.lat,
                      lng: payload.lng,
                      accuracy: payload.accuracy,
                      capturedAt: payload.capturedAt,
                    },
                  }
                : driver,
            ),
          };
        },
      );
    };
    socket.on('delivery:updated', refreshDelivery);
    socket.on('driver:location', updateDriverLocation);
    socket.on('driver:presence', refreshOperation);
    socket.on('dispatch:queue-updated', refreshOperation);
    return () => {
      socket.disconnect();
    };
  }, [queryClient, token]);

  const selectMapItem = useCallback(
    (item: NonNullable<AdminMapSelection>) => setSelection(item),
    [],
  );
  const mapViewportKey = useMemo(
    () => [mode, query.trim(), companyId, driverId, [...statuses].sort().join(',')].join('|'),
    [companyId, driverId, mode, query, statuses],
  );
  const data = operationsQuery.data;
  const allOrders = useMemo(() => [...(data?.active ?? []), ...(data?.recent ?? [])], [data]);
  const visibleActivityEvents = useMemo(
    () =>
      events.filter((event) => {
        const isPresence = isDriverPresenceActivity(event);
        if (activityMode === 'presence') return isPresence;
        if (activityMode === 'operations') return !isPresence;
        return true;
      }),
    [activityMode, events],
  );
  const selectedOrder =
    selection?.kind === 'delivery'
      ? (allOrders.find((item) => item.id === selection.id) ?? null)
      : null;
  const selectedDriver =
    selection?.kind === 'driver'
      ? (data?.onlineDrivers.find((item) => item.id === selection.id) ?? null)
      : null;
  const todayReport = todayReportQuery.data;
  const completedToday = todayReport?.deliveriesCompleted.count ?? 0;
  const finalizedToday =
    todayReport?.drivers.reduce(
      (total, driver) =>
        total + driver.completedCount + driver.failedCount + driver.cancelledAfterAcceptCount,
      0,
    ) ?? 0;
  const completionRate =
    finalizedToday > 0 ? Math.round((completedToday / finalizedToday) * 100) : 0;
  const timedSamples =
    todayReport?.drivers.reduce((total, driver) => total + driver.timedSamples, 0) ?? 0;
  const averageMinutes =
    timedSamples > 0
      ? (todayReport?.drivers.reduce(
          (total, driver) => total + (driver.averageMinutesToComplete ?? 0) * driver.timedSamples,
          0,
        ) ?? 0) / timedSamples
      : 0;
  const operationUnavailable = operationsQuery.isError || operationsQuery.isPending;
  const reportUnavailable = todayReportQuery.isError || todayReportQuery.isPending;
  const operationMetrics: Array<{
    label: string;
    value: string;
    hint: string;
    icon: LucideIcon;
    iconClass: string;
    iconSurfaceClass: string;
  }> = [
    {
      label: 'Pedidos ativos',
      value: operationUnavailable ? '—' : String(data?.active.length ?? 0),
      hint: operationUnavailable ? 'Dados indisponíveis' : 'Em operação agora',
      icon: Bike,
      iconClass: 'text-emerald-600',
      iconSurfaceClass: 'bg-emerald-50 ring-emerald-100',
    },
    {
      label: 'Motoboys online',
      value: operationUnavailable ? '—' : String(data?.onlineDrivers.length ?? 0),
      hint: operationUnavailable ? 'Dados indisponíveis' : 'Heartbeat válido',
      icon: RadioTower,
      iconClass: 'text-orange-600',
      iconSurfaceClass: 'bg-orange-50 ring-orange-100',
    },
    {
      label: 'Pedidos hoje',
      value: reportUnavailable ? '—' : String(todayReport?.ordersCreated.count ?? 0),
      hint: reportUnavailable ? 'Dados indisponíveis' : 'Total criado no dia',
      icon: CalendarDays,
      iconClass: 'text-violet-600',
      iconSurfaceClass: 'bg-violet-50 ring-violet-100',
    },
    {
      label: 'Taxa de conclusão',
      value: reportUnavailable ? '—' : `${completionRate}%`,
      hint: reportUnavailable
        ? 'Dados indisponíveis'
        : finalizedToday > 0
          ? `${completedToday} de ${finalizedToday} encerrados`
          : 'Sem corridas encerradas',
      icon: Route,
      iconClass: 'text-blue-600',
      iconSurfaceClass: 'bg-blue-50 ring-blue-100',
    },
    {
      label: 'Tempo médio de entrega',
      value: reportUnavailable ? '—' : formatAverageDuration(averageMinutes),
      hint: reportUnavailable
        ? 'Dados indisponíveis'
        : timedSamples > 0
          ? `${timedSamples} entrega${timedSamples === 1 ? '' : 's'} na média`
          : 'Sem entregas concluídas',
      icon: Clock3,
      iconClass: 'text-teal-600',
      iconSurfaceClass: 'bg-teal-50 ring-teal-100',
    },
  ];

  if (!token)
    return <p className="text-sm text-muted-foreground">Faça login como administrador.</p>;

  return (
    <div className="min-w-0 space-y-4">
      <AdminPageHeader
        icon={RadioTower}
        eyebrow="Central operacional"
        title="Operação global"
        description="Pedidos ativos, filas de atendimento e motoboys com heartbeat válido."
        tone="operation"
        actions={
          <div className="flex items-center gap-2 rounded-full border border-primary/15 bg-card/85 px-3 py-1.5 text-xs shadow-sm ring-1 ring-white/70 backdrop-blur">
            {connected && activityConnected ? (
              <Wifi className="size-3.5 text-status-entregue" aria-hidden="true" />
            ) : (
              <WifiOff className="size-3.5 text-status-cancelado" aria-hidden="true" />
            )}
            {connected && activityConnected ? 'Tempo real conectado' : 'Reconectando'}
          </div>
        }
      />

      {/*
        Falha de carregamento precisa aparecer, e nao virar tela vazia.
        Sem isto, API fora do ar fica identica a manha fraca: filas zeradas,
        "0 ativos", mapa sem nada — e o admin nao tem como saber a diferenca.
      */}
      {operationsQuery.isError && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
          <span>
            Não foi possível carregar a operação. Os números abaixo podem estar desatualizados.
          </span>
          <Button
            size="sm"
            variant="outline"
            className="ml-auto"
            onClick={() => void operationsQuery.refetch()}
          >
            Tentar de novo
          </Button>
        </div>
      )}

      {/* Acima da grade: e alerta, e alerta que some sozinho quando nao ha
          ninguem em silencio. Dentro de uma coluna ele passaria batido. */}
      <SilentDrivers />

      <section className="grid min-h-[760px] w-full min-w-0 grid-cols-[minmax(0,1fr)] gap-4 2xl:grid-cols-[300px_minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-4">
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
                      {operationsQuery.isLoading
                        ? 'carregando...'
                        : `${allOrders.length} pedido${allOrders.length === 1 ? '' : 's'} monitorado${allOrders.length === 1 ? '' : 's'}`}
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
                  const daFila = allOrders.filter((order) => order.status === status);
                  const orders = daFila.slice(0, LIMITE_POR_FILA);
                  const total = data?.counts[status] ?? daFila.length;
                  const queueVisual = STATUS_QUEUE_VISUALS[status];
                  const QueueIcon = queueVisual.icon;
                  // Quantos existem alem dos que couberam na lista. O distintivo
                  // sempre mostrou o total; sem esta conta, uma fila de 20
                  // exibia "20" e listava 8, sem dizer que escondeu 12.
                  const ocultos = Math.max(0, total - orders.length);
                  // Enquanto o administrador não escolhe, fila vazia fica
                  // compacta e fila que recebeu pedido abre automaticamente.
                  const collapsed = collapsedStatusQueues[status] ?? total === 0;
                  const contentId = `status-queue-${status.toLowerCase()}`;
                  return (
                    <div
                      key={status}
                      className="overflow-hidden rounded-xl border border-border/65 bg-card/75 shadow-[0_5px_16px_-15px_rgba(15,23,42,0.45)]"
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
                        className="flex w-full items-center gap-2.5 bg-slate-50/85 px-2.5 py-2 text-left text-xs font-semibold text-admin-deep transition-colors hover:bg-admin-soft/70 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary focus-visible:outline-none"
                      >
                        <span
                          className={`grid size-6 shrink-0 place-items-center rounded-lg ring-1 ring-inset ${queueVisual.iconSurfaceClass}`}
                        >
                          <QueueIcon
                            className={`size-3.5 ${queueVisual.iconClass}`}
                            aria-hidden="true"
                          />
                        </span>
                        <span className="min-w-0 flex-1 truncate">{statusLabel(status)}</span>
                        <Badge
                          variant="secondary"
                          className="h-5 min-w-6 justify-center rounded-full bg-slate-200/80 px-1.5 text-[10px] tabular-nums text-slate-600"
                        >
                          {total}
                        </Badge>
                        {collapsed ? (
                          <ChevronRight
                            className="size-3.5 shrink-0 text-slate-400"
                            aria-hidden="true"
                          />
                        ) : (
                          <ChevronDown
                            className="size-3.5 shrink-0 text-slate-400"
                            aria-hidden="true"
                          />
                        )}
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
                        {ocultos > 0 && (
                          <Link
                            href={`/pedidos?status=${status}`}
                            className="block border-t border-border/65 px-3 py-2 text-[10px] font-medium text-primary hover:bg-admin-soft/45"
                          >
                            + {ocultos} pedido{ocultos === 1 ? '' : 's'} nesta fila — ver todos
                          </Link>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>

          <Card className="premium-panel min-w-0">
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
                className="h-9 w-full min-w-0 max-w-full rounded-md border bg-background px-3 text-sm"
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
                className="h-9 w-full min-w-0 max-w-full rounded-md border bg-background px-3 text-sm"
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
              <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2">
                {filterStatuses.map((status) => (
                  <label key={status} className="flex min-w-0 items-start gap-2 text-xs">
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
                    <span className="min-w-0 break-words leading-4">{statusLabel(status)}</span>
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
        </div>

        <div className="min-w-0 space-y-3">
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
              viewportKey={mapViewportKey}
              selection={selection}
              onSelect={selectMapItem}
            />
          </div>

          <Card className="premium-panel overflow-hidden py-0">
            <CardContent className="grid grid-cols-2 gap-px bg-border/70 p-0 sm:grid-cols-3 xl:grid-cols-5">
              {operationMetrics.map((metric) => {
                const MetricIcon = metric.icon;
                return (
                  <div
                    key={metric.label}
                    className="flex min-w-0 items-center gap-2.5 bg-card px-3 py-3"
                  >
                    <span
                      className={`grid size-9 shrink-0 place-items-center rounded-full ring-1 ring-inset ${metric.iconSurfaceClass}`}
                    >
                      <MetricIcon
                        className={`size-[18px] ${metric.iconClass}`}
                        aria-hidden="true"
                      />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[10px] font-semibold text-muted-foreground">
                        {metric.label}
                      </span>
                      <strong className="block text-lg leading-tight font-bold tracking-tight text-admin-deep tabular-nums">
                        {metric.value}
                      </strong>
                      <span className="block truncate text-[9px] text-muted-foreground">
                        {metric.hint}
                      </span>
                    </span>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>

        <div className="flex min-h-0 min-w-0 flex-col gap-4">
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
                        <CancelDeliveryDialog
                          token={token}
                          deliveryId={selectedOrder.id}
                          displayNumber={selectedOrder.displayNumber}
                          companyName={selectedOrder.companyName}
                          status={selectedOrder.status}
                          driverName={selectedOrder.driver?.name}
                        />
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

          <DispatchQueue
            key={data?.onlineDrivers.map((driver) => driver.id).join('|') ?? 'empty'}
            token={token}
            drivers={data?.onlineDrivers ?? []}
            generatedAt={data?.generatedAt ?? new Date().toISOString()}
            onSelect={(id) => setSelection({ kind: 'driver', id })}
          />

          <Card className="premium-panel min-h-0 flex-1 overflow-hidden">
            <CardHeader className="gap-2 py-3">
              <CardTitle className="text-sm">Atividade auditável</CardTitle>
              <div
                className="grid grid-cols-3 rounded-lg border border-border/70 bg-muted/55 p-1 text-[10px]"
                aria-label="Filtrar atividade auditável"
              >
                {(
                  [
                    ['operations', 'Operação'],
                    ['presence', 'Presença'],
                    ['all', 'Tudo'],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={activityMode === value}
                    onClick={() => setActivityMode(value)}
                    className={`rounded-md px-2 py-1.5 font-medium transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none ${
                      activityMode === value
                        ? 'bg-card text-admin-deep shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </CardHeader>
            <CardContent className="max-h-[420px] space-y-2 overflow-y-auto pt-0">
              {visibleActivityEvents.length === 0 ? (
                <p className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
                  Nenhum evento nesta categoria.
                </p>
              ) : (
                visibleActivityEvents.map((event) => (
                  <div key={event.id} className="border-t pt-2 text-xs first:border-0 first:pt-0">
                    <div className="flex items-start justify-between gap-2">
                      <span>{event.message}</span>
                      <span className="shrink-0 text-muted-foreground">
                        {formatRelativeTime(event.at)}
                      </span>
                    </div>
                    <div className="mt-1 flex gap-2 text-primary">
                      {event.deliveryId && (
                        <Link href={`/pedidos/${event.deliveryId}`}>Pedido</Link>
                      )}
                      {event.companyId && (
                        <Link href={`/clientes/${event.companyId}`}>Empresa</Link>
                      )}
                      {event.driverId && (
                        <Link href={`/entregadores/${event.driverId}`}>Motoboy</Link>
                      )}
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}
