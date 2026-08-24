'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowDownUp, Building2, Download } from 'lucide-react';
import { ReportFilterCard } from '@/components/reports/report-filter-card';
import {
  ReportPageHeader,
  ReportPeriodSummary,
  ReportQueryState,
  ReportSectionHeading,
} from '@/components/reports/report-layout';
import { ReportPagination } from '@/components/reports/report-pagination';
import { StatCard } from '@/components/stat-card';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { adminReportsApi } from '@/lib/api-client';
import { downloadCsv, toCsv } from '@/lib/csv';
import { useMoney } from '@/lib/money';
import { session } from '@/lib/session';

type SortKey =
  | 'companyName'
  | 'createdCount'
  | 'completedCount'
  | 'cancelledCount'
  | 'completedTotalValue'
  | 'platformValue';

const columns: Array<{ key: SortKey; label: string }> = [
  { key: 'companyName', label: 'Cliente' },
  { key: 'createdCount', label: 'Criados' },
  { key: 'completedCount', label: 'Concluídos' },
  { key: 'cancelledCount', label: 'Hoje cancelados' },
  { key: 'completedTotalValue', label: 'Valor concluído' },
  { key: 'platformValue', label: 'Receita plataforma' },
];

function csvNumber(value: number): string {
  return String(value).replace('.', ',');
}

