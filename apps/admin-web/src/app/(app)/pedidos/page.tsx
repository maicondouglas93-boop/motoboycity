'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { DeliveryStatus } from '@motoboycity/types';
import { ArrowUpRight, Bike, Building2, MapPin, RotateCcw, WalletCards } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CancelDeliveryDialog } from '@/components/operations/cancel-delivery-dialog';
import { StatusChip, statusRailClass } from '@/components/orders/status-chip';
import { Card, CardContent } from '@/components/ui/card';
import { deliveriesApi } from '@/lib/api-client';
import { session } from '@/lib/session';
import { useAdminActiveDeliveryTracking } from '@/lib/use-active-delivery-tracking';
import { useMoney } from '@/lib/money';

const STATUS_FILTERS: { label: string; value: DeliveryStatus | 'ALL' }[] = [
  { label: 'Todos os pedidos', value: 'ALL' },
  { label: 'Agendados', value: 'SCHEDULED' },
  { label: 'Buscando motoboy', value: 'AWAITING_DRIVER' },
  { label: 'A caminho da coleta', value: 'ACCEPTED' },
  { label: 'Em rota', value: 'COLLECTED' },
  { label: 'Voltando à loja', value: 'DELIVERED' },
  { label: 'Concluídos', value: 'COMPLETED' },
  { label: 'Cancelados', value: 'CANCELLED' },
  { label: 'Aguardando pagamento', value: 'AWAITING_PAYMENT' },
];

const CANCELLABLE_STATUSES: DeliveryStatus[] = [
  'SCHEDULED',
  'AWAITING_DRIVER',
  'ACCEPTED',
  'COLLECTED',
  'DELIVERED',
  'AWAITING_PAYMENT',
];

const trackingDateFormatter = new Intl.DateTimeFormat('pt-BR', {
  hour: '2-digit',
  minute: '2-digit',
});

/** Quantos pedidos por pagina. O servidor aceita ate 100. */
const TAMANHO_DA_PAGINA = 25;

function mapsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}

