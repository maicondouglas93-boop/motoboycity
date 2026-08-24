'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Clock3, Download } from 'lucide-react';
import { PeakHoursChart } from '@/components/reports/peak-hours-chart';
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
import { session } from '@/lib/session';

const WEEKDAY_LONG = [
  'Domingo',
  'Segunda-feira',
  'Terça-feira',
  'Quarta-feira',
  'Quinta-feira',
  'Sexta-feira',
  'Sábado',
];

function formatHour(hour: number): string {
  return `${String(hour).padStart(2, '0')}:00`;
}

function weekdayName(weekday: number): string {
  return WEEKDAY_LONG[weekday] ?? `Dia ${weekday}`;
}

function formatAverage(value: number): string {
  return value.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
}

function csvNumber(value: number): string {
  return String(value).replace('.', ',');
}

export default function PeakHoursReportPage() {
  const token = session.getToken();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [periodError, setPeriodError] = useState<string | null>(null);
  const [appliedPeriod, setAppliedPeriod] = useState<{ from?: string; to?: string }>({});

  const reportQuery = useQuery({
    queryKey: ['admin', 'operations-report', 'peak-hours', appliedPeriod],
    queryFn: () => adminReportsApi.operations(token as string, appliedPeriod),
    enabled: Boolean(token),
  });

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

  function exportCsv() {
    const peakHours = reportQuery.data?.peakHours;
    if (!peakHours) return;

    const csv = toCsv(
      ['Dimensão', 'Faixa', 'Pedidos', 'Ocorrências no período', 'Média normalizada'],
      [
        ...peakHours.byHour.map((bucket) => [
          'Hora do dia',
          formatHour(bucket.hour),
          bucket.count,
          peakHours.daysInPeriod,
          csvNumber(bucket.averagePerDay),
        ]),
        ...peakHours.byWeekday.map((bucket) => [
          'Dia da semana',
          weekdayName(bucket.weekday),
          bucket.count,
          bucket.occurrences,
          csvNumber(bucket.averagePerOccurrence),
        ]),
      ],
    );
    downloadCsv('relatorio-horarios-de-pico.csv', csv);
  }

  const report = reportQuery.data;
  const peakHours = report?.peakHours;
  const busiestHourBucket =
    peakHours?.busiestHour === null || peakHours?.busiestHour === undefined
      ? null
      : peakHours.byHour[peakHours.busiestHour];
  const busiestWeekdayBucket =
    peakHours?.busiestWeekday === null || peakHours?.busiestWeekday === undefined
      ? null
      : peakHours.byWeekday[peakHours.busiestWeekday];

  return (
    <div className="mx-auto w-full max-w-[1480px] space-y-7 pb-12">
      <ReportPageHeader
        icon={Clock3}
        title="Horários de pico"
        description="Identifique quando os pedidos entram por hora e por dia da semana para planejar disponibilidade e escala de entregadores."
        action={
          <Button
            type="button"
            variant="outline"
            onClick={exportCsv}
            disabled={!peakHours || peakHours.totalConsidered === 0}
          >
            <Download className="size-4" aria-hidden="true" />
            Baixar CSV
          </Button>
        }
      />

      <ReportFilterCard
        idPrefix="peak-hours-report"
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

      {report && peakHours && (
        <div className="space-y-8">
          <ReportPeriodSummary
            period={report.period}
            comparisonPeriod={report.comparison.period}
            live={report.live}
          />

          <section className="space-y-4">
            <ReportSectionHeading
              title="Resumo da demanda"
              description="A base considera todos os pedidos criados no intervalo, inclusive os cancelados depois, porque também ocuparam a fila e a capacidade operacional."
            />
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard
                label="Pedidos considerados"
                value={peakHours.totalConsidered}
                hint={`${peakHours.daysInPeriod} dias civis no recorte.`}
              />
              <StatCard
                label="Média diária"
                value={formatAverage(
                  peakHours.daysInPeriod ? peakHours.totalConsidered / peakHours.daysInPeriod : 0,
                )}
                hint="Pedidos criados por dia do período."
              />
              <StatCard
                label="Horário mais movimentado"
                value={busiestHourBucket ? formatHour(busiestHourBucket.hour) : 'Sem movimento'}
                hint={
                  busiestHourBucket
                    ? `${busiestHourBucket.count} pedidos; ${formatAverage(busiestHourBucket.averagePerDay)} por dia.`
                    : 'Nenhum pedido criado no período.'
                }
              />
              <StatCard
                label="Dia mais movimentado"
                value={
                  busiestWeekdayBucket ? weekdayName(busiestWeekdayBucket.weekday) : 'Sem movimento'
                }
                hint={
                  busiestWeekdayBucket
                    ? `${formatAverage(busiestWeekdayBucket.averagePerOccurrence)} pedidos por ocorrência.`
                    : 'Nenhum pedido criado no período.'
                }
              />
            </div>
          </section>

          <PeakHoursChart peakHours={peakHours} />

          <section className="space-y-4">
            <ReportSectionHeading
              title="Leitura detalhada"
              description="As médias normalizam períodos de tamanhos diferentes: por hora, dividimos pelos dias do recorte; por dia da semana, pelas ocorrências daquele dia."
            />
            <div className="grid gap-4 xl:grid-cols-2">
              <Card>
                <CardContent className="max-h-[560px] overflow-auto p-0">
                  <Table>
                    <TableCaption className="sr-only">Pedidos criados por hora do dia</TableCaption>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Hora</TableHead>
                        <TableHead className="text-right">Pedidos</TableHead>
                        <TableHead className="text-right">Média por dia</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {peakHours.byHour.map((bucket) => (
                        <TableRow key={bucket.hour}>
                          <TableCell className="font-medium">{formatHour(bucket.hour)}</TableCell>
                          <TableCell className="text-right tabular-nums">{bucket.count}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatAverage(bucket.averagePerDay)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="overflow-x-auto p-0">
                  <Table>
                    <TableCaption className="sr-only">
                      Pedidos criados por dia da semana
                    </TableCaption>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Dia da semana</TableHead>
                        <TableHead className="text-right">Ocorrências</TableHead>
                        <TableHead className="text-right">Pedidos</TableHead>
                        <TableHead className="text-right">Média</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {peakHours.byWeekday.map((bucket) => (
                        <TableRow key={bucket.weekday}>
                          <TableCell className="font-medium">
                            {weekdayName(bucket.weekday)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {bucket.occurrences}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{bucket.count}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatAverage(bucket.averagePerOccurrence)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
