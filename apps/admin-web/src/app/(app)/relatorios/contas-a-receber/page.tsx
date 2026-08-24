'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ReceivablesAgingBucketKey, ReceivablesCompanyItem } from '@motoboycity/types';
import { ArrowDownUp, ArrowRight, Clock3, Download, HandCoins } from 'lucide-react';
import {
  ReportPageHeader,
  ReportQueryState,
  ReportSectionHeading,
} from '@/components/reports/report-layout';
import { ReportPagination } from '@/components/reports/report-pagination';
import { StatCard } from '@/components/stat-card';
import { Badge } from '@/components/ui/badge';
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
import { adminFinancialApi } from '@/lib/api-client';
import { downloadCsv, toCsv } from '@/lib/csv';
import { useMoney } from '@/lib/money';
import { session } from '@/lib/session';

type ExposureFilter = 'ALL' | 'OVERDUE' | 'UNBILLED' | 'NOT_DUE';
type SortKey =
  | 'companyName'
  | 'unbilledValue'
  | 'notDueInvoiceValue'
  | 'overdueInvoiceValue'
  | 'totalReceivable'
  | 'maxOverdueDays';

const BUCKET_META: Record<
  ReceivablesAgingBucketKey,
  { label: string; description: string; tone: string }
> = {
  UNBILLED: {
    label: 'Concluído sem fatura',
    description: 'Trabalho realizado que ainda não entrou em uma fatura.',
    tone: 'border-amber-300/50 bg-amber-500/5',
  },
  NOT_DUE: {
    label: 'A vencer',
    description: 'Faturas abertas dentro do prazo ou com vencimento hoje.',
    tone: 'border-orange-300/50 bg-orange-500/5',
  },
  OVERDUE_1_7: {
    label: 'Vencido há 1–7 dias',
    description: 'Primeira faixa de atraso para cobrança imediata.',
    tone: 'border-red-200 bg-red-500/5',
  },
  OVERDUE_8_15: {
    label: 'Vencido há 8–15 dias',
    description: 'Atraso que já exige acompanhamento ativo.',
    tone: 'border-red-300/70 bg-red-500/7',
  },
  OVERDUE_16_30: {
    label: 'Vencido há 16–30 dias',
    description: 'Exposição prolongada e com maior risco de cobrança.',
    tone: 'border-red-400/60 bg-red-500/9',
  },
  OVERDUE_31_PLUS: {
    label: 'Vencido há mais de 30 dias',
    description: 'Dívida mais antiga e prioritária deste relatório.',
    tone: 'border-destructive/50 bg-destructive/10',
  },
};

const SORT_COLUMNS: Array<{ key: SortKey; label: string }> = [
  { key: 'companyName', label: 'Cliente' },
  { key: 'unbilledValue', label: 'Sem fatura' },
  { key: 'notDueInvoiceValue', label: 'A vencer' },
  { key: 'overdueInvoiceValue', label: 'Vencido' },
  { key: 'totalReceivable', label: 'Total a receber' },
  { key: 'maxOverdueDays', label: 'Maior atraso' },
];

function formatCivilDate(date: string): string {
  return new Intl.DateTimeFormat('pt-BR').format(new Date(`${date}T12:00:00Z`));
}

function csvNumber(value: number): string {
  return String(value).replace('.', ',');
}

function countLabel(count: number, singular: string, plural: string): string {
  return `${count.toLocaleString('pt-BR')} ${count === 1 ? singular : plural}`;
}

function matchesExposure(company: ReceivablesCompanyItem, filter: ExposureFilter): boolean {
  if (filter === 'OVERDUE') return company.overdueInvoiceCount > 0;
  if (filter === 'UNBILLED') return company.unbilledCount > 0;
  if (filter === 'NOT_DUE') return company.notDueInvoiceCount > 0;
  return true;
}