export default function AdminOrdersPage() {
  const money = useMoney();
  const [statusFilter, setStatusFilter] = useState<DeliveryStatus | 'ALL'>('ALL');
  const [pagina, setPagina] = useState(1);
  const trackingQuery = useAdminActiveDeliveryTracking();

  const token = session.getToken();

  /**
   * PAGINADO no servidor.
   *
   * Esta tela chamava `GET /deliveries`, que nao tem `take` nem `skip` e ainda
   * traz empresa e tipo de servico embutidos em cada linha. Com o filtro em
   * "todos" ela pedia a base inteira: hoje funciona com dezenas de pedidos, e
   * com um mes de operacao real vira milhares de linhas atravessando a rede
   * para preencher uma tabela de 25.
   */
  const deliveriesQuery = useQuery({
    queryKey: ['admin', 'deliveries', statusFilter, pagina],
    queryFn: () =>
      deliveriesApi.search(token as string, {
        ...(statusFilter !== 'ALL' && { status: statusFilter }),
        page: pagina,
        pageSize: TAMANHO_DA_PAGINA,
      }),
    enabled: Boolean(token),
  });

  if (!token) {
    return (
      <p className="text-sm text-muted-foreground">
        Faça login como administrador para ver os pedidos.
      </p>
    );
  }

  const resultado = deliveriesQuery.data;
  const deliveries = resultado?.items ?? [];
  const totalDePaginas = resultado ? Math.max(1, Math.ceil(resultado.total / resultado.pageSize)) : 1;
  const activeTracking = trackingQuery.data ?? [];

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_260px]">
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Gerencie e visualize todos os pedidos realizados na plataforma
        </p>

        <section className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-semibold">Rastreamento ao vivo</h2>
            <span className="text-xs text-muted-foreground">
              {activeTracking.length} entrega{activeTracking.length === 1 ? '' : 's'} ativa
              {activeTracking.length === 1 ? '' : 's'}
            </span>
          </div>
          {trackingQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando rastreamento...</p>
          ) : activeTracking.length === 0 ? (
            <Card>
              <CardContent className="py-4 text-sm text-muted-foreground">
                Nenhuma entrega com rastreamento ativo.
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-2 md:grid-cols-2">
              {activeTracking.map((tracking) => (
                <Card key={tracking.deliveryId} className="order-list-card">
                  <CardContent className="space-y-1 py-4 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <Link
                        className="font-medium hover:underline"
                        href={`/pedidos/${tracking.deliveryId}`}
                      >
                        Pedido #{tracking.displayNumber}
                      </Link>
                      <StatusChip status={tracking.status} />
                    </div>
                    <p className="text-muted-foreground">
                      {tracking.companyName} · {tracking.driver.name}
                    </p>
                    {tracking.lastLocation ? (
                      <a
                        className="text-primary underline-offset-4 hover:underline"
                        href={mapsUrl(tracking.lastLocation.lat, tracking.lastLocation.lng)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Ver posição ({tracking.lastLocation.lat.toFixed(5)},{' '}
                        {tracking.lastLocation.lng.toFixed(5)}) ·{' '}
                        {trackingDateFormatter.format(new Date(tracking.lastLocation.capturedAt))}
                      </a>
                    ) : (
                      <p className="text-muted-foreground">Aguardando o primeiro ponto de GPS.</p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </section>


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

        <div className="grid items-stretch gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 min-[1800px]:grid-cols-7">
          {deliveries.map((delivery) => {
            const cancellable = CANCELLABLE_STATUSES.includes(delivery.status);
            return (
              <Card
                key={delivery.id}
                size="sm"
                className="order-list-card h-full min-w-0 border-primary/15 bg-gradient-to-br from-card via-card to-admin-soft/35"
              >
                <span
                  aria-hidden="true"
                  className={`absolute inset-y-0 left-0 w-1 ${statusRailClass(delivery.status)}`}
                />
                <CardContent className="flex h-full min-w-0 flex-col gap-3 pl-4">
                  <div className="flex min-w-0 items-start justify-between gap-2">
                    <span className="rounded-md bg-admin-soft px-2 py-1 text-[11px] font-bold tracking-wide text-admin-deep">
                      #{delivery.displayNumber}
                    </span>
                    <StatusChip
                      status={delivery.status}
                      className="max-w-full px-2 py-1 text-[10px]"
                    />
                  </div>

                  <div className="min-w-0 space-y-1">
                    <p className="flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
                      <Building2 className="size-3 text-primary" aria-hidden="true" /> Empresa
                    </p>
                    <p
                      className="truncate text-sm font-semibold text-admin-deep"
                      title={delivery.companyName}
                    >
                      {delivery.companyName}
                    </p>
                  </div>

                  <div className="space-y-2 border-y border-primary/10 py-3 text-xs text-muted-foreground">
                    <p className="flex min-w-0 items-center gap-2">
                      <Bike className="size-3.5 shrink-0 text-primary" aria-hidden="true" />
                      <span className="truncate" title={delivery.serviceTypeName}>
                        {delivery.serviceTypeName}
                      </span>
                    </p>
                    <p className="flex items-center gap-2">
                      <MapPin className="size-3.5 shrink-0 text-primary" aria-hidden="true" />
                      {delivery.distanceKm !== null
                        ? `${delivery.distanceKm} km`
                        : 'Distância pendente'}
                    </p>
                    {delivery.requiresReturn && (
                      <p className="flex items-center gap-2 font-medium text-primary">
                        <RotateCcw className="size-3.5 shrink-0" aria-hidden="true" />
                        Com retorno
                      </p>
                    )}
                  </div>

                  <div className="mt-auto rounded-xl bg-admin-soft/70 p-2.5 ring-1 ring-inset ring-primary/10">
                    <p className="flex items-center gap-1.5 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
                      <WalletCards className="size-3 text-primary" aria-hidden="true" /> Valor
                    </p>
                    <p className="mt-1 text-sm font-bold text-admin-deep">
                      {money(delivery.totalValue, 'A calcular na entrega')}
                    </p>
                  </div>

                  <div className={`grid gap-2 ${cancellable ? 'grid-cols-2' : 'grid-cols-1'}`}>
                    <Link
                      className="inline-flex h-7 min-w-0 items-center justify-center gap-1 rounded-lg border border-primary/15 bg-card px-2 text-xs font-semibold text-primary shadow-sm transition-colors hover:bg-admin-soft"
                      href={`/pedidos/${delivery.id}`}
                    >
                      Detalhes
                      <ArrowUpRight className="size-3" aria-hidden="true" />
                    </Link>
                    {cancellable && (
                      <CancelDeliveryDialog
                        token={token}
                        deliveryId={delivery.id}
                        displayNumber={delivery.displayNumber}
                        companyName={delivery.companyName}
                        status={delivery.status}
                        /*
                          A lista nao traz o nome do motoboy. O dialogo diz "um
                          motoboy" nesse caso — melhor do que afirmar um nome
                          que esta tela nao sabe.
                        */
                      />
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {resultado && resultado.total > 0 && (
          /*
            A contagem vem do servidor, entao ela e do universo inteiro do
            filtro — e nao do que coube nesta pagina. Era exatamente esse tipo
            de diferenca que fazia a home dizer "20" e listar 8.
          */
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <p className="text-sm text-muted-foreground">
              {resultado.total} pedido(s) · página {resultado.page} de {totalDePaginas}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={pagina <= 1 || deliveriesQuery.isFetching}
                onClick={() => setPagina((atual) => Math.max(1, atual - 1))}
              >
                Anterior
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={pagina >= totalDePaginas || deliveriesQuery.isFetching}
                onClick={() => setPagina((atual) => atual + 1)}
              >
                Próxima
              </Button>
            </div>
          </div>
        )}
      </div>

      <Card className="premium-panel h-fit lg:sticky lg:top-24">
        <CardContent className="space-y-1 pt-6">
          {STATUS_FILTERS.map(({ label, value }) => (
            <button
              key={value}
              onClick={() => {
                setStatusFilter(value);
                // Sem isto, filtrar estando na pagina 4 pediria uma pagina 4
                // que talvez nao exista no novo filtro, e a tela viria vazia.
                setPagina(1);
              }}
              className={`flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm transition-colors hover:bg-accent ${
                statusFilter === value
                  ? 'bg-primary font-semibold text-primary-foreground shadow-sm'
                  : ''
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
