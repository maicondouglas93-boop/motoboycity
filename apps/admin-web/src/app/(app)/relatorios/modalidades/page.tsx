'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowDownUp, Download, Layers3 } from 'lucide-react';
import { ReportFilterCard } from '@/components/reports/report-filter-card';
import {
  ReportPageHeader,
  ReportPeriodSummary,
  ReportQueryState,
  ReportSectionHeading,
} from '@/components/reports/report-layout';
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

type SortKey = 'serviceTypeName' | 'createdCount' | 'completedCount' | 'completedTotalValue';

const columns: Array<{ key: SortKey; label: string }> = [
  { key: 'serviceTypeName', label: 'Modalidade' },
  { key: 'createdCount', label: 'Pedidos criados' },
  { key: 'completedCount', label: 'Entregas concluídas' },
  { key: 'completedTotalValue', label: 'Valor concluído' },
];

function formatShare(value: number): string {
  return `${value.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
}

function csvNumber(value: number): string {
  return String(value).replace('.', ',');
}

export default function ServiceTypesReportPage() {
  const token = session.getToken();
  const money = useMoney();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [periodError, setPeriodError] = useState<string | null>(null);
  const [appliedPeriod, setAppliedPeriod] = useState<{ from?: string; to?: string }>({});
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('completedTotalValue');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  const reportQuery = useQuery({
    queryKey: ['admin', 'operations-report', 'service-types', appliedPeriod],
    queryFn: () => adminReportsApi.operations(token as string, appliedPeriod),
    enabled: Boolean(token),
  });

  const filteredServiceTypes = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase('pt-BR');
    const serviceTypes = (reportQuery.data?.serviceTypes ?? []).filter((serviceType) =>
      normalizedSearch
        ? serviceType.serviceTypeName.toLocaleLowerCase('pt-BR').includes(normalizedSearch)
        : true,
    );

    return [...serviceTypes].sort((left, right) => {
      const a = left[sortKey];
      const b = right[sortKey];
      const comparison =
        typeof a === 'string' ? a.localeCompare(String(b), 'pt-BR') : Number(a) - Number(b);
      return (
        (sortDirection === 'asc' ? comparison : -comparison) ||
        left.serviceTypeName.localeCompare(right.serviceTypeName, 'pt-BR')
      );
    });
  }, [reportQuery.data?.serviceTypes, search, sortDirection, sortKey]);

  if (!token) {
    return <p className="text-sm text-muted-foreground">Faça login como administrador.</p>;
  }

  function applyPeriod() {
    if (from && to && from > to) {
      setPeriodError('A data inicial não pode ser posterior à data final.');
      return;
    }
    setPeriodError(null);
    setAppliedPeriod({ ...(from && { from }), ...(to && { to }) });
  }

  function clearPeriod() {
    setFrom('');
    setTo('');
    setPeriodError(null);
    setAppliedPeriod({});
  }

  function changeSort(nextKey: SortKey) {
    if (sortKey === nextKey) {
      setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(nextKey);
      setSortDirection(nextKey === 'serviceTypeName' ? 'asc' : 'desc');
    }
  }

  function exportCsv() {
    const report = reportQuery.data;
    if (!report) return;

    const csv = toCsv(
      [
        'Modalidade',
        'Pedidos criados',
        'Participação nos criados',
        'Entregas concluídas',
        'Valor concluído',
        'Participação no valor concluído',
      ],
      filteredServiceTypes.map((serviceType) => [
        serviceType.serviceTypeName,
        serviceType.createdCount,
        csvNumber(
          report.ordersCreated.count
            ? (serviceType.createdCount / report.ordersCreated.count) * 100
            : 0,
        ),
        serviceType.completedCount,
        csvNumber(serviceType.completedTotalValue),
        csvNumber(
          report.deliveriesCompleted.totalValue
            ? (serviceType.completedTotalValue / report.deliveriesCompleted.totalValue) * 100
            : 0,
        ),
      ]),
    );
    downloadCsv('relatorio-modalidades.csv', csv);
  }

  const report = reportQuery.data;

  return (
    <div className="mx-auto w-full max-w-[1480px] space-y-7 pb-12">
      <ReportPageHeader
        icon={Layers3}
        title="Modalidades de serviço"
        description="Compare o volume que entrou e o valor realizado por cada tipo de serviço, com participação relativa e ordenação por indicador."
        action={
          <Button
            type="button"
            variant="outline"
            onClick={exportCsv}
            disabled={filteredServiceTypes.length === 0}
          >
            <Download className="size-4" aria-hidden="true" />
            Baixar CSV
          </Button>
        }
      />

      <ReportFilterCard
        idPrefix="service-types-report"
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
              label="Modalidades com atividade"
              value={report.serviceTypes.length}
              hint="Com pedidos criados ou entregas concluídas no período."
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
              title="Comparativo por modalidade"
              description="Criados usam a data de criação; concluídos e valores usam a data da conclusão. Como são grupos temporais diferentes, não transformamos essas colunas em uma falsa taxa de conclusão."
              action={
                <Input
                  aria-label="Buscar modalidade no relatório"
                  className="w-72 max-w-full"
                  placeholder="Buscar modalidade..."
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              }
            />

            <Card>
              <CardContent className="overflow-x-auto p-0">
                {filteredServiceTypes.length === 0 ? (
                  <p className="p-10 text-center text-sm text-muted-foreground">
                    Nenhuma modalidade corresponde a este recorte.
                  </p>
                ) : (
                  <Table>
                    <TableCaption className="sr-only">
                      Volume e valor concluído por modalidade de serviço
                    </TableCaption>
                    <TableHeader>
                      <TableRow>
                        {columns.map((column) => (
                          <TableHead
                            key={column.key}
                            className={column.key === 'serviceTypeName' ? '' : 'text-right'}
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
                                column.key === 'serviceTypeName' ? '' : 'ml-auto'
                              }`}
                            >
                              {column.label}
                              <ArrowDownUp className="size-3" aria-hidden="true" />
                            </button>
                          </TableHead>
                        ))}
                        <TableHead className="text-right">Participação no valor</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredServiceTypes.map((serviceType) => {
                        const createdShare = report.ordersCreated.count
                          ? (serviceType.createdCount / report.ordersCreated.count) * 100
                          : 0;
                        const valueShare = report.deliveriesCompleted.totalValue
                          ? (serviceType.completedTotalValue /
                              report.deliveriesCompleted.totalValue) *
                            100
                          : 0;

                        return (
                          <TableRow key={serviceType.serviceTypeName}>
                            <TableCell className="font-medium">
                              {serviceType.serviceTypeName}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {serviceType.createdCount}
                              <span className="ml-2 text-xs text-muted-foreground">
                                {formatShare(createdShare)}
                              </span>
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {serviceType.completedCount}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {money(serviceType.completedTotalValue)}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {formatShare(valueShare)}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </section>
        </div>
      )}
    </div>
  );
}
