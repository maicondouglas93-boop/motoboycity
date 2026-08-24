'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ApiError } from '@motoboycity/api-client';
import { useQuery } from '@tanstack/react-query';
import type { DeliveryStageSummary } from '@motoboycity/types';
import { AlertCircle, Clock3, Gauge, ShieldCheck, TimerReset } from 'lucide-react';
import { ReportFilterCard } from '@/components/reports/report-filter-card';
import {
  ReportPageHeader,
  ReportPeriodSummary,
  ReportQueryState,
  ReportSectionHeading,
} from '@/components/reports/report-layout';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
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
import { defaultReportPeriod, isReportDate, previousComparablePeriod } from '@/lib/report-period';
import { session } from '@/lib/session';

type StageKey = 'aceite' | 'coleta' | 'entrega' | 'total';

const stages: Array<{ key: StageKey; title: string; description: string }> = [
  {
    key: 'aceite',
    title: 'Tempo até o aceite',
    description: 'Da entrada na fila até um entregador aceitar.',
  },
  {
    key: 'coleta',
    title: 'Tempo até a coleta',
    description: 'Do aceite até a coleta ser confirmada na loja.',
  },
  {
    key: 'entrega',
    title: 'Tempo até a entrega',
    description: 'Da coleta até a entrega ser confirmada ao cliente.',
  },
  {
    key: 'total',
    title: 'Tempo total',
    description: 'Da entrada na fila até a entrega ao destinatário.',
  },
];

function minutes(value: number | null): string {
  return value === null
    ? '—'
    : `${value.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} min`;
}

function comparisonText(current: number | null, previous: number | null): string {
  if (current === null || previous === null) return 'Sem comparação disponível';
  const difference = current - previous;
  if (Math.abs(difference) < 0.05) return 'Mesmo p90 do período anterior';
  const formatted = Math.abs(difference).toLocaleString('pt-BR', { maximumFractionDigits: 1 });
  return `${formatted} min ${difference < 0 ? 'menor' : 'maior'} que antes`;
}

function queryErrorMessage(error: unknown, fallback: string): string | null {
  if (!error) return null;
  return error instanceof ApiError ? error.message : fallback;
}

