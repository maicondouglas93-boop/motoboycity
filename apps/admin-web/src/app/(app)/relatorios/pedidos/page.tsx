'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { DeliveryStatus } from '@motoboycity/types';
import { Download, ListChecks } from 'lucide-react';
import { StatusChip, STATUS_OPTIONS } from '@/components/orders/status-chip';
import { ReportFilterCard } from '@/components/reports/report-filter-card';
import {
  ReportPageHeader,
  ReportQueryState,
  ReportSectionHeading,
} from '@/components/reports/report-layout';
import { ReportPagination } from '@/components/reports/report-pagination';
import { StatCard } from '@/components/stat-card';
import { Button } from '@/components/ui/button';
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
import { adminCompaniesApi, adminDriversApi, deliveriesApi } from '@/lib/api-client';
import { downloadCsv, toCsv } from '@/lib/csv';
import { useMoney } from '@/lib/money';
import { session } from '@/lib/session';

type OrderFilters = {
  q?: string;
  status?: DeliveryStatus;
  companyId?: string;
  driverId?: string;
  from?: string;
  to?: string;
};

const dateTime = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

function csvNumber(value: number | null): string {
  return value === null ? '' : String(value).replace('.', ',');
}

export default function OrdersReportPage() {
  const token = session.getToken();
  const money = useMoney();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<DeliveryStatus | ''>('');
  const [companyId, setCompanyId] = useState('');
  const [driverId, setDriverId] = useState('');
  const [filterError, setFilterError] = useState<string | null>(null);
  const [appliedFilters, setAppliedFilters] = useState<OrderFilters>({});
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const companiesQuery = useQuery({
    queryKey: ['admin', 'companies'],
    queryFn: () => adminCompaniesApi.list(token as string),
    enabled: Boolean(token),
  });
  const driversQuery = useQuery({
    queryKey: ['admin', 'drivers'],
    queryFn: () => adminDriversApi.list(token as string),
    enabled: Boolean(token),
  });
  const ordersQuery = useQuery({
    queryKey: ['admin', 'orders-report', appliedFilters, page, pageSize],
    queryFn: () => deliveriesApi.search(token as string, { ...appliedFilters, page, pageSize }),
    enabled: Boolean(token),
    placeholderData: keepPreviousData,
  });

  const pageSummary = useMemo(() => {
    const items = ordersQuery.data?.items ?? [];
    return {
      pricedValue: items.reduce((sum, delivery) => sum + (delivery.totalValue ?? 0), 0),
      pendingPrice: items.filter((delivery) => delivery.totalValue === null).length,
    };
  }, [ordersQuery.data?.items]);

  if (!token) {
    return <p className="text-sm text-muted-foreground">Faça login como administrador.</p>;
  }

  function applyFilters() {
    if (from && to && from > to) {
      setFilterError('A data inicial não pode ser posterior à data final.');
      return;
    }
    setFilterError(null);
    setPage(1);
    setAppliedFilters({
      ...(q.trim() && { q: q.trim() }),
      ...(status && { status }),
      ...(companyId && { companyId }),
      ...(driverId && { driverId }),
      ...(from && { from }),
      ...(to && { to }),
    });
  }

  function clearFilters() {
    setFrom('');
    setTo('');
    setQ('');
    setStatus('');
    setCompanyId('');
    setDriverId('');
    setFilterError(null);
    setPage(1);
    setAppliedFilters({});
  }

  const result = ordersQuery.data;
  const orders = result?.items ?? [];

  function exportCurrentPage() {
    const csv = toCsv(
      [
        'Pedido',
        'Nº externo',
        'Empresa',
        'Modalidade',
        'Status',
        'Criado em',
        'Distância (km)',
        'Valor total',
        'Repasse',
        'Receita plataforma',
      ],
      orders.map((delivery) => [
        delivery.displayNumber,
        delivery.externalOrderNumber ?? '',
        delivery.companyName,
        delivery.serviceTypeName,
        delivery.status,
        dateTime.format(new Date(delivery.createdAt)),
        csvNumber(delivery.distanceKm),
        csvNumber(delivery.totalValue),
        csvNumber(delivery.driverValue),
        csvNumber(delivery.platformValue),
      ]),
    );
    downloadCsv(`relatorio-pedidos-pagina-${page}.csv`, csv);
  }

  return (
    <div className="mx-auto w-full max-w-[1480px] space-y-7 pb-12">
      <ReportPageHeader
        icon={ListChecks}
        title="Relatório de pedidos"
        description="Localize pedidos com filtros operacionais, acompanhe o status e navegue por grandes volumes com paginação feita no servidor."
        action={
          <Button
            type="button"
            variant="outline"
            onClick={exportCurrentPage}
            disabled={orders.length === 0 || ordersQuery.isFetching}
            title="Exporta somente os pedidos visíveis nesta página"
          >
            <Download className="size-4" aria-hidden="true" />
            Baixar página em CSV
          </Button>
        }
      />

      <ReportFilterCard
        idPrefix="orders-report"
        from={from}
        to={to}
        onFromChange={setFrom}
        onToChange={setTo}
        onApply={applyFilters}
        onClear={clearFilters}
        isFetching={ordersQuery.isFetching}
        error={filterError}
        description="Datas em branco consultam todo o histórico. A busca aceita o número do pedido, UUID exato ou número externo."
      >
        <div className="min-w-52 flex-[1.4] space-y-1.5 sm:max-w-72">
          <Label htmlFor="orders-report-query">Pedido</Label>
          <Input
            id="orders-report-query"
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder="Número ou pedido externo"
            maxLength={100}
          />
        </div>
        <div className="min-w-44 flex-1 space-y-1.5 sm:max-w-52">
          <Label htmlFor="orders-report-status">Status</Label>
          <select
            id="orders-report-status"
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
        <div className="min-w-52 flex-1 space-y-1.5 sm:max-w-64">
          <Label htmlFor="orders-report-company">Cliente</Label>
          <select
            id="orders-report-company"
            className="h-9 w-full rounded-md border bg-background px-3 text-sm"
            value={companyId}
            onChange={(event) => setCompanyId(event.target.value)}
            disabled={companiesQuery.isLoading}
          >
            <option value="">Todos</option>
            {(companiesQuery.data ?? []).map((company) => (
              <option key={company.id} value={company.id}>
                {company.tradeName}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-52 flex-1 space-y-1.5 sm:max-w-64">
          <Label htmlFor="orders-report-driver">Entregador</Label>
          <select
            id="orders-report-driver"
            className="h-9 w-full rounded-md border bg-background px-3 text-sm"
            value={driverId}
            onChange={(event) => setDriverId(event.target.value)}
            disabled={driversQuery.isLoading}
          >
            <option value="">Todos</option>
            {(driversQuery.data ?? []).map((driver) => (
              <option key={driver.id} value={driver.id}>
                {driver.name}
              </option>
            ))}
          </select>
        </div>
      </ReportFilterCard>

      <ReportQueryState
        loading={ordersQuery.isLoading}
        error={ordersQuery.isError}
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
              className="rounded-xl border border-primary/15 bg-admin-soft/40 px-4 py-3 text-sm text-muted-foreground"
            >
              Atualizando o recorte. Os dados anteriores permanecem visíveis, mas a exportação e a
              paginação ficam bloqueadas até a nova consulta terminar.
            </p>
          )}
          <section className="grid gap-4 sm:grid-cols-3">
            <StatCard
              label="Pedidos encontrados"
              value={result.total}
              hint="Total no filtro, considerando todas as páginas."
            />
            <StatCard
              label="Valor conhecido nesta página"
              value={money(pageSummary.pricedValue)}
              hint="Não representa as demais páginas."
            />
            <StatCard
              label="Aguardando cálculo nesta página"
              value={pageSummary.pendingPrice}
              hint="Pedidos cujo valor ainda depende do destino ou da conclusão."
            />
          </section>

          <section className="space-y-3">
            <ReportSectionHeading
              title="Pedidos encontrados"
              description="A exportação acima inclui somente esta página para não apresentar um arquivo parcial como se fosse o relatório inteiro."
            />
            <Card>
              <CardContent className="p-0" aria-busy={ordersQuery.isFetching}>
                {orders.length === 0 ? (
                  <p className="p-10 text-center text-sm text-muted-foreground">
                    Nenhum pedido corresponde aos filtros aplicados.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableCaption className="sr-only">
                        Pedidos encontrados no relatório paginado
                      </TableCaption>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Pedido</TableHead>
                          <TableHead>Cliente e modalidade</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Criado em</TableHead>
                          <TableHead className="text-right">Distância</TableHead>
                          <TableHead className="text-right">Valor</TableHead>
                          <TableHead className="text-right">Repasse</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {orders.map((delivery) => (
                          <TableRow key={delivery.id}>
                            <TableCell>
                              <Link
                                href={`/pedidos/${delivery.id}`}
                                className="font-mono font-semibold text-primary underline-offset-4 hover:underline"
                              >
                                #{delivery.displayNumber}
                              </Link>
                              {delivery.externalOrderNumber && (
                                <span className="block text-xs text-muted-foreground">
                                  Externo: {delivery.externalOrderNumber}
                                </span>
                              )}
                            </TableCell>
                            <TableCell>
                              <Link
                                href={`/clientes/${delivery.companyId}`}
                                className="font-medium text-admin-deep underline-offset-4 hover:text-primary hover:underline"
                              >
                                {delivery.companyName}
                              </Link>
                              <span className="block text-xs text-muted-foreground">
                                {delivery.serviceTypeName}
                              </span>
                            </TableCell>
                            <TableCell>
                              <StatusChip status={delivery.status} />
                            </TableCell>
                            <TableCell className="whitespace-nowrap text-xs tabular-nums">
                              {dateTime.format(new Date(delivery.createdAt))}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {delivery.distanceKm === null
                                ? '—'
                                : `${delivery.distanceKm.toLocaleString('pt-BR')} km`}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {delivery.totalValue === null ? '—' : money(delivery.totalValue)}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {delivery.driverValue === null ? '—' : money(delivery.driverValue)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>

            <ReportPagination
              page={result.page}
              pageSize={result.pageSize}
              total={result.total}
              isFetching={ordersQuery.isFetching}
              onPageChange={setPage}
              onPageSizeChange={(size) => {
                setPageSize(size);
                setPage(1);
              }}
            />
          </section>
        </div>
      )}
    </div>
  );
}
