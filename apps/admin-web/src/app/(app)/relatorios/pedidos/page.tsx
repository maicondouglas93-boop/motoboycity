'use client';

import Link from 'next/link';
import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import type { DeliveryStatus, OrderFinancialStatus } from '@motoboycity/types';
import type { AdminOrderReportQuery } from '@motoboycity/validation';
import { adminOrderReportQuerySchema } from '@motoboycity/validation';
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
import { adminCompaniesApi, adminDriversApi, adminDeliveriesApi } from '@/lib/api-client';
import { downloadCsv, toCsv } from '@/lib/csv';
import { useMoney } from '@/lib/money';
import { session } from '@/lib/session';

type OrderFilters = Partial<Omit<AdminOrderReportQuery, 'page' | 'pageSize'>>;
const FINANCIAL_FILTERS = {
  ALL: 'Todos',
  OPEN: 'Em aberto (não pagos)',
  UNBILLED: 'Sem fatura',
  PENDING: 'Fatura pendente',
  OVERDUE: 'Fatura vencida',
  PAID: 'Pagos',
} as const;
const FINANCIAL_LABELS: Record<OrderFinancialStatus, string> = {
  UNBILLED: 'Em aberto · sem fatura',
  PENDING: 'Em aberto · fatura pendente',
  OVERDUE: 'Em aberto · fatura vencida',
  PAID: 'Pago',
  CANCELLED: 'Pedido cancelado',
  NOT_APPLICABLE: 'Fora do faturamento',
  NOT_READY: 'Aguardando conclusão',
  INVOICE_CANCELLED: 'Fatura cancelada · conferir',
};

const dateTime = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'America/Sao_Paulo',
});

function csvNumber(value: number | null): string {
  return value === null ? '' : String(value).replace('.', ',');
}

export default function OrdersReportPage() {
  return (
    <Suspense fallback={<p>Carregando relatório...</p>}>
      <OrdersReportRoute />
    </Suspense>
  );
}

function OrdersReportRoute() {
  const searchParams = useSearchParams();
  const companyId = searchParams.get('empresa') ?? '';
  return <OrdersReportContent key={companyId} initialCompanyId={companyId} />;
}

