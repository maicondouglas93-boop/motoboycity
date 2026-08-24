'use client';

import Link from 'next/link';
import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import type { CompanyOperationsReportServiceTypeItem } from '@motoboycity/types';
import {
  Bike,
  LayoutDashboard,
  Layers3,
  Search,
} from 'lucide-react';
import { ReportFilterCard } from '@/components/reports/report-filter-card';
import {
  ReportComparison,
  ReportPageHeader,
  ReportPeriodSummary,
  ReportQueryState,
  ReportSectionHeading,
} from '@/components/reports/report-layout';
import { useCompanyOperationsReport } from '@/components/reports/use-company-operations-report';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
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
import { formatarDinheiro, formatarNumero } from '@/lib/dinheiro';

const SORT_OPTIONS = [
  { value: 'cost-desc', label: 'Maior custo concluído' },
  { value: 'created-desc', label: 'Mais pedidos criados' },
  { value: 'completed-desc', label: 'Mais entregas concluídas' },
  { value: 'ticket-desc', label: 'Maior ticket médio' },
  { value: 'return-desc', label: 'Maior custo de retorno' },
  { value: 'name-asc', label: 'Nome de A a Z' },
] as const;

type SortValue = (typeof SORT_OPTIONS)[number]['value'];
const validSorts = new Set<SortValue>(SORT_OPTIONS.map((option) => option.value));

function percent(value: number): string {
  return `${value.toLocaleString('pt-BR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}%`;
}

function share(value: number, total: number): number {
  return total > 0 ? (value / total) * 100 : 0;
}

function sortItems(
  items: CompanyOperationsReportServiceTypeItem[],
  sort: SortValue,
): CompanyOperationsReportServiceTypeItem[] {
  return [...items].sort((left, right) => {
    switch (sort) {
      case 'created-desc':
        return right.createdCount - left.createdCount || left.serviceTypeName.localeCompare(right.serviceTypeName);
      case 'completed-desc':
        return right.completedCount - left.completedCount || left.serviceTypeName.localeCompare(right.serviceTypeName);
      case 'ticket-desc':
        return right.averageTicket - left.averageTicket || left.serviceTypeName.localeCompare(right.serviceTypeName);
      case 'return-desc':
        return right.completedReturnValue - left.completedReturnValue || left.serviceTypeName.localeCompare(right.serviceTypeName);
      case 'name-asc':
        return left.serviceTypeName.localeCompare(right.serviceTypeName);
      case 'cost-desc':
      default:
        return right.completedTotalValue - left.completedTotalValue || left.serviceTypeName.localeCompare(right.serviceTypeName);
    }
  });
}