function StageCard({
  title,
  description,
  summary,
  previous,
}: {
  title: string;
  description: string;
  summary: DeliveryStageSummary;
  previous: DeliveryStageSummary | undefined;
}) {
  return (
    <Card className="h-full">
      <CardHeader className="border-b border-border/60 pb-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle>{title}</CardTitle>
            <CardDescription className="mt-1 leading-5">{description}</CardDescription>
          </div>
          <Clock3 className="size-5 shrink-0 text-portal" aria-hidden="true" />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <div>
            <p className="text-xs text-muted-foreground">Média</p>
            <p className="mt-1 font-mono text-lg font-semibold tabular-nums">
              {minutes(summary.averageMinutes)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Mediana</p>
            <p className="mt-1 font-mono text-lg font-semibold tabular-nums">
              {minutes(summary.medianMinutes)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">p90</p>
            <p className="mt-1 font-mono text-lg font-semibold tabular-nums">
              {minutes(summary.p90Minutes)}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-3">
          <p className="text-xs text-muted-foreground">
            {summary.samples} {summary.samples === 1 ? 'amostra' : 'amostras'}
          </p>
          <Badge variant="secondary">
            {comparisonText(summary.p90Minutes, previous?.p90Minutes ?? null)}
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}

function StageTimesReportView() {
  const token = session.getToken();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const defaultPeriod = useMemo(() => defaultReportPeriod(), []);

  const applied = useMemo(() => {
    const fromParam = searchParams.get('from');
    const toParam = searchParams.get('to');
    return {
      from: isReportDate(fromParam) ? fromParam : defaultPeriod.from,
      to: isReportDate(toParam) ? toParam : defaultPeriod.to,
      excludeRetroactive: searchParams.get('excludeRetroactive') === 'true',
    };
  }, [defaultPeriod, searchParams]);
  const comparisonPeriod = useMemo(
    () => previousComparablePeriod({ from: applied.from, to: applied.to }),
    [applied.from, applied.to],
  );

  const [from, setFrom] = useState(applied.from);
  const [to, setTo] = useState(applied.to);
  const [excludeRetroactive, setExcludeRetroactive] = useState(applied.excludeRetroactive);
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
    const normalizedRetroactive = applied.excludeRetroactive ? 'true' : 'false';
    if (params.get('excludeRetroactive') !== normalizedRetroactive) {
      params.set('excludeRetroactive', normalizedRetroactive);
      changed = true;
    }
    if (changed) router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [applied, pathname, router, searchParams]);

  const currentQuery = useQuery({
    queryKey: ['company', 'reports', 'stage-times', applied],
    queryFn: () => deliveriesApi.stageTimes(token as string, applied),
    enabled: Boolean(token),
  });
  const previousQuery = useQuery({
    queryKey: [
      'company',
      'reports',
      'stage-times-comparison',
      comparisonPeriod,
      applied.excludeRetroactive,
    ],
    queryFn: () =>
      deliveriesApi.stageTimes(token as string, {
        ...comparisonPeriod,
        excludeRetroactive: applied.excludeRetroactive,
      }),
    enabled: Boolean(token),
  });

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
    navigate(
      new URLSearchParams({
        from,
        to,
        excludeRetroactive: String(excludeRetroactive),
      }),
    );
  }

  function clearFilters() {
    setFilterError(null);
    const period = defaultReportPeriod();
    setFrom(period.from);
    setTo(period.to);
    setExcludeRetroactive(false);
    navigate(
      new URLSearchParams({
        from: period.from,
        to: period.to,
        excludeRetroactive: 'false',
      }),
    );
  }

  const report = currentQuery.data;
  const comparison = previousQuery.data;

  return (
    <div className="mx-auto w-full max-w-[1480px] space-y-7 pb-12">
      <ReportPageHeader
        icon={TimerReset}
        title="Tempos e SLA"
        description="Acompanhe média, mediana, p90 e tamanho da amostra em cada etapa. Sem uma meta contratual configurada para a empresa, a leitura é comparativa e não classifica o resultado como aprovado ou reprovado."
      />

      <ReportFilterCard
        idPrefix="company-stage-times-report"
        from={from}
        to={to}
        onFromChange={setFrom}
        onToChange={setTo}
        onApply={applyFilters}
        onClear={clearFilters}
        isFetching={currentQuery.isFetching || previousQuery.isFetching}
        error={filterError}
        description="O período padrão cobre os últimos 30 dias. As datas selecionam pedidos pela data de criação."
      >
        <label className="flex min-h-9 max-w-xs cursor-pointer items-center gap-2 rounded-lg border border-border/70 bg-card px-3 py-2 text-sm">
          <Checkbox
            checked={excludeRetroactive}
            onCheckedChange={(checked) => setExcludeRetroactive(checked === true)}
            aria-label="Excluir marcações retroativas"
          />
          <span>Excluir horários declarados depois</span>
        </label>
      </ReportFilterCard>

      <ReportPeriodSummary
        period={{ from: applied.from, to: applied.to }}
        comparisonPeriod={comparisonPeriod}
        live={applied.to === defaultPeriod.to}
      />

      <ReportQueryState
        loading={currentQuery.isLoading}
        errorMessage={queryErrorMessage(
          currentQuery.error,
          'Não foi possível calcular os tempos da operação.',
        )}
        onRetry={() => {
          void currentQuery.refetch();
        }}
      />

      {previousQuery.isError && report && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive"
        >
          <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
          {queryErrorMessage(
            previousQuery.error,
            'Os tempos atuais foram carregados, mas a comparação anterior falhou.',
          )}
        </div>
      )}

      {report && !currentQuery.isError && (
        <div className="space-y-8">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-portal/10 bg-portal-soft/35 px-4 py-3 text-sm text-muted-foreground">
            <p>Cada etapa usa apenas pedidos que registraram as duas transições necessárias.</p>
            <Badge variant={applied.excludeRetroactive ? 'default' : 'outline'}>
              {applied.excludeRetroactive
                ? 'Somente horários do servidor'
                : 'Inclui horários declarados'}
            </Badge>
          </div>

          <section className="space-y-4">
            <ReportSectionHeading
              title="Tempo por etapa"
              description="O p90 mostra o tempo abaixo do qual ficaram 90% das amostras e evidencia a cauda que a média costuma esconder."
            />
            <div className="grid gap-4 lg:grid-cols-2">
              {stages.map((stage) => (
                <StageCard
                  key={stage.key}
                  title={stage.title}
                  description={stage.description}
                  summary={report[stage.key]}
                  previous={comparison?.[stage.key]}
                />
              ))}
            </div>
          </section>

          <section className="space-y-4">
            <ReportSectionHeading
              title="Comparação completa"
              description="Os dois períodos têm exatamente a mesma duração; amostras diferentes são mantidas visíveis para evitar conclusões sem denominador."
            />
            <Card>
              <CardContent className="overflow-x-auto p-0">
                <Table>
                  <TableCaption className="sr-only">
                    Tempos atuais e da janela imediatamente anterior
                  </TableCaption>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Etapa</TableHead>
                      <TableHead className="text-right">Amostras atuais</TableHead>
                      <TableHead className="text-right">Média</TableHead>
                      <TableHead className="text-right">Mediana</TableHead>
                      <TableHead className="text-right">p90 atual</TableHead>
                      <TableHead className="text-right">p90 anterior</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {stages.map((stage) => {
                      const summary = report[stage.key];
                      const previous = comparison?.[stage.key];
                      return (
                        <TableRow key={stage.key}>
                          <TableCell className="font-medium">{stage.title}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            {summary.samples}
                            {previous && (
                              <span className="block text-xs text-muted-foreground">
                                antes: {previous.samples}
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {minutes(summary.averageMinutes)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {minutes(summary.medianMinutes)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {minutes(summary.p90Minutes)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {minutes(previous?.p90Minutes ?? null)}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </section>

          <section className="grid gap-4 lg:grid-cols-3">
            <Card>
              <CardHeader>
                <Gauge className="size-5 text-portal" aria-hidden="true" />
                <CardTitle>Média, mediana e p90</CardTitle>
              </CardHeader>
              <CardContent className="text-sm leading-6 text-muted-foreground">
                A média resume o conjunto, a mediana mostra o caso central e o p90 revela os casos
                mais lentos sem deixar um único extremo dominar a leitura.
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <ShieldCheck className="size-5 text-portal" aria-hidden="true" />
                <CardTitle>Horários retroativos</CardTitle>
              </CardHeader>
              <CardContent className="text-sm leading-6 text-muted-foreground">
                Horários declarados pelo motoboy são úteis no acompanhamento diário. Exclua-os
                quando quiser comparar somente eventos carimbados pelo servidor.
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <Clock3 className="size-5 text-portal" aria-hidden="true" />
                <CardTitle>Tamanho da amostra</CardTitle>
              </CardHeader>
              <CardContent className="text-sm leading-6 text-muted-foreground">
                Cada etapa possui seu próprio número de amostras porque só entra no cálculo quando
                as duas transições necessárias foram registradas.
              </CardContent>
            </Card>
          </section>
        </div>
      )}
    </div>
  );
}

function StageTimesReportContent() {
  const searchParams = useSearchParams();
  return <StageTimesReportView key={searchParams.toString()} />;
}

export default function StageTimesReportPage() {
  return (
    <Suspense
      fallback={
        <p className="text-sm text-muted-foreground" role="status">
          Preparando relatório...
        </p>
      }
    >
      <StageTimesReportContent />
    </Suspense>
  );
}