function OrdersReportContent({ initialCompanyId }: { initialCompanyId: string }) {
  const token = session.getToken();
  const money = useMoney();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<DeliveryStatus | ''>('');
  const [companyId, setCompanyId] = useState(initialCompanyId);
  const [financialStatus, setFinancialStatus] =
    useState<AdminOrderReportQuery['financialStatus']>('ALL');
  const [dateField, setDateField] = useState<AdminOrderReportQuery['dateField']>('CREATED');
  const [driverId, setDriverId] = useState('');
  const [filterError, setFilterError] = useState<string | null>(null);
  const [appliedFilters, setAppliedFilters] = useState<OrderFilters>({
    ...(initialCompanyId && { companyId: initialCompanyId }),
    financialStatus: 'ALL',
    dateField: 'CREATED',
  });
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
    queryKey: ['admin', 'financial', 'orders-report', appliedFilters, page, pageSize],
    queryFn: () =>
      adminDeliveriesApi.report(token as string, { ...appliedFilters, page, pageSize }),
    enabled: Boolean(token),
  });

  const filtersChanged =
    (appliedFilters.from ?? '') !== from ||
    (appliedFilters.to ?? '') !== to ||
    (appliedFilters.companyId ?? '') !== companyId ||
    (appliedFilters.driverId ?? '') !== driverId ||
    (appliedFilters.status ?? '') !== status ||
    (appliedFilters.q ?? '') !== q.trim() ||
    appliedFilters.financialStatus !== financialStatus ||
    appliedFilters.dateField !== dateField;

  if (!token) {
    return <p className="text-sm text-muted-foreground">Faça login como administrador.</p>;
  }

  function applyFilters() {
    const next: OrderFilters = {
      ...(q.trim() && { q: q.trim() }),
      ...(status && { status }),
      ...(companyId && { companyId }),
      ...(driverId && { driverId }),
      ...(from && { from }),
      ...(to && { to }),
      financialStatus,
      dateField,
    };
    const parsed = adminOrderReportQuerySchema.safeParse(next);
    if (!parsed.success) {
      setFilterError(parsed.error.issues[0]?.message ?? 'Confira os filtros informados.');
      return;
    }
    setFilterError(null);
    if (!filtersChanged && page === 1) void ordersQuery.refetch();
    setPage(1);
    setAppliedFilters(next);
  }

  function clearFilters() {
    setFrom('');
    setTo('');
    setQ('');
    setStatus('');
    setCompanyId(initialCompanyId);
    setFinancialStatus('ALL');
    setDateField('CREATED');
    setDriverId('');
    setFilterError(null);
    setPage(1);
    setAppliedFilters({
      ...(initialCompanyId && { companyId: initialCompanyId }),
      financialStatus: 'ALL',
      dateField: 'CREATED',
    });
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
        'Situação financeira',
        'Fatura',
        'Criado em',
        'Concluído em',
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
        FINANCIAL_LABELS[delivery.financialStatus],
        delivery.invoice?.number ?? '',
        dateTime.format(new Date(delivery.createdAt)),
        delivery.completedAt ? dateTime.format(new Date(delivery.completedAt)) : '',
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
        description="Consulte pedidos por cliente, período e situação financeira. O valor total considera todos os resultados da busca."
        action={
          <Button
            type="button"
            variant="outline"
            onClick={exportCurrentPage}
            disabled={
              orders.length === 0 || ordersQuery.isFetching || ordersQuery.isError || filtersChanged
            }
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
        applyLabel="Buscar pedidos"
        description="Escolha cliente, intervalo e situação financeira e clique em Buscar pedidos. Datas inclusivas no horário de Brasília; em branco, todo o histórico."
      >
        <div className="min-w-44 flex-1 space-y-1.5 sm:max-w-56">
          <Label htmlFor="orders-report-date-field">Data considerada</Label>
          <select
            id="orders-report-date-field"
            className="h-9 w-full rounded-md border bg-background px-3 text-sm"
            value={dateField}
            onChange={(e) => setDateField(e.target.value as typeof dateField)}
          >
            <option value="CREATED">Criação do pedido</option>
            <option value="COMPLETED">Conclusão da entrega</option>
          </select>
        </div>
        <div className="min-w-52 flex-1 space-y-1.5 sm:max-w-64">
          <Label htmlFor="orders-report-financial">Situação financeira</Label>
          <select
            id="orders-report-financial"
            className="h-9 w-full rounded-md border bg-background px-3 text-sm"
            value={financialStatus}
            onChange={(e) => setFinancialStatus(e.target.value as typeof financialStatus)}
          >
            {Object.entries(FINANCIAL_FILTERS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
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
          <Label htmlFor="orders-report-status">Status da entrega</Label>
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

      <p className="text-sm text-muted-foreground">
        Em aberto = entregas concluídas cobradas por fatura, ainda sem fatura ou com fatura
        pendente/vencida. Não inclui pedidos cancelados, em andamento ou fora do faturamento.
        “Conclusão” consulta somente entregas concluídas.
      </p>
      {filtersChanged && (
        <p role="status" className="rounded-xl border border-primary/20 bg-admin-soft p-3 text-sm">
          Filtros alterados. Clique em Buscar pedidos para atualizar a lista e o total abaixo.
        </p>
      )}
      {(companiesQuery.isError || driversQuery.isError) && (
        <p role="alert" className="text-sm text-destructive">
          Não foi possível carregar todos os clientes ou entregadores.{' '}
          <button
            type="button"
            className="underline"
            onClick={() => {
              void companiesQuery.refetch();
              void driversQuery.refetch();
            }}
          >
            Tentar novamente
          </button>
        </p>
      )}

      <ReportQueryState
        loading={ordersQuery.isLoading}
        error={ordersQuery.isError}
        loadingLabel="Carregando pedidos..."
        onRetry={() => {
          void ordersQuery.refetch();
        }}
      />

      {result && !ordersQuery.isError && !filtersChanged && (
        <div className="space-y-5">
          <p className="text-sm text-muted-foreground">
            Resultado aplicado:{' '}
            {companiesQuery.data?.find((company) => company.id === appliedFilters.companyId)
              ?.tradeName ??
              (appliedFilters.companyId ? 'Cliente selecionado' : 'Todos os clientes')}{' '}
            · {FINANCIAL_FILTERS[appliedFilters.financialStatus ?? 'ALL']} ·{' '}
            {appliedFilters.dateField === 'COMPLETED' ? 'Conclusão' : 'Criação'}:{' '}
            {appliedFilters.from?.split('-').reverse().join('/') || 'início do histórico'} até{' '}
            {appliedFilters.to?.split('-').reverse().join('/') || 'fim do histórico'}.
          </p>
          <section className="grid gap-4 sm:grid-cols-3">
            <StatCard
              label="Pedidos encontrados"
              value={result.total}
              hint="Total no filtro, considerando todas as páginas."
            />
            <StatCard
              label="Valor total dos pedidos no filtro"
              value={money(result.summary.totalValue)}
              hint="Valores conhecidos de todas as páginas. Em Todos, inclui cancelados e não representa saldo a cobrar."
            />
            <StatCard
              label="Aguardando cálculo no filtro"
              value={result.summary.unpricedCount}
              hint="De todas as páginas; não entram no total até terem valor definido."
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
                          <TableHead>Status da entrega</TableHead>
                          <TableHead>Situação financeira</TableHead>
                          <TableHead>Criado em</TableHead>
                          <TableHead>Concluído em</TableHead>
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
                            <TableCell>
                              <span>{FINANCIAL_LABELS[delivery.financialStatus]}</span>
                              {delivery.invoice && (
                                <Link
                                  href={`/faturas/${delivery.invoice.id}`}
                                  className="block text-xs text-primary underline"
                                >
                                  {delivery.invoice.number}
                                </Link>
                              )}
                            </TableCell>
                            <TableCell className="whitespace-nowrap text-xs tabular-nums">
                              {dateTime.format(new Date(delivery.createdAt))}
                            </TableCell>
                            <TableCell className="whitespace-nowrap text-xs tabular-nums">
                              {delivery.completedAt
                                ? dateTime.format(new Date(delivery.completedAt))
                                : '—'}
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
