'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import type { DeliveryStatus } from '@motoboycity/types';
import {
  ArrowUpRight,
  Bike,
  Building2,
  ListFilter,
  MapPin,
  PackageSearch,
  RotateCcw,
  Route,
  WalletCards,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CancelDeliveryDialog } from '@/components/operations/cancel-delivery-dialog';
import { StatusChip, statusRailClass, statusTone } from '@/components/orders/status-chip';
import { Card, CardContent } from '@/components/ui/card';
import { QueryState } from '@/components/ui/query-state';
import { adminCompaniesApi, deliveriesApi } from '@/lib/api-client';
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
  { label: 'Não entregue — voltando', value: 'FAILED' },
  { label: 'Concluídos', value: 'COMPLETED' },
  { label: 'Cancelados', value: 'CANCELLED' },
  { label: 'Aguardando pagamento', value: 'AWAITING_PAYMENT' },
];

const STATUS_FILTER_VALUES = new Set(STATUS_FILTERS.map((filter) => filter.value));

const FILTER_TONE_CLASS = {
  all: 'border-primary/20 bg-admin-soft text-admin-deep hover:border-primary/40 hover:bg-primary/15',
  aguardando:
    'border-status-aguardando/20 bg-status-aguardando/8 text-status-aguardando hover:border-status-aguardando/40 hover:bg-status-aguardando/12',
  rota: 'border-status-rota/30 bg-status-rota/12 text-[#7a4900] hover:border-status-rota/55 hover:bg-status-rota/20',
  entregue:
    'border-status-entregue/25 bg-status-entregue/10 text-status-entregue hover:border-status-entregue/45 hover:bg-status-entregue/15',
  cancelado:
    'border-status-cancelado/25 bg-status-cancelado/8 text-status-cancelado hover:border-status-cancelado/45 hover:bg-status-cancelado/12',
  pagamento:
    'border-status-pagamento/25 bg-status-pagamento/8 text-status-pagamento hover:border-status-pagamento/45 hover:bg-status-pagamento/12',
} as const;

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
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedStatus = searchParams.get('status');
  const statusFilter = STATUS_FILTER_VALUES.has(
    (requestedStatus ?? 'ALL') as DeliveryStatus | 'ALL',
  )
    ? ((requestedStatus ?? 'ALL') as DeliveryStatus | 'ALL')
    : 'ALL';
  const companyId = searchParams.get('empresa') ?? '';
  const requestedPage = Number(searchParams.get('pagina') ?? '1');
  const pagina = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const trackingQuery = useAdminActiveDeliveryTracking();

  const token = session.getToken();

  const companiesQuery = useQuery({
    queryKey: ['admin', 'companies'],
    queryFn: () => adminCompaniesApi.list(token as string),
    enabled: Boolean(token),
  });

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
    queryKey: ['admin', 'deliveries', statusFilter, companyId, pagina],
    queryFn: () =>
      deliveriesApi.search(token as string, {
        ...(statusFilter !== 'ALL' && { status: statusFilter }),
        ...(companyId && { companyId }),
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
  const totalDePaginas = resultado
    ? Math.max(1, Math.ceil(resultado.total / resultado.pageSize))
    : 1;
  const activeTracking = (trackingQuery.data ?? []).filter(
    (tracking) => !companyId || tracking.companyId === companyId,
  );

  function filterHref(
    updates: Partial<{ status: DeliveryStatus | 'ALL'; empresa: string; pagina: number }>,
  ): string {
    const params = new URLSearchParams(searchParams.toString());

    for (const [key, value] of Object.entries(updates)) {
      if (value === '' || value === 'ALL' || (key === 'pagina' && value === 1)) {
        params.delete(key);
      } else {
        params.set(key, String(value));
      }
    }

    const query = params.toString();
    return query ? `${pathname}?${query}` : pathname;
  }

  return (
    <div className="space-y-6">
      <header className="relative overflow-hidden rounded-3xl border border-primary/25 bg-gradient-to-br from-admin-deep via-primary to-[#0b2c36] px-5 py-6 text-white shadow-[0_24px_54px_-34px_rgba(10,53,64,0.9)] sm:px-7">
        <span
          aria-hidden="true"
          className="absolute -top-12 right-8 size-40 rounded-full bg-colete/20 blur-3xl"
        />
        <span
          aria-hidden="true"
          className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary via-colete to-status-entregue"
        />
        <div className="relative flex flex-wrap items-center justify-between gap-5">
          <div className="flex min-w-0 items-center gap-4">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-[#aee8e4] ring-1 ring-inset ring-white/15">
              <PackageSearch className="size-6" aria-hidden="true" />
            </span>
            <div>
              <p className="text-xs font-bold tracking-[0.16em] text-[#aee8e4] uppercase">
                Central operacional
              </p>
              <h1 className="mt-1" style={{ color: 'white' }}>
                Pedidos
              </h1>
              <p className="mt-1 max-w-2xl text-sm text-white/72">
                Acompanhe o ciclo das entregas, filtre a operação e abra os detalhes sem perder seu
                contexto.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-2xl bg-black/15 px-4 py-3 ring-1 ring-inset ring-white/10">
            <Route className="size-5 text-colete" aria-hidden="true" />
            <div>
              <p className="text-xs text-white/60">Rastreamento agora</p>
              <p className="font-mono text-lg font-bold tabular-nums">
                {trackingQuery.isSuccess ? activeTracking.length : '—'} ativa
                {trackingQuery.isSuccess && activeTracking.length === 1 ? '' : 's'}
              </p>
            </div>
          </div>
        </div>
      </header>

      <Card className="premium-panel border-primary/20 bg-gradient-to-r from-card via-card to-admin-soft/55">
        <CardContent className="space-y-4 py-4">
          <div className="flex items-center gap-2">
            <span className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <ListFilter className="size-4" aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-sm font-semibold">Filtros da operação</h2>
              <p className="text-xs text-muted-foreground">
                Os filtros ficam salvos no endereço desta página.
              </p>
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-[260px_1fr] xl:items-end">
            <div className="space-y-2">
              <label
                htmlFor="orders-company-filter"
                className="flex items-center gap-2 text-sm font-semibold text-admin-deep"
              >
                <Building2 className="size-4 text-primary" aria-hidden="true" />
                Empresa
              </label>
              <select
                id="orders-company-filter"
                className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm shadow-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-60"
                value={companyId}
                onChange={(event) =>
                  router.replace(filterHref({ empresa: event.target.value, pagina: 1 }), {
                    scroll: false,
                  })
                }
                disabled={companiesQuery.isLoading}
              >
                <option value="">
                  {companiesQuery.isLoading ? 'Carregando empresas...' : 'Todas as empresas'}
                </option>
                {(companiesQuery.data ?? []).map((company) => (
                  <option key={company.id} value={company.id}>
                    {company.tradeName}
                  </option>
                ))}
              </select>
              {companiesQuery.isError && (
                <div className="flex items-center justify-between gap-3 rounded-lg bg-alerta/8 px-3 py-2 text-xs text-alerta ring-1 ring-inset ring-alerta/15">
                  <span>Não foi possível carregar as empresas.</span>
                  <button
                    type="button"
                    className="shrink-0 font-semibold underline-offset-2 hover:underline"
                    onClick={() => void companiesQuery.refetch()}
                  >
                    Tentar novamente
                  </button>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <p className="text-sm font-semibold text-admin-deep">Status</p>
              <nav aria-label="Filtrar pedidos por status" className="flex flex-wrap gap-2">
                {STATUS_FILTERS.map(({ label, value }) => {
                  const selected = statusFilter === value;
                  const tone = value === 'ALL' ? 'all' : statusTone(value);

                  return (
                    <Link
                      key={value}
                      href={filterHref({ status: value, pagina: 1 })}
                      scroll={false}
                      aria-current={selected ? 'page' : undefined}
                      className={`inline-flex min-h-9 items-center gap-2 rounded-full border px-3 py-2 text-xs font-semibold transition-all focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${FILTER_TONE_CLASS[tone]} ${
                        selected
                          ? 'shadow-sm ring-2 ring-current/15'
                          : 'opacity-80 hover:opacity-100'
                      }`}
                    >
                      <span
                        aria-hidden="true"
                        className={`size-2 rounded-full ${value === 'ALL' ? 'bg-primary' : statusRailClass(value)}`}
                      />
                      {label}
                    </Link>
                  );
                })}
              </nav>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-5">
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="relative flex size-8 items-center justify-center rounded-xl bg-status-entregue/10 text-status-entregue">
                <MapPin className="size-4" aria-hidden="true" />
                {activeTracking.length > 0 && (
                  <span className="absolute top-1 right-1 size-1.5 animate-pulse rounded-full bg-status-entregue" />
                )}
              </span>
              <h2 className="font-semibold">Rastreamento ao vivo</h2>
            </div>
            <span className="rounded-full bg-status-entregue/10 px-2.5 py-1 text-xs font-semibold text-status-entregue ring-1 ring-inset ring-status-entregue/20">
              {activeTracking.length} entrega{activeTracking.length === 1 ? '' : 's'} ativa
              {activeTracking.length === 1 ? '' : 's'}
            </span>
          </div>
          {trackingQuery.isLoading ? (
            <QueryState
              compact
              kind="loading"
              title="Carregando rastreamento"
              description="Consultando as últimas posições enviadas pelos motoboys."
            />
          ) : trackingQuery.isError ? (
            <QueryState
              compact
              kind="error"
              title="O rastreamento não respondeu"
              description="Os pedidos continuam disponíveis abaixo; tente consultar as posições novamente."
              onAction={() => void trackingQuery.refetch()}
            />
          ) : activeTracking.length === 0 ? (
            <QueryState
              compact
              kind="empty"
              title="Nenhuma entrega com rastreamento ativo"
              description="Quando um motoboy estiver em rota, a posição aparecerá aqui."
            />
          ) : (
            <div className="grid gap-2 md:grid-cols-2">
              {activeTracking.map((tracking) => (
                <Card
                  key={tracking.deliveryId}
                  className="order-list-card border-status-entregue/20 bg-gradient-to-br from-card to-dinheiro-recebido-suave/55"
                >
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

        <section className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="font-semibold">Pedidos da operação</h2>
              <p className="text-sm text-muted-foreground">
                {companyId ? 'Empresa e status combinados no resultado.' : 'Todas as empresas.'}
              </p>
            </div>
            {deliveriesQuery.isFetching && !deliveriesQuery.isLoading && (
              <span className="rounded-full bg-status-pagamento/10 px-2.5 py-1 text-xs font-semibold text-status-pagamento">
                Atualizando dados…
              </span>
            )}
          </div>

          {deliveriesQuery.isLoading && (
            <QueryState
              kind="loading"
              title="Carregando pedidos"
              description="Aplicando os filtros e consultando a operação."
            />
          )}
          {deliveriesQuery.isError && (
            <QueryState
              kind="error"
              title="Não foi possível carregar os pedidos"
              description="Confira a conexão e tente novamente sem perder os filtros selecionados."
              onAction={() => void deliveriesQuery.refetch()}
            />
          )}
          {deliveriesQuery.isSuccess && deliveries.length === 0 && (
            <QueryState
              kind="empty"
              title="Nenhum pedido encontrado"
              description="Não há pedidos que correspondam à empresa e ao status selecionados."
            />
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
                        className="max-w-full px-2 py-1 text-xs"
                      />
                    </div>

                    <div className="min-w-0 space-y-1">
                      <p className="flex items-center gap-1.5 text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">
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

                    <div className="mt-auto rounded-xl bg-dinheiro-informativo-suave/75 p-2.5 ring-1 ring-inset ring-status-pagamento/10">
                      <p className="flex items-center gap-1.5 text-xs font-semibold tracking-[0.08em] text-status-pagamento uppercase">
                        <WalletCards className="size-3.5" aria-hidden="true" /> Valor
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
                  onClick={() =>
                    router.push(filterHref({ pagina: Math.max(1, pagina - 1) }), { scroll: false })
                  }
                >
                  Anterior
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pagina >= totalDePaginas || deliveriesQuery.isFetching}
                  onClick={() => router.push(filterHref({ pagina: pagina + 1 }), { scroll: false })}
                >
                  Próxima
                </Button>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
