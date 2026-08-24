'use client';

import Link from 'next/link';
import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { CalendarDays, Clock3, LayoutDashboard, SunMoon } from 'lucide-react';
import { ReportFilterCard } from '@/components/reports/report-filter-card';
import {
  ReportComparison,
  ReportPageHeader,
  ReportPeriodSummary,
  ReportQueryState,
  ReportSectionHeading,
} from '@/components/reports/report-layout';
import { useCompanyOperationsReport } from '@/components/reports/use-company-operations-report';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const WEEKDAYS = [
  'Domingo',
  'Segunda-feira',
  'Terça-feira',
  'Quarta-feira',
  'Quinta-feira',
  'Sexta-feira',
  'Sábado',
] as const;

const TIME_BANDS = [
  { label: 'Madrugada', description: '00h às 05h', from: 0, to: 5, tone: 'bg-indigo-500' },
  { label: 'Manhã', description: '06h às 11h', from: 6, to: 11, tone: 'bg-cyan-500' },
  { label: 'Tarde', description: '12h às 17h', from: 12, to: 17, tone: 'bg-amber-500' },
  { label: 'Noite', description: '18h às 23h', from: 18, to: 23, tone: 'bg-violet-600' },
] as const;

const number = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });

function hourLabel(hour: number | null): string {
  return hour === null ? 'Sem movimento' : `${String(hour).padStart(2, '0')}h`;
}

function share(count: number, total: number): number {
  return total > 0 ? (count / total) * 100 : 0;
}

function percent(value: number): string {
  return `${number.format(value)}%`;
}