export default function ClientsReportPage() {
  const token = session.getToken();
  const money = useMoney();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [periodError, setPeriodError] = useState<string | null>(null);
  const [appliedPeriod, setAppliedPeriod] = useState<{ from?: string; to?: string }>({});
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('completedTotalValue');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const reportQuery = useQuery({
    queryKey: ['admin', 'operations-report', 'clients', appliedPeriod],
    queryFn: () => adminReportsApi.operations(token as string, appliedPeriod),
    enabled: Boolean(token),
  });

  const filteredCompanies = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase('pt-BR');
    const companies = (reportQuery.data?.companies ?? []).filter((company) =>
      normalizedSearch
        ? company.companyName.toLocaleLowerCase('pt-BR').includes(normalizedSearch)
        : true,
    );
    return [...companies].sort((left, right) => {
      const a = left[sortKey];
      const b = right[sortKey];
      const comparison =
        typeof a === 'string' ? a.localeCompare(String(b), 'pt-BR') : Number(a) - Number(b);
      return (
        (sortDirection === 'asc' ? comparison : -comparison) ||
        left.companyName.localeCompare(right.companyName, 'pt-BR')
      );
    });
  }, [reportQuery.data?.companies, search, sortDirection, sortKey]);

  const visibleCompanies = useMemo(
    () => filteredCompanies.slice((page - 1) * pageSize, page * pageSize),
    [filteredCompanies, page, pageSize],
  );

  if (!token) {
    return <p className="text-sm text-muted-foreground">Faça login como administrador.</p>;
  }

  function applyPeriod() {
    if (from && to && from > to) {
      setPeriodError('A data inicial não pode ser posterior à data final.');
      return;
    }
    setPeriodError(null);
    setPage(1);
    setAppliedPeriod({ ...(from && { from }), ...(to && { to }) });
  }

  function clearPeriod() {
    setFrom('');
    setTo('');
    setPeriodError(null);
    setPage(1);
    setAppliedPeriod({});
  }

  function changeSort(nextKey: SortKey) {
    if (sortKey === nextKey) {
      setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(nextKey);
      setSortDirection(nextKey === 'companyName' ? 'asc' : 'desc');
    }
    setPage(1);
  }

  function exportCsv() {
    const csv = toCsv(
      [
        'Cliente',
        'Pedidos criados',
        'Entregas concluídas',
        'Criados no período e hoje cancelados',
        'Valor concluído',
        'Receita plataforma',
      ],
      filteredCompanies.map((company) => [
        company.companyName,
        company.createdCount,
        company.completedCount,
        company.cancelledCount,
        csvNumber(company.completedTotalValue),
        csvNumber(company.platformValue),
      ]),
    );
    downloadCsv('relatorio-clientes.csv', csv);
  }

  const report = reportQuery.data;

  return (
    <div className="mx-auto w-full max-w-[1480px] space-y-7 pb-12">
      <ReportPageHeader
        icon={Building2}
        title="Desempenho por cliente"
        description="Compare quem movimenta a operação por volume criado, entregas concluídas, valores realizados e pedidos do recorte que hoje estão cancelados."
        action={
          <Button
            type="button"
            variant="outline"
            onClick={exportCsv}
            disabled={filteredCompanies.length === 0}
          >
            <Download className="size-4" aria-hidden="true" />
            Baixar CSV
          </Button>
        }
      />

      <ReportFilterCard
        idPrefix="clients-report"
        from={from}
        to={to}
        onFromChange={setFrom}
        onToChange={setTo}
        onApply={applyPeriod}
        onClear={clearPeriod}
        isFetching={reportQuery.isFetching}
        error={periodError}
        description="Sem datas, o relatório usa os últimos 30 dias civis, no horário de São Paulo."
      />

      <ReportQueryState
        loading={reportQuery.isLoading}
        error={reportQuery.isError}
        onRetry={() => {
          void reportQuery.refetch();
        }}
      />

      {report && (
        <div className="space-y-8">
          <ReportPeriodSummary
            period={report.period}
            comparisonPeriod={report.comparison.period}
            live={report.live}
          />

          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Clientes com atividade"
              value={report.companies.length}
              hint="Criaram pedidos ou tiveram conclusões no período."
            />
            <StatCard label="Pedidos criados" value={report.ordersCreated.count} />
            <StatCard label="Entregas concluídas" value={report.deliveriesCompleted.count} />
            <StatCard
              label="Valor concluído"
              value={money(report.deliveriesCompleted.totalValue)}
            />
          </section>

          <section className="space-y-4">
            <ReportSectionHeading
              title="Ranking de clientes"
              description="Criados e concluídos usam relógios diferentes, por isso não viram uma taxa. 'Hoje cancelados' considera o estado atual dos pedidos criados no recorte."
              action={
                <Input
                  aria-label="Buscar cliente no relatório"
                  className="w-72 max-w-full"
                  placeholder="Buscar cliente..."
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value);
                    setPage(1);
                  }}
                />
              }
            />

            <Card>
              <CardContent className="overflow-x-auto p-0">
                {visibleCompanies.length === 0 ? (
                  <p className="p-10 text-center text-sm text-muted-foreground">
                    Nenhum cliente corresponde a este recorte.
                  </p>
                ) : (
                  <Table>
                    <TableCaption className="sr-only">
                      Ranking de clientes por atividade e valores no período
                    </TableCaption>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-14">#</TableHead>
                        {columns.map((column) => (
                          <TableHead
                            key={column.key}
                            className={column.key === 'companyName' ? '' : 'text-right'}
                            aria-sort={
                              sortKey === column.key
                                ? sortDirection === 'asc'
                                  ? 'ascending'
                                  : 'descending'
                                : 'none'
                            }
                          >
                            <button
                              type="button"
                              onClick={() => changeSort(column.key)}
                              className={`inline-flex items-center gap-1 whitespace-nowrap ${
                                column.key === 'companyName' ? '' : 'ml-auto'
                              }`}
                            >
                              {column.label}
                              <ArrowDownUp className="size-3" aria-hidden="true" />
                            </button>
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {visibleCompanies.map((company, index) => (
                        <TableRow key={company.companyId}>
                          <TableCell className="font-mono text-xs text-muted-foreground">
                            {(page - 1) * pageSize + index + 1}
                          </TableCell>
                          <TableCell>
                            <Link
                              href={`/clientes/${company.companyId}`}
                              className="font-medium text-primary underline-offset-4 hover:underline"
                            >
                              {company.companyName}
                            </Link>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {company.createdCount}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {company.completedCount}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {company.cancelledCount}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {money(company.completedTotalValue)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {money(company.platformValue)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            <ReportPagination
              page={page}
              pageSize={pageSize}
              total={filteredCompanies.length}
              isFetching={reportQuery.isFetching}
              itemLabel="clientes"
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
