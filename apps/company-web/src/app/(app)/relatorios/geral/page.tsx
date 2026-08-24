'use client';

import Link from 'next/link';
import { Suspense, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ApiError } from '@motoboycity/api-client';
import { useQuery } from '@tanstack/react-query';
import type { CompanyOperationsReport, DeliveryStatus } from '@motoboycity/types';
import {
  ArrowDownRight,
  ArrowUpRight,
  CircleDollarSign,
  LayoutDashboard,
  ReceiptText,
  Route,
} from 'lucide-react';
import { StatusChip } from '@/components/orders/status-chip';
import { ReportFilterCard } from '@/components/reports/report-filter-card';
import {
  ReportPageHeader,
  ReportPeriodSummary,
  ReportQueryState,
  ReportSectionHeading,
} from '@/components/reports/report-layout';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { companyReportsApi } from '@/lib/api-client';
import { formatarDinheiro, formatarNumero } from '@/lib/dinheiro';
import {
  defaultReportPeriod,
  formatReportDate,
  isReportDate,
  previousComparablePeriod,
} from '@/lib/report-period';
import { session } from '@/lib/session';
import { cn } from '@/lib/utils';

const DAY_IN_MS = 24 * 60 * 60 * 1000;

const STATUS_ORDER: DeliveryStatus[] = [
  'SCHEDULED',
  'AWAITING_DRIVER',
  'ACCEPTED',
  'COLLECTED',
  'DELIVERED',
  'FAILED',
  'AWAITING_PAYMENT',
  'COMPLETED',
  'CANCELLED',
];

const STATUS_BAR: Record<DeliveryStatus, string> = {
  SCHEDULED: 'bg-slate-400',
  AWAITING_DRIVER: 'bg-slate-500',
  ACCEPTED: 'bg-amber-400',
  COLLECTED: 'bg-amber-500',
  DELIVERED: 'bg-orange-500',
  FAILED: 'bg-orange-700',
  AWAITING_PAYMENT: 'bg-blue-600',
  COMPLETED: 'bg-emerald-600',
  CANCELLED: 'bg-red-600',
};

function percent(value: number): string {
  return `${value.toLocaleString('pt-BR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}%`;
}

function periodDays(from: string, to: string): number {
  return Math.floor((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_IN_MS) + 1;
}

function variation(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) / previous) * 1_000) / 10;
}

function queryErrorMessage(error: unknown): string | null {
  if (!error) return null;
  return error instanceof ApiError
    ? error.message
    : 'Não foi possível calcular o relatório. Tente novamente.';
}

function Comparison({ current, previous }: { current: number; previous?: number }) {
  if (previous === undefined) {
    return <span className="text-xs text-muted-foreground">Sem movimento anterior</span>;
  }

  const delta = variation(current, previous);
  if (delta === null) {
    return <span className="text-xs text-muted-foreground">Sem base percentual</span>;
  }

  const increased = delta > 0;
  const unchanged = Math.abs(delta) < 0.1;
  const Icon = increased ? ArrowUpRight : ArrowDownRight;

  if (unchanged) {
    return <span className="text-xs text-muted-foreground">Sem variação</span>;
  }

  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
      <Icon className="size-3.5" aria-hidden="true" />
      {increased ? '+' : ''}
      {percent(delta)} contra o período anterior
    </span>
  );
}

function Metric({
  label,
  value,
  hint,
  current,
  previous,
}: {
  label: string;
  value: string;
  hint: string;
  current: number;
  previous?: number;
}) {
  return (
    <Card className="metric-card min-h-40">
      <CardContent className="flex h-full flex-col gap-3 p-5">
        <div>
          <p className="text-xs font-semibold tracking-[0.035em] text-muted-foreground uppercase">
            {label}
          </p>
          <p className="mt-2 font-heading text-2xl font-bold tracking-[-0.035em] text-portal-deep">
            {value}
          </p>
        </div>
        <p className="text-xs leading-5 text-muted-foreground">{hint}</p>
        <div className="mt-auto">
          <Comparison current={current} previous={previous} />
        </div>
      </CardContent>
    </Card>
  );
}

