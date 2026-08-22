'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { DeliveryStatus, OperationalDeliveryItem } from '@motoboycity/types';
import { io } from 'socket.io-client';
import { AlertTriangle, Radio, Search, Wifi, WifiOff } from 'lucide-react';
import {
  AdminOperationsMap,
  type AdminMapSelection,
  type MapMode,
} from '@/components/operations/admin-operations-map';
import { StatusChip, STATUS_OPTIONS, statusLabel } from '@/components/orders/status-chip';
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
  baseUrl,
  deliveriesApi,
} from '@/lib/api-client';
import { formatRelativeTime } from '@/lib/format';
import { session } from '@/lib/session';
import { useAdminActivityFeed } from '@/lib/use-admin-activity-feed';
import { operationTime } from '@/lib/operation-clock';
import { CompanyQueues } from '@/components/operations/company-queues';

const filterStatuses = STATUS_OPTIONS.map((option) => option.value);
const sectionStatuses: DeliveryStatus[] = [
  'AWAITING_DRIVER',
  'ACCEPTED',
  'COLLECTED',
  'DELIVERED',
  'COMPLETED',
];

function OperationRow({
  order,
  onSelect,
  hideCompany = false,
}: {
  order: OperationalDeliveryItem;
  onSelect: () => void;
  /**
   * Dentro do grupo da empresa o nome ja esta no cabecalho. Repeti-lo em cada
   * linha rouba a largura que o nome do motoboy precisa numa tela densa.
   */
  hideCompany?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="w-full rounded-lg border p-2 text-left text-xs hover:bg-muted"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-baseline gap-2">
          <strong className="font-mono">#{order.displayNumber}</strong>
          {/*
            A HORA diz quando o pedido entrou; o cronometro, ha quanto tempo ele
            esta parado neste estado. Uma nao substitui a outra.
          */}
          <span className="font-mono text-muted-foreground">{operationTime(order.createdAt)}</span>
          <ElapsedTime since={order.statusChangedAt} />
        </span>
        <StatusChip status={order.status} />
      </div>
      <p className="mt-1 truncate text-muted-foreground">
        {hideCompany ? (order.driver?.name ?? 'Sem motoboy') : order.companyName}
        {!hideCompany && order.driver ? ` · ${order.driver.name}` : ''}
      </p>
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
        <div className="flex items-center gap-2 rounded-full border bg-background px-3 py-1.5 text-xs">
          {connected && activityConnected ? (
            <Wifi className="size-3.5 text-status-entregue" />
          ) : (
            <WifiOff className="size-3.5 text-status-cancelado" />
          )}
          {connected && activityConnected ? 'Tempo real conectado' : 'Reconectando'}
        </div>
      </header>

      <section className="grid min-h-[760px] gap-4 2xl:grid-cols-[300px_minmax(0,1fr)_360px]">
        <div className="space-y-4">
          <Card>
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

          <Card>
            <CardHeader className="py-3">
              <CardTitle className="flex items-center justify-between gap-2 text-sm">
                Filas operacionais
                {/*
                  Duas lentes sobre a mesma fila, e cada uma responde uma
                  pergunta: por status, "o que esta travado agora"; por empresa,
                  "algum cliente esta sendo mal atendido". A segunda e a que faz
                  o telefone tocar, e a lista por status nao a mostra porque
                  espalha os pedidos de uma mesma loja por varias secoes.
                */}
                <span className="flex rounded-md border p-0.5 text-xs font-normal">
                  {(
                    [
                      ['status', 'Por status'],
                      ['company', 'Por empresa'],
                    ] as const
                  ).map(([modo, rotulo]) => (
                    <button
                      key={modo}
                      type="button"
                      onClick={() => setQueueMode(modo)}
                      className={`rounded px-2 py-0.5 transition-colors ${
                        queueMode === modo ? 'bg-colete font-medium text-asfalto' : ''
                      }`}
                    >
                      {rotulo}
                    </button>
                  ))}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="max-h-[450px] space-y-3 overflow-y-auto pt-0">
              {queueMode === 'company' ? (
                <CompanyQueues
                  orders={allOrders}
                  renderOrder={(order) => (
                    <OperationRow
                      order={order}
                      hideCompany
                      onSelect={() => setSelection({ kind: 'delivery', id: order.id })}
                    />
                  )}
                />
              ) : (
                sectionStatuses.map((status) => {
                  const orders = allOrders.filter((order) => order.status === status).slice(0, 8);
                  return (
                    <div key={status} className="space-y-1.5">
                      <p className="flex items-center justify-between text-xs font-semibold">
                        {statusLabel(status)}{' '}
                        <Badge variant="secondary">{data?.counts[status] ?? 0}</Badge>
                      </p>
                      {orders.map((order) => (
                        <OperationRow
                          key={order.id}
                          order={order}
                          onSelect={() => setSelection({ kind: 'delivery', id: order.id })}
                        />
                      ))}
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>
        </div>

        <div className="relative">
          <div className="absolute top-3 right-3 z-10 flex rounded-lg border bg-background/95 p-1 shadow-sm">
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

          <Card>
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

          <Card className="min-h-0 flex-1 overflow-hidden">
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
