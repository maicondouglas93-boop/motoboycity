'use client';

import Link from 'next/link';
import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { DeliveryOperationsResult, DeliveryTrackingPoint } from '@motoboycity/types';

import { io } from 'socket.io-client';
import { CircleDot, Copy, MapPin, Search, Wifi, WifiOff } from 'lucide-react';
import { StatusChip, statusLabel } from '@/components/orders/status-chip';
import { OrderRow } from '@/components/orders/order-row';
import { AddressSetupForm } from '@/components/orders/address-setup-form';
import { CompanyOperationsMap } from '@/components/operations/company-operations-map';
import { OperationalOrderForm } from '@/components/operations/operational-order-form';
import { buildCloneSeed, type CloneSeed } from '@/components/operations/clone-delivery';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { companyAddressApi, deliveriesApi, serviceTypesApi } from '@/lib/api-client';
import { session } from '@/lib/session';

const baseUrl = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3333';

type DeliveryLocationRealtimeEvent = DeliveryTrackingPoint & {
  deliveryId: string;
  driverId: string;
};

export default function CompanyHomePage() {
  const token = session.getToken();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search.trim());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  /**
   * O `nonce` existe para clonar o MESMO pedido duas vezes seguidas continuar
   * remontando o formulario. Sem ele, a `key` nao mudaria e o segundo clique
   * nao teria efeito visivel.
   */
  const [clone, setClone] = useState<{
    seed: CloneSeed;
    displayNumber: number;
    nonce: number;
  } | null>(null);
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
    const updateDeliveryLocation = (point: DeliveryLocationRealtimeEvent) => {
      if (
        !point?.deliveryId ||
        !Number.isFinite(point.lat) ||
        !Number.isFinite(point.lng) ||
        !point.capturedAt
      ) {
        return;
      }

      queryClient.setQueryData<DeliveryOperationsResult>(['company', 'operations'], (current) => {
        if (!current) return current;
        const updateItems = (items: DeliveryOperationsResult['active']) =>
          items.map((delivery) =>
            delivery.id === point.deliveryId
              ? {
                  ...delivery,
                  lastLocation: point,
                }
              : delivery,
          );
        return {
          ...current,
          active: updateItems(current.active),
          recent: updateItems(current.recent),
        };
      });
    };
    socket.on('delivery:updated', refresh);
    socket.on('delivery:location', updateDeliveryLocation);
    return () => {
      socket.disconnect();
    };
  }, [queryClient, token]);

  const operations = operationsQuery.data;
  const visibleOrders = useMemo(
    () => [...(operations?.active ?? []), ...(operations?.recent ?? [])],
    [operations],
  );
  /**
   * O histórico recente continua na coluna lateral, mas não pertence ao mapa
   * operacional. Quando um pedido vira COMPLETED/CANCELLED, a invalidação do
   * socket (ou o polling de segurança) o move para `recent`; limitar o mapa a
   * `active` remove imediatamente o destino e a última posição do motoboy.
   */
  const mapDeliveries = useMemo(() => operations?.active ?? [], [operations]);
  const selected = visibleOrders.find((order) => order.id === selectedId) ?? null;
  const selectOrder = useCallback((id: string) => setSelectedId(id), []);
  const serviceTypes = useMemo(() => serviceTypesQuery.data ?? [], [serviceTypesQuery.data]);

  if (!token) return <p className="text-sm text-muted-foreground">Faça login para continuar.</p>;
  if (addressQuery.isLoading)
    return <p className="text-sm text-muted-foreground">Carregando central...</p>;
  if (addressQuery.isError) {
    return (
      <Card className="mx-auto max-w-xl border-destructive/30">
        <CardHeader>
          <CardTitle>Não foi possível consultar o ponto de coleta</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-muted-foreground">
          <p>O cadastro não foi alterado. Verifique sua conexão e tente novamente.</p>
          <Button type="button" variant="outline" onClick={() => void addressQuery.refetch()}>
            Tentar novamente
          </Button>
        </CardContent>
      </Card>
    );
  }
  const pickupAddress = addressQuery.data?.address ?? null;
  if (!pickupAddress) {
    return (
      <Card className="mx-auto max-w-xl">
        <CardHeader>
          <CardTitle>Configure o ponto de coleta</CardTitle>
        </CardHeader>
        <CardContent>
          <AddressSetupForm token={token} />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold tracking-tight">Central operacional</h1>
          <p className="text-sm text-muted-foreground">
            Chame um motoboy e acompanhe cada entrega até a porta do cliente.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-portal/15 bg-card/80 px-3.5 py-2 text-xs font-medium text-portal-deep shadow-sm backdrop-blur">
          {connected ? (
            <Wifi className="size-3.5 text-status-entregue" />
          ) : (
            <WifiOff className="size-3.5 text-status-cancelado" />
          )}
          {connected ? 'Tempo real conectado' : 'Reconectando'}
        </div>
      </header>

      {serviceTypesQuery.isError && (
        <p className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          Não foi possível carregar as modalidades. Tente novamente antes de criar um pedido.
        </p>
      )}
      {operationsQuery.isError && (
        <p className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          Não foi possível atualizar os pedidos em andamento. Os dados abaixo podem estar
          desatualizados.
        </p>
      )}

      <section className="grid min-h-[720px] gap-5 xl:grid-cols-[360px_minmax(0,1fr)_340px]">
        <Card className="premium-panel max-h-[calc(100vh-150px)] overflow-hidden">
          <CardHeader className="border-b border-portal/10 bg-gradient-to-r from-portal-soft/75 to-card py-4">
            <CardTitle className="text-base">Novo pedido</CardTitle>
          </CardHeader>
          <CardContent className="max-h-[calc(100vh-215px)] overflow-y-auto pt-4">
            <OperationalOrderForm
              key={clone?.nonce ?? 'novo'}
              token={token}
              pickupAddress={pickupAddress}
              serviceTypes={serviceTypes}
              clone={clone}
            />
          </CardContent>
        </Card>

        <CompanyOperationsMap
          pickupAddress={pickupAddress}
          deliveries={mapDeliveries}
          selectedId={selectedId}
          onSelect={selectOrder}
        />

        <div className="flex min-h-0 flex-col gap-4">
          <Card className="premium-panel">
            <CardContent className="pt-4">
              <div className="relative">
                <Search className="absolute top-2.5 left-3 size-4 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder="ID ou número externo"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>
              {deferredSearch && (
                <div className="mt-3 max-h-52 space-y-2 overflow-y-auto">
                  {searchQuery.isLoading && (
                    <p className="text-xs text-muted-foreground">Buscando...</p>
                  )}
                  {searchQuery.isError && (
                    <p className="text-xs text-destructive">Não foi possível realizar a busca.</p>
                  )}
                  {searchQuery.data?.items.map((order) => (
                    <Link
                      key={order.id}
                      href={`/pedidos/${order.id}`}
                      className="block rounded-xl border border-border/75 bg-card/75 p-2.5 text-xs transition-all hover:border-portal/25 hover:bg-portal-soft/55"
                    >
                      <span className="font-mono font-semibold">#{order.displayNumber}</span> ·{' '}
                      {order.externalOrderNumber ?? statusLabel(order.status)}
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {selected && (
            <Card className="border-portal/25 bg-gradient-to-br from-card to-portal-soft/35 shadow-[0_18px_36px_-28px_rgba(15,107,112,0.7)]">
              <CardContent className="space-y-2 pt-4 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <strong className="font-mono">#{selected.displayNumber}</strong>
                  <StatusChip status={selected.status} />
                </div>
                {selected.recipientName && <p>{selected.recipientName}</p>}
                {selected.driver && (
                  <p className="text-muted-foreground">Motoboy: {selected.driver.name}</p>
                )}
                <div className="flex flex-wrap items-center gap-3 pt-1">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setClone((current) => ({
                        seed: buildCloneSeed(selected, serviceTypes),
                        displayNumber: selected.displayNumber,
                        nonce: (current?.nonce ?? 0) + 1,
                      }))
                    }
                  >
                    <Copy className="mr-1.5 size-3.5" aria-hidden="true" />
                    Clonar
                  </Button>
                  <Link
                    className="font-semibold text-portal underline decoration-portal/35 decoration-2 underline-offset-4 transition-colors hover:text-portal-deep"
                    href={`/pedidos/${selected.id}`}
                  >
                    Abrir detalhes
                  </Link>
                </div>
              </CardContent>
            </Card>
          )}

          <Card className="min-h-0 flex-1 overflow-hidden">
            <CardHeader className="border-b border-portal/10 bg-gradient-to-r from-portal-soft/65 to-card py-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <CircleDot className="size-4 text-status-rota" aria-hidden="true" />
                Na rua
                <Badge variant="secondary">
                  {operationsQuery.isError ? '—' : (operations?.active.length ?? 0)}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="max-h-[310px] space-y-2 overflow-y-auto pt-3">
              {operations?.active.map((order) => (
                <OrderRow
                  key={order.id}
                  order={order}
                  selected={order.id === selectedId}
                  onSelect={() => selectOrder(order.id)}
                />
              ))}
              {operations?.active.length === 0 && !operationsQuery.isError && (
                <p className="text-sm text-muted-foreground">Nenhum pedido ativo.</p>
              )}
            </CardContent>
          </Card>

          <Card className="min-h-0 flex-1 overflow-hidden">
            <CardHeader className="border-b border-portal/10 bg-gradient-to-r from-portal-soft/65 to-card py-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <MapPin className="size-4 text-status-entregue" aria-hidden="true" />
                Recentes
              </CardTitle>
            </CardHeader>
            <CardContent className="max-h-56 space-y-2 overflow-y-auto pt-3">
              {operations?.recent.map((order) => (
                <OrderRow
                  key={order.id}
                  order={order}
                  selected={order.id === selectedId}
                  onSelect={() => selectOrder(order.id)}
                />
              ))}
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}