export default function ReceivablesReportPage() {
  const token = session.getToken();
  const money = useMoney();
  const [search, setSearch] = useState('');
  const [exposureFilter, setExposureFilter] = useState<ExposureFilter>('ALL');
  const [sortKey, setSortKey] = useState<SortKey>('totalReceivable');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const reportQuery = useQuery({
    queryKey: ['admin', 'financial', 'receivables-aging'],
    queryFn: () => adminFinancialApi.receivablesAging(token as string),
    enabled: Boolean(token),
  });

  const filteredCompanies = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase('pt-BR');
    const companies = (reportQuery.data?.companies ?? []).filter(
      (company) =>
        matchesExposure(company, exposureFilter) &&
        (normalizedSearch
          ? company.companyName.toLocaleLowerCase('pt-BR').includes(normalizedSearch)
          : true),
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
  }, [exposureFilter, reportQuery.data?.companies, search, sortDirection, sortKey]);

  const totalPages = Math.max(1, Math.ceil(filteredCompanies.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const visibleCompanies = useMemo(
    () => filteredCompanies.slice((safePage - 1) * pageSize, safePage * pageSize),
    [filteredCompanies, pageSize, safePage],
  );

  if (!token) {
    return <p className="text-sm text-muted-foreground">Faça login como administrador.</p>;
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
    const report = reportQuery.data;
    if (!report) return;

    const csv = toCsv(
      [
        'Cliente',
        'Pedidos concluídos sem fatura',
        'Valor sem fatura',
        'Data do mais antigo sem fatura',
        'Dias do mais antigo sem fatura',
        'Faturas a vencer',
        'Valor a vencer',
        'Faturas vencidas',
        'Valor vencido',
        'Vencimento mais antigo',
        'Maior atraso em dias',
        'Total a receber',
        'Posição em',
      ],
      filteredCompanies.map((company) => [
        company.companyName,
        company.unbilledCount,
        csvNumber(company.unbilledValue),
        company.oldestUnbilledDate ?? '',
        company.maxUnbilledDays,
        company.notDueInvoiceCount,
        csvNumber(company.notDueInvoiceValue),
        company.overdueInvoiceCount,
        csvNumber(company.overdueInvoiceValue),
        company.oldestOverdueDate ?? '',
        company.maxOverdueDays,
        csvNumber(company.totalReceivable),
        report.asOf,
      ]),
    );
    downloadCsv('relatorio-contas-a-receber.csv', csv);
  }

  const report = reportQuery.data;

  return (
    <div className="mx-auto w-full max-w-[1480px] space-y-7 pb-12">
      <ReportPageHeader
        icon={HandCoins}
        title="Contas a receber"
        description="Acompanhe o que ainda não foi faturado, o que está dentro do prazo e a idade das faturas vencidas, com consolidação por cliente."
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

      <ReportQueryState
        loading={reportQuery.isLoading}
        error={reportQuery.isError}
        loadingLabel="Calculando contas a receber..."
        onRetry={() => {
          void reportQuery.refetch();
        }}
      />

      {report && (
        <div className="space-y-9">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/10 bg-admin-soft/35 px-4 py-3 text-sm text-muted-foreground">
            <p>
              Posição financeira em{' '}
              <strong className="text-admin-deep">{formatCivilDate(report.asOf)}</strong>. Este
              relatório não usa período: uma dívida antiga continua existindo hoje.
            </p>
            <Badge variant="outline" className="gap-1.5">
              <Clock3 className="size-3" aria-hidden="true" />
              Fotografia atual
            </Badge>
          </div>

          <section className="space-y-4">
            <ReportSectionHeading
              title="Exposição atual"
              description="O total soma exclusivamente pedidos concluídos ainda sem fatura e faturas abertas. Pagamentos confirmados e pedidos pagos online não entram como dívida."
            />
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard
                label="Total a receber"
                value={money(report.totalReceivable)}
                hint={countLabel(report.totalCompanies, 'cliente exposto', 'clientes expostos')}
              />
              <StatCard
                label="Concluído sem fatura"
                value={money(report.unbilled.value)}
                hint={countLabel(report.unbilled.count, 'pedido', 'pedidos')}
              />
              <StatCard
                label="Faturas a vencer"
                value={money(report.invoices.notDueValue)}
                hint={countLabel(report.invoices.notDueCount, 'fatura', 'faturas')}
              />
              <StatCard
                label="Faturas vencidas"
                value={money(report.invoices.overdueValue)}
                hint={countLabel(report.invoices.overdueCount, 'fatura', 'faturas')}
              />
            </div>
          </section>

          <section className="space-y-4">
            <ReportSectionHeading
              title="Aging da dívida"
              description="Cada valor aparece em uma única faixa. O vencimento de hoje permanece em “A vencer”; o atraso começa no dia seguinte."
              action={
                <Link
                  href="/financeiro?aba=faturas"
                  className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
                >
                  Abrir faturas
                  <ArrowRight className="size-4" aria-hidden="true" />
                </Link>
              }
            />
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {report.buckets.map((bucket) => {
                const meta = BUCKET_META[bucket.key];
                return (
                  <Card key={bucket.key} className={meta.tone}>
                    <CardContent className="p-5">
                      <p className="text-sm font-medium text-admin-deep">{meta.label}</p>
                      <p className="mt-2 font-mono text-2xl font-semibold tracking-tight tabular-nums">
                        {money(bucket.value)}
                      </p>
                      <p className="mt-1 text-xs font-medium text-muted-foreground">
                        {countLabel(
                          bucket.count,
                          bucket.key === 'UNBILLED' ? 'pedido' : 'fatura',
                          bucket.key === 'UNBILLED' ? 'pedidos' : 'faturas',
                        )}
                      </p>
                      <p className="mt-3 text-xs leading-5 text-muted-foreground">
                        {meta.description}
                      </p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </section>

          <section className="space-y-4">
            <ReportSectionHeading
              title="Exposição por cliente"
              description="Busque, filtre e ordene para priorizar cobrança ou faturamento. O CSV respeita os filtros, mas exporta todas as linhas encontradas."
            />

            <Card>
              <CardContent className="flex flex-wrap items-end gap-3 p-4">
                <div className="min-w-64 flex-1 space-y-1.5">
                  <label htmlFor="receivables-search" className="text-sm font-medium">
                    Cliente
                  </label>
                  <Input
                    id="receivables-search"
                    placeholder="Buscar cliente..."
                    value={search}
                    onChange={(event) => {
                      setSearch(event.target.value);
                      setPage(1);
                    }}
                  />
                </div>
                <div className="min-w-56 space-y-1.5">
                  <label htmlFor="receivables-filter" className="text-sm font-medium">
                    Tipo de exposição
                  </label>
                  <select
                    id="receivables-filter"
                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-admin-deep"
                    value={exposureFilter}
                    onChange={(event) => {
                      setExposureFilter(event.target.value as ExposureFilter);
                      setPage(1);
                    }}
                  >
                    <option value="ALL">Todas</option>
                    <option value="OVERDUE">Com fatura vencida</option>
                    <option value="UNBILLED">Com pedido sem fatura</option>
                    <option value="NOT_DUE">Com fatura a vencer</option>
                  </select>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="overflow-x-auto p-0">
                {visibleCompanies.length === 0 ? (
                  <p className="p-10 text-center text-sm text-muted-foreground">
                    Nenhum cliente corresponde aos filtros selecionados.
                  </p>
                ) : (
                  <Table>
                    <TableCaption className="sr-only">
                      Contas a receber consolidadas por cliente
                    </TableCaption>
                    <TableHeader>
                      <TableRow>
                        {SORT_COLUMNS.map((column) => (
                          <TableHead
                            key={column.key}
                            className={column.key === 'companyName' ? 'min-w-52' : 'text-right'}
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
                      {visibleCompanies.map((company) => (
                        <TableRow
                          key={company.companyId}
                          className={
                            company.overdueInvoiceCount > 0 ? 'bg-destructive/[0.025]' : ''
                          }
                        >
                          <TableCell>
                            <Link
                              href={`/clientes/${company.companyId}`}
                              className="font-medium text-primary underline-offset-4 hover:underline"
                            >
                              {company.companyName}
                            </Link>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            <p className="font-medium">{money(company.unbilledValue)}</p>
                            <p className="text-xs text-muted-foreground">
                              {countLabel(company.unbilledCount, 'pedido', 'pedidos')}
                              {company.maxUnbilledDays > 0 &&
                                ` · mais antigo: ${company.maxUnbilledDays}d`}
                            </p>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            <p className="font-medium">{money(company.notDueInvoiceValue)}</p>
                            <p className="text-xs text-muted-foreground">
                              {countLabel(company.notDueInvoiceCount, 'fatura', 'faturas')}
                            </p>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            <p
                              className={
                                company.overdueInvoiceValue > 0
                                  ? 'font-semibold text-destructive'
                                  : 'font-medium'
                              }
                            >
                              {money(company.overdueInvoiceValue)}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {countLabel(company.overdueInvoiceCount, 'fatura', 'faturas')}
                            </p>
                          </TableCell>
                          <TableCell className="text-right font-semibold tabular-nums">
                            {money(company.totalReceivable)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {company.maxOverdueDays > 0 ? (
                              <>
                                <p className="font-semibold text-destructive">
                                  {company.maxOverdueDays} dias
                                </p>
                                {company.oldestOverdueDate && (
                                  <p className="text-xs text-muted-foreground">
                                    desde {formatCivilDate(company.oldestOverdueDate)}
                                  </p>
                                )}
                              </>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            <ReportPagination
              page={safePage}
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