function DemandMetric({
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

function HoursReportView() {
  const report = useCompanyOperationsReport('hours');
  const data = report.query.data;

  if (!report.token) {
    return <p className="text-sm text-muted-foreground">Faça login para consultar o relatório.</p>;
  }

  const peak = data?.peakHours;
  const total = peak?.totalConsidered ?? 0;
  const maxHourCount = Math.max(...(peak?.byHour.map((bucket) => bucket.count) ?? [0]), 1);
  const maxWeekdayAverage = Math.max(
    ...(peak?.byWeekday.map((bucket) => bucket.averagePerOccurrence) ?? [0]),
    1,
  );
  const averagePerDay = peak?.daysInPeriod ? total / peak.daysInPeriod : 0;
  const busiestHours = [...(peak?.byHour ?? [])]
    .filter((bucket) => bucket.count > 0)
    .sort((left, right) => right.count - left.count || left.hour - right.hour)
    .slice(0, 3);

  return (
    <div className="mx-auto w-full max-w-[1480px] space-y-7 pb-12">
      <ReportPageHeader
        icon={Clock3}
        title="Horários e demanda"
        description="Descubra quando sua empresa mais cria pedidos, com horas e dias normalizados pelo calendário de São Paulo."
        action={
          <Link href="/relatorios/geral" className={buttonVariants({ variant: 'outline' })}>
            <LayoutDashboard className="size-4" aria-hidden="true" />
            Ver analítico geral
          </Link>
        }
      />

      <ReportFilterCard
        idPrefix="company-hours-report"
        from={report.from}
        to={report.to}
        onFromChange={report.setFrom}
        onToChange={report.setTo}
        onApply={() => report.applyFilters()}
        onClear={report.clearFilters}
        isFetching={report.query.isFetching}
        error={report.filterError}
        description="Todos os pedidos criados entram como demanda, mesmo que tenham sido cancelados depois. Limite de 366 dias."
      />

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

      {data && peak && !report.query.isError && (
        <div className="space-y-7" aria-busy={report.query.isFetching}>
          {report.query.isFetching && (
            <p
              role="status"
              className="rounded-xl border border-portal/15 bg-portal-soft/40 px-4 py-3 text-sm text-muted-foreground"
            >
              Atualizando a distribuição de demanda...
            </p>
          )}

          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <DemandMetric
              label="Pedidos criados"
              value={number.format(total)}
              description={`${number.format(averagePerDay)} por dia civil no período`}
              comparison={data.comparison.changePercent.ordersCreated}
            />
            <DemandMetric
              label="Horário mais movimentado"
              value={hourLabel(peak.busiestHour)}
              description={
                peak.busiestHour === null
                  ? 'Não existe pico sem pedidos'
                  : `${number.format(peak.byHour[peak.busiestHour]?.count ?? 0)} pedido(s) nessa hora`
              }
            />
            <DemandMetric
              label="Dia mais intenso"
              value={
                peak.busiestWeekday === null
                  ? 'Sem movimento'
                  : (WEEKDAYS[peak.busiestWeekday] ?? 'Sem movimento')
              }
              description="Definido pela média por ocorrência, não pela contagem bruta"
            />
            <DemandMetric
              label="Dias observados"
              value={number.format(peak.daysInPeriod)}
              description="Inclui dias sem pedido para não inflar a média"
            />
          </section>

          {total === 0 ? (
            <Card>
              <CardContent className="py-16 text-center">
                <Clock3 className="mx-auto size-8 text-muted-foreground/60" aria-hidden="true" />
                <p className="mt-3 font-medium text-portal-deep">Nenhum pedido neste período</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Amplie o intervalo para identificar os horários de maior demanda.
                </p>
              </CardContent>
            </Card>
          ) : (
            <>
              <section className="space-y-4">
                <ReportSectionHeading
                  title="Demanda por faixa do dia"
                  description="As quatro faixas são exclusivas e somam exatamente todos os pedidos do período."
                />
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  {TIME_BANDS.map((band) => {
                    const count = peak.byHour
                      .filter((bucket) => bucket.hour >= band.from && bucket.hour <= band.to)
                      .reduce((sum, bucket) => sum + bucket.count, 0);
                    const bandShare = share(count, total);
                    return (
                      <Card key={band.label}>
                        <CardContent className="p-5">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="font-semibold text-portal-deep">{band.label}</p>
                              <p className="text-xs text-muted-foreground">{band.description}</p>
                            </div>
                            <SunMoon className="size-5 text-muted-foreground" aria-hidden="true" />
                          </div>
                          <p className="mt-4 font-heading text-2xl font-bold text-portal-deep">
                            {number.format(count)}
                          </p>
                          <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                            <div
                              className={`h-full rounded-full ${band.tone}`}
                              style={{ width: `${bandShare}%` }}
                            />
                          </div>
                          <p className="mt-2 text-xs text-muted-foreground">
                            {percent(bandShare)} da demanda
                          </p>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </section>

              <section className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.65fr)]">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">As 24 horas do dia</CardTitle>
                    <p className="text-sm font-normal text-muted-foreground">
                      Contagem exata e média diária; horas zeradas continuam visíveis.
                    </p>
                  </CardHeader>
                  <CardContent className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
                    {peak.byHour.map((bucket) => (
                      <div
                        key={bucket.hour}
                        className="grid grid-cols-[42px_minmax(0,1fr)_92px] items-center gap-3"
                      >
                        <span className="text-xs font-semibold tabular-nums text-portal-deep">
                          {hourLabel(bucket.hour)}
                        </span>
                        <div
                          className="h-2.5 overflow-hidden rounded-full bg-muted"
                          role="progressbar"
                          aria-label={`${hourLabel(bucket.hour)}: ${bucket.count} pedidos`}
                          aria-valuemin={0}
                          aria-valuemax={maxHourCount}
                          aria-valuenow={bucket.count}
                        >
                          <div
                            className="h-full rounded-full bg-portal"
                            style={{ width: `${(bucket.count / maxHourCount) * 100}%` }}
                          />
                        </div>
                        <span className="text-right text-xs tabular-nums text-muted-foreground">
                          <strong className="text-foreground">{number.format(bucket.count)}</strong>{' '}
                          · {number.format(bucket.averagePerDay)}/dia
                        </span>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Horas de maior movimento</CardTitle>
                    <p className="text-sm font-normal text-muted-foreground">
                      Ranking descritivo do recorte atual.
                    </p>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {busiestHours.map((bucket, index) => (
                      <div
                        key={bucket.hour}
                        className="flex items-center gap-3 rounded-xl border border-border/70 bg-muted/20 p-4"
                      >
                        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-portal-soft text-sm font-bold text-portal">
                          {index + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-portal-deep">{hourLabel(bucket.hour)}</p>
                          <p className="text-xs text-muted-foreground">
                            {number.format(bucket.averagePerDay)} pedido(s) por dia
                          </p>
                        </div>
                        <strong className="font-mono text-sm tabular-nums">
                          {number.format(bucket.count)}
                        </strong>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </section>

              <section className="space-y-4">
                <ReportSectionHeading
                  title="Demanda por dia da semana"
                  description="A média por ocorrência corrige períodos que possuem cinco segundas e apenas quatro terças, por exemplo."
                />
                <Card>
                  <CardContent className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-4">
                    {peak.byWeekday.map((bucket) => (
                      <div key={bucket.weekday} className="rounded-xl border border-border/70 p-4">
                        <div className="flex items-center justify-between gap-3">
                          <p className="font-semibold text-portal-deep">
                            {WEEKDAYS[bucket.weekday]}
                          </p>
                          <CalendarDays className="size-4 text-muted-foreground" aria-hidden="true" />
                        </div>
                        <p className="mt-3 font-heading text-xl font-bold text-portal-deep">
                          {number.format(bucket.averagePerOccurrence)}
                          <span className="ml-1 text-xs font-normal text-muted-foreground">
                            por ocorrência
                          </span>
                        </p>
                        <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-cyan-600"
                            style={{
                              width: `${(bucket.averagePerOccurrence / maxWeekdayAverage) * 100}%`,
                            }}
                          />
                        </div>
                        <p className="mt-2 text-xs text-muted-foreground">
                          {number.format(bucket.count)} pedido(s) em {bucket.occurrences} dia(s)
                        </p>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </section>
            </>
          )}

          <p className="rounded-xl border border-border/70 bg-card px-4 py-3 text-xs leading-5 text-muted-foreground">
            Horários e dias usam a criação do pedido no fuso America/Sao_Paulo. O relatório não usa horário UTC nem remove pedidos cancelados, porque ambos representaram demanda para a operação.
          </p>
        </div>
      )}
    </div>
  );
}

function HoursReportContent() {
  const searchParams = useSearchParams();
  return <HoursReportView key={searchParams.toString()} />;
}

export default function HoursReportPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Preparando relatório...</p>}>
      <HoursReportContent />
    </Suspense>
  );
}
