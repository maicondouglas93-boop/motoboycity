'use client';

import Link from 'next/link';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ApiError } from '@motoboycity/api-client';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { DeliveryStatus } from '@motoboycity/types';
import { ListChecks } from 'lucide-react';
import { StatusChip, STATUS_OPTIONS } from '@/components/orders/status-chip';
import { ReportFilterCard } from '@/components/reports/report-filter-card';
import {
  ReportPageHeader,
  ReportPeriodSummary,
  ReportQueryState,
  ReportSectionHeading,
} from '@/components/reports/report-layout';
import { REPORT_PAGE_SIZES, ReportPagination } from '@/components/reports/report-pagination';
import { StatCard } from '@/components/stat-card';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { deliveriesApi } from '@/lib/api-client';
import { somarDinheiro } from '@/lib/dinheiro';
import { defaultReportPeriod, isReportDate } from '@/lib/report-period';
import { session } from '@/lib/session';

const dateTime = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  dateStyle: 'short',
  timeStyle: 'short',
});
const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const validStatuses = new Set<DeliveryStatus>(STATUS_OPTIONS.map((option) => option.value));

function positiveInteger(value: string | null, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function statusFrom(value: string | null): DeliveryStatus | undefined {
  return value && validStatuses.has(value as DeliveryStatus)
    ? (value as DeliveryStatus)
    : undefined;
}

function pageSizeFrom(value: string | null): number {
  const parsed = positiveInteger(value, 25);
  return REPORT_PAGE_SIZES.includes(parsed as (typeof REPORT_PAGE_SIZES)[number]) ? parsed : 25;
}

function queryErrorMessage(error: unknown): string | null {
  if (!error) return null;
  return error instanceof ApiError
    ? error.message
    : 'Não foi possível consultar os pedidos. Tente novamente.';
}

function OrdersReportView() {
  const token = session.getToken();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const defaultPeriod = useMemo(() => defaultReportPeriod(), []);

  const applied = useMemo(() => {
    const fromParam = searchParams.get('from');
    const toParam = searchParams.get('to');
    const q = searchParams.get('q')?.trim().slice(0, 100) || undefined;
    return {
      from: isReportDate(fromParam) ? fromParam : defaultPeriod.from,
      to: isReportDate(toParam) ? toParam : defaultPeriod.to,
      q,
      status: statusFrom(searchParams.get('status')),
      page: positiveInteger(searchParams.get('page'), 1),
      pageSize: pageSizeFrom(searchParams.get('pageSize')),
    };
  }, [defaultPeriod, searchParams]);

  const [from, setFrom] = useState(applied.from);
  const [to, setTo] = useState(applied.to);
  const [q, setQ] = useState(applied.q ?? '');
  const [status, setStatus] = useState<DeliveryStatus | ''>(applied.status ?? '');
  const [filterError, setFilterError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    let changed = false;
    if (params.get('from') !== applied.from) {
      params.set('from', applied.from);
      changed = true;
    }
    if (params.get('to') !== applied.to) {
      params.set('to', applied.to);
      changed = true;
    }
    if (params.get('page') !== String(applied.page)) {
      params.set('page', String(applied.page));
      changed = true;
    }
    if (params.get('pageSize') !== String(applied.pageSize)) {
      params.set('pageSize', String(applied.pageSize));
      changed = true;
    }
    if (searchParams.get('status') && !applied.status) {
      params.delete('status');
      changed = true;
    }
    if (changed) router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [applied, pathname, router, searchParams]);

  const ordersQuery = useQuery({
    queryKey: ['company', 'reports', 'orders', applied],
    queryFn: () =>
      deliveriesApi.search(token as string, {
        from: applied.from,
        to: applied.to,
        ...(applied.q && { q: applied.q }),
        ...(applied.status && { status: applied.status }),
        page: applied.page,
        pageSize: applied.pageSize,
      }),
    enabled: Boolean(token),
    placeholderData: keepPreviousData,
  });

  const pageSummary = useMemo(() => {
    const items = ordersQuery.data?.items ?? [];
    return {
      knownValue: somarDinheiro(items.map((delivery) => delivery.totalValue)),
      pendingPrice: items.filter((delivery) => delivery.totalValue === null).length,
    };
  }, [ordersQuery.data?.items]);

  if (!token) {
    return <p className="text-sm text-muted-foreground">Faça login para consultar o relatório.</p>;
  }

  function navigate(params: URLSearchParams) {
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  }

  function applyFilters() {
    if (!isReportDate(from) || !isReportDate(to)) {
      setFilterError('Informe as duas datas do período.');
      return;
    }
    if (from > to) {
      setFilterError('A data inicial não pode ser posterior à data final.');
      return;
    }
    setFilterError(null);
    const params = new URLSearchParams();
    params.set('from', from);
    params.set('to', to);
    params.set('page', '1');
    params.set('pageSize', String(applied.pageSize));
    if (q.trim()) params.set('q', q.trim().slice(0, 100));
    if (status) params.set('status', status);
    navigate(params);
  }

  function clearFilters() {
    setFilterError(null);
    const period = defaultReportPeriod();
    setFrom(period.from);
    setTo(period.to);
    setQ('');
    setStatus('');
    const params = new URLSearchParams({
      from: period.from,
      to: period.to,
      page: '1',
      pageSize: '25',
    });
    navigate(params);
  }

  function changePage(page: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('page', String(page));
    navigate(params);
  }

  function changePageSize(pageSize: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('page', '1');
    params.set('pageSize', String(pageSize));
    navigate(params);
  }

  const result = ordersQuery.data;
  const orders = result?.items ?? [];

  return (
    <div className="mx-auto w-full max-w-[1480px] space-y-7 pb-12">
      <ReportPageHeader
        icon={ListChecks}
        title="Histórico de pedidos"
        description="Consulte grandes volumes sem baixar o histórico inteiro: os filtros e a paginação são processados no servidor e limitados à sua empresa."
      />

      <ReportFilterCard
        idPrefix="company-orders-report"
        from={from}
        to={to}
        onFromChange={setFrom}
        onToChange={setTo}
        onApply={applyFilters}
        onClear={clearFilters}
        isFetching={ordersQuery.isFetching}
        error={filterError}
        description="O período padrão cobre os últimos 30 dias. A busca aceita o número do pedido, UUID exato ou número externo."
      >
        <div className="min-w-52 flex-[1.4] space-y-1.5 sm:max-w-72">
          <Label htmlFor="company-orders-report-query">Pedido</Label>
          <Input
            id="company-orders-report-query"
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder="Número ou pedido externo"
            maxLength={100}
          />
        </div>
        <div className="min-w-44 flex-1 space-y-1.5 sm:max-w-52">
          <Label htmlFor="company-orders-report-status">Status</Label>
          <select
            id="company-orders-report-status"
            className="h-9 w-full rounded-md border bg-background px-3 text-sm"
            value={status}
            onChange={(event) => setStatus(event.target.value as DeliveryStatus | '')}
          >
            <option value="">Todos</option>
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </ReportFilterCard>

      <ReportPeriodSummary
        period={{ from: applied.from, to: applied.to }}
        live={applied.to === defaultPeriod.to}
      />

      <ReportQueryState
        loading={ordersQuery.isLoading}
        errorMessage={queryErrorMessage(ordersQuery.error)}
        loadingLabel="Carregando pedidos..."
        onRetry={() => {
          void ordersQuery.refetch();
        }}
      />

      {result && !ordersQuery.isError && (
        <div className="space-y-5">
          {ordersQuery.isPlaceholderData && (
            <p
              role="status"
              className="rounded-xl border border-portal/15 bg-portal-soft/40 px-4 py-3 text-sm text-muted-foreground"
            >
              Atualizando o recorte. Os dados anteriores permanecem visíveis até a consulta
              terminar.
            </p>
          )}

          <section className="grid gap-4 sm:grid-cols-3">
            <StatCard label="Pedidos encontrados" value={result.total} />
            <StatCard
              label="Custo conhecido nesta página"
              value={currency.format(pageSummary.knownValue)}
            />
            <StatCard label="Aguardando cálculo nesta página" value={pageSummary.pendingPrice} />
          </section>

          <section className="space-y-3">
            <ReportSectionHeading
              title="Pedidos encontrados"
              description="O custo exibido acima pertence somente à página visível; o total consolidado entrará no Analítico geral."
            />
            <Card>
              <CardContent className="overflow-x-auto p-0" aria-busy={ordersQuery.isFetching}>
                <Table>
                  <TableCaption className="sr-only">
                    Pedidos da empresa no filtro aplicado
                  </TableCaption>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Pedido</TableHead>
                      <TableHead>Criado em</TableHead>
                      <TableHead>Modalidade</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Operação</TableHead>
                      <TableHead className="text-right">Distância</TableHead>
                      <TableHead className="text-right">Custo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {orders.map((delivery) => (
                      <TableRow key={delivery.id}>
                        <TableCell>
                          <Link
                            href={`/pedidos/${delivery.id}`}
                            className="font-mono font-semibold text-portal underline-offset-4 hover:text-portal-deep hover:underline"
                          >
                            #{delivery.displayNumber}
                          </Link>
                          {delivery.externalOrderNumber && (
                            <p className="mt-1 max-w-48 truncate text-xs text-muted-foreground">
                              Externo: {delivery.externalOrderNumber}
                            </p>
                          )}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {dateTime.format(new Date(delivery.createdAt))}
                        </TableCell>
                        <TableCell>{delivery.serviceTypeName}</TableCell>
                        <TableCell>
                          <StatusChip status={delivery.status} />
                        </TableCell>
                        <TableCell>
                          <div className="flex max-w-48 flex-wrap gap-1.5">
                            {delivery.batchId && <Badge variant="secondary">Lote</Badge>}
                            {delivery.requiresReturn && <Badge variant="outline">Retorno</Badge>}
                            {!delivery.destinationKnownAtCreation && (
                              <Badge variant="secondary">Destino por GPS</Badge>
                            )}
                            {!delivery.batchId &&
                              !delivery.requiresReturn &&
                              delivery.destinationKnownAtCreation && (
                                <span className="text-xs text-muted-foreground">Pedido avulso</span>
                              )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {delivery.distanceKm === null
                            ? 'A calcular'
                            : `${delivery.distanceKm} km`}
                        </TableCell>
                        <TableCell className="text-right font-medium whitespace-nowrap tabular-nums">
                          {delivery.totalValue === null
                            ? 'A calcular'
                            : currency.format(delivery.totalValue)}
                        </TableCell>
                      </TableRow>
                    ))}
                    {orders.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={7} className="py-12 text-center text-muted-foreground">
                          Nenhum pedido encontrado neste recorte.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </section>

          <ReportPagination
            page={result.page}
            pageSize={result.pageSize}
            total={result.total}
            isFetching={ordersQuery.isFetching}
            onPageChange={changePage}
            onPageSizeChange={changePageSize}
            itemLabel="pedidos"
          />
        </div>
      )}
    </div>
  );
}

function OrdersReportContent() {
  const searchParams = useSearchParams();
  return <OrdersReportView key={searchParams.toString()} />;
}

export default function OrdersReportPage() {
  return (
    <Suspense
      fallback={
        <p className="text-sm text-muted-foreground" role="status">
          Preparando relatório...
        </p>
      }
    >
      <OrdersReportContent />
    </Suspense>
  );
}