function StatusDistribution({ summary }: { summary: CompanyOperationsReport }) {
  const total = summary.ordersCreated.count;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Situação atual dos pedidos do recorte</CardTitle>
        <p className="text-sm font-normal text-muted-foreground">
          O status pode ter mudado depois da data de criação. A barra mostra onde esses pedidos
          estão agora.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {STATUS_ORDER.map((status) => {
          const count = summary.ordersCreated.byCurrentStatus[status] ?? 0;
          const share = total > 0 ? (count / total) * 100 : 0;
          return (
            <div key={status} className="grid gap-2 sm:grid-cols-[190px_minmax(0,1fr)_100px] sm:items-center">
              <StatusChip status={status} />
              <div
                className="h-2.5 overflow-hidden rounded-full bg-muted"
                role="progressbar"
                aria-label={`${count} pedido(s), ${percent(share)}`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(share)}
              >
                <div
                  className={cn('h-full rounded-full transition-[width]', STATUS_BAR[status])}
                  style={{ width: `${share}%` }}
                />
              </div>
              <p className="text-right text-sm tabular-nums text-muted-foreground">
                <strong className="text-foreground">{formatarNumero(count)}</strong> · {percent(share)}
              </p>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function DailyEvolution({ summary }: { summary: CompanyOperationsReport }) {
  const maximum = Math.max(
    ...summary.daily.flatMap((item) => [item.createdCount, item.completedCount]),
    1,
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Evolução diária</CardTitle>
        <p className="text-sm font-normal text-muted-foreground">
          Pedidos criados e pedidos concluídos são séries independentes no mesmo recorte.
        </p>
      </CardHeader>
      <CardContent>
        {summary.daily.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            Nenhum pedido foi criado neste período.
          </p>
        ) : (
          <div className="space-y-4 overflow-x-auto pb-2">
            <div className="flex items-center gap-5 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-2">
                <span className="size-2.5 rounded-sm bg-portal" /> Criados
              </span>
              <span className="inline-flex items-center gap-2">
                <span className="size-2.5 rounded-sm bg-emerald-500" /> Concluídos
              </span>
            </div>
            <div className="flex h-64 min-w-max items-end gap-2 px-1 pt-8">
              {summary.daily.map((item) => (
                <div key={item.date} className="flex h-full w-14 flex-col justify-end gap-2">
                  <div className="flex min-h-0 flex-1 items-end gap-1">
                    <div
                      className="relative w-1/2 rounded-t-lg bg-gradient-to-t from-portal to-cyan-400"
                      style={{
                        height: item.createdCount
                          ? `${Math.max((item.createdCount / maximum) * 100, 5)}%`
                          : '0%',
                      }}
                      title={`${formatReportDate(item.date)}: ${formatarNumero(item.createdCount)} criado(s)`}
                    >
                      {item.createdCount > 0 && (
                        <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-[10px] font-semibold tabular-nums text-portal-deep">
                          {formatarNumero(item.createdCount)}
                        </span>
                      )}
                    </div>
                    <div
                      className="relative w-1/2 rounded-t-lg bg-gradient-to-t from-emerald-700 to-emerald-400"
                      style={{
                        height: item.completedCount
                          ? `${Math.max((item.completedCount / maximum) * 100, 5)}%`
                          : '0%',
                      }}
                      title={`${formatReportDate(item.date)}: ${formatarNumero(item.completedCount)} concluído(s), ${formatarDinheiro(item.completedTotalValue)}`}
                    >
                      {item.completedCount > 0 && (
                        <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-[10px] font-semibold tabular-nums text-emerald-800">
                          {formatarNumero(item.completedCount)}
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="text-center text-[10px] whitespace-nowrap text-muted-foreground">
                    {item.date.slice(8, 10)}/{item.date.slice(5, 7)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function GeneralReportView() {
  const token = session.getToken();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const defaultPeriod = useMemo(() => defaultReportPeriod(), []);
  const applied = useMemo(() => {
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    return {
      from: isReportDate(from) ? from : defaultPeriod.from,
      to: isReportDate(to) ? to : defaultPeriod.to,
    };
  }, [defaultPeriod, searchParams]);
  const [from, setFrom] = useState(applied.from);
  const [to, setTo] = useState(applied.to);
  const [filterError, setFilterError] = useState<string | null>(null);

  const summaryQuery = useQuery({
    queryKey: ['company', 'reports', 'general', applied],
    queryFn: () => companyReportsApi.operations(token as string, applied),
    enabled: Boolean(token),
  });

  const comparisonPeriod = useMemo(() => previousComparablePeriod(applied), [applied]);

  if (!token) {
    return <p className="text-sm text-muted-foreground">Faça login para consultar o relatório.</p>;
  }

  function navigate(period: { from: string; to: string }) {
    router.push(`${pathname}?${new URLSearchParams(period).toString()}`, { scroll: false });
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
    if (periodDays(from, to) > 366) {
      setFilterError('Escolha um período de até 366 dias.');
      return;
    }
    setFilterError(null);
    navigate({ from, to });
  }

  function clearFilters() {
    const period = defaultReportPeriod();
    setFrom(period.from);
    setTo(period.to);
    setFilterError(null);
    navigate(period);
  }

  const summary = summaryQuery.data;
  const created = summary?.ordersCreated;
  const completed = summary?.deliveriesCompleted;
  const previous = summary?.comparison;
  const cancelledCreated = created?.byCurrentStatus.CANCELLED ?? 0;
  const cancellationRate = created?.count ? (cancelledCreated / created.count) * 100 : 0;
  const returnRate = created?.count ? ((summary?.returns.createdCount ?? 0) / created.count) * 100 : 0;
  const unpricedRate = created?.count ? ((created.unpricedCount ?? 0) / created.count) * 100 : 0;

  return (
    <div className="mx-auto w-full max-w-[1480px] space-y-7 pb-12">
      <ReportPageHeader
        icon={LayoutDashboard}
        title="Analítico geral"
        description="Compare demanda criada e entregas concluídas, acompanhe custos conhecidos e encontre acúmulos operacionais, sempre limitado à sua empresa."
        action={
          <Link href="/financeiro" className={buttonVariants({ variant: 'outline' })}>
            <ReceiptText className="size-4" aria-hidden="true" />
            Abrir financeiro
          </Link>
        }
      />

      <ReportFilterCard
        idPrefix="company-general-report"
        from={from}
        to={to}
        onFromChange={setFrom}
        onToChange={setTo}
        onApply={applyFilters}
        onClear={clearFilters}
        isFetching={summaryQuery.isFetching}
        error={filterError}
        description="O período padrão cobre os últimos 30 dias e a consulta aceita no máximo 366 dias."
      />

      <ReportPeriodSummary
        period={applied}
        comparisonPeriod={comparisonPeriod}
        live={summary?.live ?? applied.to === defaultPeriod.to}
      />

      <ReportQueryState
        loading={summaryQuery.isLoading}
        errorMessage={queryErrorMessage(summaryQuery.error)}
        onRetry={() => {
          void summaryQuery.refetch();
        }}
      />

      {summary && created && completed && !summaryQuery.isError && (
        <div className="space-y-7" aria-busy={summaryQuery.isFetching}>
          {summaryQuery.isFetching && (
            <p className="rounded-xl border border-portal/15 bg-portal-soft/40 px-4 py-3 text-sm text-muted-foreground" role="status">
              Atualizando os indicadores deste recorte...
            </p>
          )}

          <section className="space-y-4">
            <ReportSectionHeading
              title="Resumo do período"
              description="A comparação usa uma janela imediatamente anterior com a mesma quantidade de dias. A variação indica movimento, sem classificar aumento de custo como bom ou ruim."
            />
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <Metric
                label="Pedidos criados"
                value={formatarNumero(created.count)}
                hint={`${formatarNumero(created.unpricedCount)} ainda sem valor definido`}
                current={created.count}
                previous={previous?.ordersCreatedCount}
              />
              <Metric
                label="Entregas concluídas"
                value={formatarNumero(completed.count)}
                hint="Conclusões ocorridas dentro do período"
                current={completed.count}
                previous={previous?.deliveriesCompletedCount}
              />
              <Metric
                label="Valor concluído"
                value={formatarDinheiro(completed.totalValue)}
                hint={`${formatarNumero(completed.pricedCount)} entrega(s) com valor conhecido`}
                current={completed.totalValue}
                previous={previous?.completedTotalValue}
              />
              <Metric
                label="Ticket médio concluído"
                value={formatarDinheiro(completed.averageTicket)}
                hint="Valor concluído dividido apenas pelas entregas com preço"
                current={completed.averageTicket}
                previous={previous?.averageTicket}
              />
            </div>
          </section>

          <section className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-base">Leitura rápida da operação</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-5 sm:grid-cols-3">
                <div className="rounded-xl border border-border/70 bg-muted/25 p-4">
                  <Route className="size-5 text-portal" aria-hidden="true" />
                  <p className="mt-3 text-xs font-semibold text-muted-foreground uppercase">Sem preço ao criar</p>
                  <p className="mt-1 font-heading text-2xl font-bold text-portal-deep">{percent(unpricedRate)}</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">{formatarNumero(created.unpricedCount)} pedido(s) aguardando cálculo.</p>
                </div>
                <div className="rounded-xl border border-border/70 bg-muted/25 p-4">
                  <CircleDollarSign className="size-5 text-portal" aria-hidden="true" />
                  <p className="mt-3 text-xs font-semibold text-muted-foreground uppercase">Concluídas sem preço</p>
                  <p className="mt-1 font-heading text-2xl font-bold text-portal-deep">{formatarNumero(completed.unpricedCount)}</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">Não entram no total nem no ticket médio.</p>
                </div>
                <div className="rounded-xl border border-border/70 bg-muted/25 p-4">
                  <ReceiptText className="size-5 text-portal" aria-hidden="true" />
                  <p className="mt-3 text-xs font-semibold text-muted-foreground uppercase">Cancelamento</p>
                  <p className="mt-1 font-heading text-2xl font-bold text-portal-deep">{percent(cancellationRate)}</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">{formatarNumero(cancelledCreated)} pedido(s) criado(s) no recorte.</p>
                </div>
              </CardContent>
            </Card>

            <Card className="border-portal/15 bg-portal-soft/30">
              <CardHeader>
                <CardTitle className="text-base">Perfil do recorte</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Modalidade mais usada</p>
                  <p className="mt-1 font-semibold text-portal-deep">{summary.serviceTypes[0]?.serviceTypeName ?? 'Sem conclusões'}</p>
                  {summary.serviceTypes[0] && <p className="text-xs text-muted-foreground">{formatarDinheiro(summary.serviceTypes[0].completedTotalValue)} concluído</p>}
                </div>
                <div className="border-t border-portal/10 pt-4">
                  <p className="text-muted-foreground">Pedidos com retorno</p>
                  <p className="mt-1 font-semibold text-portal-deep">{formatarNumero(summary.returns.createdCount)} · {percent(returnRate)}</p>
                </div>
                <div className="border-t border-portal/10 pt-4">
                  <p className="text-muted-foreground">Pedidos em lote</p>
                  <p className="mt-1 font-semibold text-portal-deep">{formatarNumero(summary.batches.deliveryCount)} em {formatarNumero(summary.batches.batchCount)} lote(s)</p>
                </div>
                <div className="border-t border-portal/10 pt-4">
                  <p className="text-xs leading-5 text-muted-foreground">
                    Cobranças, vencimentos, faturas e o próximo fechamento ficam no Financeiro para não misturar operação com contas a pagar.
                  </p>
                </div>
              </CardContent>
            </Card>
          </section>

          <section className="space-y-4">
            <ReportSectionHeading
              title="Distribuição operacional"
              description="Use a situação atual para enxergar acúmulos e a evolução diária para identificar dias de maior demanda."
            />
            <div className="grid gap-4 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
              <StatusDistribution summary={summary} />
              <DailyEvolution summary={summary} />
            </div>
          </section>

          <p className="rounded-xl border border-border/70 bg-card px-4 py-3 text-xs leading-5 text-muted-foreground">
            Critério do relatório: “Pedidos criados” usa a data de criação; “Entregas concluídas” e seus valores usam a data de conclusão. As coortes são independentes, portanto não são divididas entre si para fabricar uma taxa de conclusão.
          </p>
        </div>
      )}
    </div>
  );
}

function GeneralReportContent() {
  const searchParams = useSearchParams();
  return <GeneralReportView key={searchParams.toString()} />;
}

export default function GeneralReportPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground" role="status">Preparando relatório...</p>}>
      <GeneralReportContent />
    </Suspense>
  );
}
