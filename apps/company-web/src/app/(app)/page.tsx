'use client';

import Link from 'next/link';
import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { DeliveryStatus, OperationalDeliveryItem } from '@motoboycity/types';
import { io } from 'socket.io-client';
import { CircleDot, MapPin, Search, Wifi, WifiOff } from 'lucide-react';
import { AddressSetupForm } from '@/components/orders/address-setup-form';
import { CompanyOperationsMap } from '@/components/operations/company-operations-map';
import { OperationalOrderForm } from '@/components/operations/operational-order-form';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { companyAddressApi, deliveriesApi, serviceTypesApi } from '@/lib/api-client';
import { session } from '@/lib/session';

const baseUrl = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3333';

const statusLabel: Record<DeliveryStatus, string> = {
  SCHEDULED: 'Agendado',
  AWAITING_DRIVER: 'Buscando motoboy',
  ACCEPTED: 'Aceito',
  COLLECTED: 'Coletado',
  DELIVERED: 'Retorno',
  COMPLETED: 'Concluído',
  CANCELLED: 'Cancelado',
  AWAITING_PAYMENT: 'Aguardando pagamento',
};

function OrderRow({ order, selected, onSelect }: { order: OperationalDeliveryItem; selected: boolean; onSelect: () => void }) {
  const destination = order.addresses.find((address) => address.type === 'DROPOFF');
  return (
    <button type="button" onClick={onSelect} className={`w-full rounded-xl border p-3 text-left transition ${selected ? 'border-primary bg-primary/5' : 'hover:bg-muted/60'}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold">#{order.displayNumber}</span>
        <Badge variant="secondary">{statusLabel[order.status]}</Badge>
      </div>
      <p className="mt-1 truncate text-xs text-muted-foreground">
        {order.externalOrderNumber ? `${order.externalOrderNumber} · ` : ''}
        {destination?.street ? `${destination.street}, ${destination.number ?? 's/n'}` : 'Destino por GPS'}
      </p>
      {order.driver && <p className="mt-1 text-xs text-emerald-700">{order.driver.name}</p>}
    </button>
  );
}

export default function CompanyHomePage() {
  const token = session.getToken();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search.trim());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);

  const addressQuery = useQuery({
    queryKey: ['company', 'address'],
    queryFn: () => companyAddressApi.get(token as string),
    enabled: Boolean(token),
  });
  const serviceTypesQuery = useQuery({
    queryKey: ['service-types', { active: true }],
    queryFn: () => serviceTypesApi.list(token as string, { active: true }),
    enabled: Boolean(token),
  });
  const operationsQuery = useQuery({
    queryKey: ['company', 'operations'],
    queryFn: () => deliveriesApi.operations(token as string),
    enabled: Boolean(token),
    refetchInterval: 30_000,
  });
  const searchQuery = useQuery({
    queryKey: ['deliveries', 'search', deferredSearch],
    queryFn: () => deliveriesApi.search(token as string, { q: deferredSearch, pageSize: 20 }),
    enabled: Boolean(token && deferredSearch),
  });

  useEffect(() => {
    if (!token) return;
    const socket = io(baseUrl, { auth: { token } });
    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    const refresh = () => {
      void queryClient.invalidateQueries({ queryKey: ['company', 'operations'] });
      void queryClient.invalidateQueries({ queryKey: ['deliveries', 'search'] });
    };
    socket.on('delivery:updated', refresh);
    socket.on('delivery:location', refresh);
    return () => {
      socket.disconnect();
    };
  }, [queryClient, token]);

  const operations = operationsQuery.data;
  const visibleOrders = useMemo(
    () => [...(operations?.active ?? []), ...(operations?.recent ?? [])],
    [operations],
  );
  const selected = visibleOrders.find((order) => order.id === selectedId) ?? null;
  const selectOrder = useCallback((id: string) => setSelectedId(id), []);

  if (!token) return <p className="text-sm text-muted-foreground">Faça login para continuar.</p>;
  if (addressQuery.isLoading) return <p className="text-sm text-muted-foreground">Carregando central...</p>;
  const pickupAddress = addressQuery.data?.address ?? null;
  if (!pickupAddress) {
    return (
      <Card className="mx-auto max-w-xl">
        <CardHeader><CardTitle>Configure o ponto de coleta</CardTitle></CardHeader>
        <CardContent><AddressSetupForm token={token} /></CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Central operacional</h1>
          <p className="text-sm text-muted-foreground">Crie, localize e acompanhe seus pedidos em tempo real.</p>
        </div>
        <div className="flex items-center gap-2 rounded-full border bg-background px-3 py-1.5 text-xs">
          {connected ? <Wifi className="size-3.5 text-emerald-600" /> : <WifiOff className="size-3.5 text-amber-600" />}
          {connected ? 'Tempo real conectado' : 'Reconectando'}
        </div>
      </header>

      <section className="grid min-h-[720px] gap-4 xl:grid-cols-[360px_minmax(0,1fr)_340px]">
        <Card className="max-h-[calc(100vh-150px)] overflow-hidden">
          <CardHeader className="border-b py-4"><CardTitle className="text-base">Novo pedido</CardTitle></CardHeader>
          <CardContent className="max-h-[calc(100vh-215px)] overflow-y-auto pt-4">
            <OperationalOrderForm token={token} pickupAddress={pickupAddress} serviceTypes={serviceTypesQuery.data ?? []} />
          </CardContent>
        </Card>

        <CompanyOperationsMap pickupAddress={pickupAddress} deliveries={visibleOrders} selectedId={selectedId} onSelect={selectOrder} />

        <div className="flex min-h-0 flex-col gap-4">
          <Card>
            <CardContent className="pt-4">
              <div className="relative">
                <Search className="absolute top-2.5 left-3 size-4 text-muted-foreground" />
                <Input className="pl-9" placeholder="ID ou número externo" value={search} onChange={(event) => setSearch(event.target.value)} />
              </div>
              {deferredSearch && (
                <div className="mt-3 max-h-52 space-y-2 overflow-y-auto">
                  {searchQuery.isLoading && <p className="text-xs text-muted-foreground">Buscando...</p>}
                  {searchQuery.data?.items.map((order) => (
                    <Link key={order.id} href={`/pedidos/${order.id}`} className="block rounded-lg border p-2 text-xs hover:bg-muted">
                      <span className="font-semibold">#{order.displayNumber}</span> · {order.externalOrderNumber ?? statusLabel[order.status]}
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {selected && (
            <Card className="border-primary/40">
              <CardContent className="space-y-2 pt-4 text-sm">
                <div className="flex items-center justify-between"><strong>Pedido #{selected.displayNumber}</strong><Badge>{statusLabel[selected.status]}</Badge></div>
                {selected.recipientName && <p>{selected.recipientName}</p>}
                {selected.driver && <p className="text-muted-foreground">Motoboy: {selected.driver.name}</p>}
                <Link className="inline-flex text-primary hover:underline" href={`/pedidos/${selected.id}`}>Abrir detalhes</Link>
              </CardContent>
            </Card>
          )}

          <Card className="min-h-0 flex-1 overflow-hidden">
            <CardHeader className="border-b py-3"><CardTitle className="flex items-center gap-2 text-sm"><CircleDot className="size-4 text-amber-500" />Ativos <Badge variant="secondary">{operations?.active.length ?? 0}</Badge></CardTitle></CardHeader>
            <CardContent className="max-h-[310px] space-y-2 overflow-y-auto pt-3">
              {operations?.active.map((order) => <OrderRow key={order.id} order={order} selected={order.id === selectedId} onSelect={() => selectOrder(order.id)} />)}
              {operations?.active.length === 0 && <p className="text-sm text-muted-foreground">Nenhum pedido ativo.</p>}
            </CardContent>
          </Card>

          <Card className="min-h-0 flex-1 overflow-hidden">
            <CardHeader className="border-b py-3"><CardTitle className="flex items-center gap-2 text-sm"><MapPin className="size-4 text-emerald-600" />Recentes</CardTitle></CardHeader>
            <CardContent className="max-h-56 space-y-2 overflow-y-auto pt-3">
              {operations?.recent.map((order) => <OrderRow key={order.id} order={order} selected={order.id === selectedId} onSelect={() => selectOrder(order.id)} />)}
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}