function ModalityMetric({
  label,
  value,
  description,
  comparison,
}: {
  label: string;
  value: string;
  description: string;
  comparison?: number | null;
}) {
  return (
    <Card className="metric-card min-h-36">
      <CardContent className="flex h-full flex-col gap-2 p-5">
        <p className="text-xs font-semibold tracking-[0.035em] text-muted-foreground uppercase">
          {label}
        </p>
        <p className="font-heading text-2xl font-bold tracking-[-0.035em] text-portal-deep">
          {value}
        </p>
        <p className="text-xs leading-5 text-muted-foreground">{description}</p>
        {comparison !== undefined && (
          <div className="mt-auto pt-1">
            <ReportComparison value={comparison} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ModalitiesReportView() {
  const searchParams = useSearchParams();
  const report = useCompanyOperationsReport('service-types');
  const appliedQuery = searchParams.get('q')?.trim().slice(0, 80) ?? '';
  const sortParam = searchParams.get('sort') as SortValue | null;
  const appliedSort = sortParam && validSorts.has(sortParam) ? sortParam : 'cost-desc';
  const [query, setQuery] = useState(appliedQuery);
  const [sort, setSort] = useState<SortValue>(appliedSort);
  const data = report.query.data;

  if (!report.token) {
    return <p className="text-sm text-muted-foreground">Faça login para consultar o relatório.</p>;
  }

  const serviceTypes = data?.serviceTypes ?? [];
  const visibleItems = sortItems(
    serviceTypes.filter((item) =>
      item.serviceTypeName.toLocaleLowerCase('pt-BR').includes(appliedQuery.toLocaleLowerCase('pt-BR')),
    ),
    appliedSort,
  );
  const topCreated = sortItems(serviceTypes, 'created-desc')[0];
  const totalCreated = serviceTypes.reduce((sum, item) => sum + item.createdCount, 0);
  const totalCompleted = serviceTypes.reduce((sum, item) => sum + item.completedCount, 0);
  const totalUnpriced = serviceTypes.reduce((sum, item) => sum + item.unpricedCompletedCount, 0);
  const totalCompletedValue = serviceTypes.reduce(
    (sum, item) => sum + Math.round(item.completedTotalValue * 100),
    0,
  ) / 100;
  const totalReturnValue = serviceTypes.reduce(
    (sum, item) => sum + Math.round(item.completedReturnValue * 100),
    0,
  ) / 100;
  const reconciliationCents =
    Math.round(totalCompletedValue * 100) -
    Math.round((data?.deliveriesCompleted.totalValue ?? 0) * 100);

  function applyFilters() {
    const extras = new URLSearchParams();
    if (query.trim()) extras.set('q', query.trim().slice(0, 80));
    extras.set('sort', sort);
    report.applyFilters(extras);
  }

  function clearFilters() {
    setQuery('');
    setSort('cost-desc');
    report.clearFilters();
  }

  return (
    <div className="mx-auto w-full max-w-[1480px] space-y-7 pb-12">
      <ReportPageHeader
        icon={Bike}
        title="Modalidades e custos"
        description="Compare uso, conclusões, custo conhecido, ticket e retorno de cada modalidade disponível para sua empresa."
        action={
          <Link href="/relatorios/geral" className={buttonVariants({ variant: 'outline' })}>
            <LayoutDashboard className="size-4" aria-hidden="true" />
            Ver analítico geral
          </Link>
        }
      />

      <ReportFilterCard
        idPrefix="company-modalities-report"
        from={report.from}
        to={report.to}
        onFromChange={report.setFrom}
        onToChange={report.setTo}
        onApply={applyFilters}
        onClear={clearFilters}
        isFetching={report.query.isFetching}
        error={report.filterError}
        description="Busca e ordenação ficam na URL. Criados e concluídos são coortes independentes."
      >
        <div className="min-w-52 flex-[1.2] space-y-1.5 sm:max-w-64">
          <Label htmlFor="company-modalities-report-query">Modalidade</Label>
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              id="company-modalities-report-query"
              className="pl-9"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar pelo nome"
              maxLength={80}
            />
          </div>
        </div>
        <div className="min-w-56 flex-1 space-y-1.5 sm:max-w-64">
          <Label htmlFor="company-modalities-report-sort">Ordenar por</Label>
          <select
            id="company-modalities-report-sort"
            className="h-9 w-full rounded-md border bg-background px-3 text-sm"
            value={sort}
            onChange={(event) => setSort(event.target.value as SortValue)}
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </ReportFilterCard>

      <ReportPeriodSummary
        period={report.applied}
        comparisonPeriod={report.comparisonPeriod}
        live={data?.live}
      />

      <ReportQueryState
        loading={report.query.isLoading}
        errorMessage={report.errorMessage}
        onRetry={() => void report.query.refetch()}
      />

      {data && !report.query.isError && (
        <div className="space-y-7" aria-busy={report.query.isFetching}>
          {report.query.isFetching && (
            <p
              role="status"
              className="rounded-xl border border-portal/15 bg-portal-soft/40 px-4 py-3 text-sm text-muted-foreground"
            >
              Atualizando modalidades e custos...
            </p>
          )}

          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <ModalityMetric
              label="Modalidades no recorte"
              value={formatarNumero(serviceTypes.length)}
              description={`${formatarNumero(totalCreated)} pedido(s) criado(s)`}
            />
            <ModalityMetric
              label="Entregas concluídas"
              value={formatarNumero(totalCompleted)}
              description={`${formatarNumero(totalUnpriced)} sem preço conhecido`}
              comparison={data.comparison.changePercent.deliveriesCompleted}
            />
            <ModalityMetric
              label="Custo concluído"
              value={formatarDinheiro(totalCompletedValue)}
              description={`${formatarDinheiro(totalReturnValue)} em retorno concluído`}
              comparison={data.comparison.changePercent.completedTotalValue}
            />
            <ModalityMetric
              label="Maior volume criado"
              value={topCreated?.serviceTypeName ?? 'Sem movimento'}
              description={
                topCreated
                  ? `${formatarNumero(topCreated.createdCount)} pedido(s) criado(s)`
                  : 'Nenhuma modalidade usada no período'
              }
            />
          </section>

          <section className="space-y-4">
            <ReportSectionHeading
              title="Participação por modalidade"
              description="Volume usa pedidos criados; custo e ticket usam apenas entregas concluídas com valor conhecido."
              action={
                <Badge variant={reconciliationCents === 0 ? 'default' : 'destructive'}>
                  {reconciliationCents === 0
                    ? 'Totais conciliados'
                    : `Diferença de ${formatarDinheiro(reconciliationCents / 100)}`}
                </Badge>
              }
            />

            {serviceTypes.length === 0 ? (
              <Card>
                <CardContent className="py-16 text-center">
                  <Layers3 className="mx-auto size-8 text-muted-foreground/60" aria-hidden="true" />
                  <p className="mt-3 font-medium text-portal-deep">Nenhuma modalidade no período</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Amplie o intervalo para comparar uso e custos.
                  </p>
                </CardContent>
              </Card>
            ) : visibleItems.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center text-sm text-muted-foreground">
                  Nenhuma modalidade corresponde à busca “{appliedQuery}”.
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
                {visibleItems.map((item) => {
                  const createdShare = share(item.createdCount, data.ordersCreated.count);
                  const costShare = share(item.completedTotalValue, data.deliveriesCompleted.totalValue);
                  return (
                    <Card key={item.serviceTypeName} className="overflow-hidden">
                      <CardContent className="p-5">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <h3 className="font-heading text-base font-semibold text-portal-deep">
                              {item.serviceTypeName}
                            </h3>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {formatarNumero(item.completedCount)} conclusão(ões)
                            </p>
                          </div>
                          <span className="grid size-10 place-items-center rounded-xl bg-portal-soft text-portal">
                            <Bike className="size-5" aria-hidden="true" />
                          </span>
                        </div>

                        <div className="mt-5 grid grid-cols-2 gap-3">
                          <div className="rounded-xl bg-muted/35 p-3">
                            <p className="text-[11px] text-muted-foreground uppercase">Criados</p>
                            <p className="mt-1 font-semibold tabular-nums text-portal-deep">
                              {formatarNumero(item.createdCount)}
                            </p>
                          </div>
                          <div className="rounded-xl bg-muted/35 p-3">
                            <p className="text-[11px] text-muted-foreground uppercase">Custo</p>
                            <p className="mt-1 font-semibold tabular-nums text-portal-deep">
                              {formatarDinheiro(item.completedTotalValue)}
                            </p>
                          </div>
                        </div>

                        <div className="mt-4 space-y-3 text-xs">
                          <div>
                            <div className="flex justify-between gap-3 text-muted-foreground">
                              <span>Participação no volume criado</span>
                              <strong className="text-foreground">{percent(createdShare)}</strong>
                            </div>
                            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
                              <div className="h-full rounded-full bg-portal" style={{ width: `${createdShare}%` }} />
                            </div>
                          </div>
                          <div>
                            <div className="flex justify-between gap-3 text-muted-foreground">
                              <span>Participação no custo concluído</span>
                              <strong className="text-foreground">{percent(costShare)}</strong>
                            </div>
                            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
                              <div className="h-full rounded-full bg-emerald-600" style={{ width: `${costShare}%` }} />
                            </div>
                          </div>
                        </div>

                        <div className="mt-4 border-t pt-4 text-xs text-muted-foreground">
                          Ticket médio: <strong className="text-foreground">{formatarDinheiro(item.averageTicket)}</strong>
                          {' · '}Retorno: <strong className="text-foreground">{formatarDinheiro(item.completedReturnValue)}</strong>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </section>

          {visibleItems.length > 0 && (
            <section className="space-y-4">
              <ReportSectionHeading
                title="Detalhamento e conferência"
                description="A tabela expõe os denominadores do ticket e separa preço ausente de valor zero."
              />
              <Card>
                <CardContent className="overflow-x-auto p-0">
                  <Table>
                    <TableCaption className="sr-only">
                      Modalidades utilizadas pela empresa no período
                    </TableCaption>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Modalidade</TableHead>
                        <TableHead className="text-right">Criados</TableHead>
                        <TableHead className="text-right">Concluídos</TableHead>
                        <TableHead className="text-right">Com preço</TableHead>
                        <TableHead className="text-right">Sem preço</TableHead>
                        <TableHead className="text-right">Ticket médio</TableHead>
                        <TableHead className="text-right">Custo concluído</TableHead>
                        <TableHead className="text-right">Criados c/ retorno</TableHead>
                        <TableHead className="text-right">Valor de retorno</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {visibleItems.map((item) => (
                        <TableRow key={item.serviceTypeName}>
                          <TableCell className="font-medium text-portal-deep">
                            {item.serviceTypeName}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{formatarNumero(item.createdCount)}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatarNumero(item.completedCount)}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatarNumero(item.pricedCompletedCount)}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatarNumero(item.unpricedCompletedCount)}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatarDinheiro(item.averageTicket)}</TableCell>
                          <TableCell className="text-right font-medium tabular-nums">{formatarDinheiro(item.completedTotalValue)}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatarNumero(item.createdWithReturnCount)}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatarDinheiro(item.completedReturnValue)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </section>
          )}

          <p className="rounded-xl border border-border/70 bg-card px-4 py-3 text-xs leading-5 text-muted-foreground">
            “Criados” usa a data de criação. “Concluídos”, custo, ticket e retorno usam a data de conclusão. O relatório mostra somente o custo da sua empresa; repasse do entregador e margem da plataforma não fazem parte deste contrato.
          </p>
        </div>
      )}
    </div>
  );
}

function ModalitiesReportContent() {
  const searchParams = useSearchParams();
  return <ModalitiesReportView key={searchParams.toString()} />;
}

export default function ModalitiesReportPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Preparando relatório...</p>}>
      <ModalitiesReportContent />
    </Suspense>
  );
}
