'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, Info, Truck } from 'lucide-react';
import { DriverRanking } from '@/components/reports/driver-ranking';
import { ReportFilterCard } from '@/components/reports/report-filter-card';
import {
  ReportPageHeader,
  ReportPeriodSummary,
  ReportQueryState,
  ReportSectionHeading,
} from '@/components/reports/report-layout';
import { StatCard } from '@/components/stat-card';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { adminReportsApi } from '@/lib/api-client';
import { downloadCsv, toCsv } from '@/lib/csv';
import { useMoney } from '@/lib/money';
import { session } from '@/lib/session';

function csvNumber(value: number | null): string {
  return value === null ? '' : String(value).replace('.', ',');
}

export default function DriversReportPage() {
  const token = session.getToken();
  const money = useMoney();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [periodError, setPeriodError] = useState<string | null>(null);
  const [appliedPeriod, setAppliedPeriod] = useState<{ from?: string; to?: string }>({});
  const [search, setSearch] = useState('');

  const reportQuery = useQuery({
    queryKey: ['admin', 'operations-report', 'drivers', appliedPeriod],
    queryFn: () => adminReportsApi.operations(token as string, appliedPeriod),
    enabled: Boolean(token),
  });

  const filteredDrivers = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase('pt-BR');
    return (reportQuery.data?.drivers ?? []).filter((driver) =>
      normalizedSearch
        ? `${driver.driverName} ${driver.driverEmail}`
            .toLocaleLowerCase('pt-BR')
            .includes(normalizedSearch)
        : true,
    );
  }, [reportQuery.data?.drivers, search]);

  const summary = useMemo(() => {
    const drivers = reportQuery.data?.drivers ?? [];
    const offersReceived = drivers.reduce((sum, driver) => sum + driver.offersReceived, 0);
    const offersAccepted = drivers.reduce((sum, driver) => sum + driver.offersAccepted, 0);
    return {
      completed: drivers.reduce((sum, driver) => sum + driver.completedCount, 0),
      driverValue: drivers.reduce((sum, driver) => sum + driver.driverValue, 0),
      offersReceived,
      offersAccepted,
      acceptanceRate: offersReceived ? (offersAccepted / offersReceived) * 100 : null,
    };
  }, [reportQuery.data?.drivers]);

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
    const csv = toCsv(
      [
        'Entregador',
        'E-mail',
        'Concluídas',
        'Não entregues',
        'Canceladas após aceite',
        'Taxa de conclusão (%)',
        'Ofertas recebidas',
        'Ofertas aceitas',
        'Taxa de aceite (%)',
        'Tempo médio (min)',
        'Amostras de tempo',
        'Repasse',
      ],
      filteredDrivers.map((driver) => [
        driver.driverName,
        driver.driverEmail,
        driver.completedCount,
        driver.failedCount,
        driver.cancelledAfterAcceptCount,
        csvNumber(driver.completionRate),
        driver.offersReceived,
        driver.offersAccepted,
        csvNumber(driver.acceptanceRate),
        csvNumber(driver.averageMinutesToComplete),
        driver.timedSamples,
        csvNumber(driver.driverValue),
      ]),
    );
    downloadCsv('relatorio-entregadores.csv', csv);
  }

  const report = reportQuery.data;

  return (
    <div className="mx-auto w-full max-w-[1480px] space-y-7 pb-12">
      <ReportPageHeader
        icon={Truck}
        title="Desempenho de entregadores"
        description="Compare volume, confiabilidade, aceite, tempo e repasse em métricas separadas, sem esconder critérios em uma nota única."
        action={
          <Button
            type="button"
            variant="outline"
            onClick={exportCsv}
            disabled={filteredDrivers.length === 0}
          >
            <Download className="size-4" aria-hidden="true" />
            Baixar CSV
          </Button>
        }
      />

      <ReportFilterCard
        idPrefix="drivers-report"
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

          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <StatCard
              label="Entregadores no ranking"
              value={report.drivers.length}
              hint="Com oferta recebida ou corrida encerrada no período."
            />
            <StatCard label="Entregas concluídas" value={summary.completed} />
            <StatCard
              label="Ofertas recebidas"
              value={summary.offersReceived}
              hint={`${summary.offersAccepted} aceitas pelos entregadores listados.`}
            />
            <StatCard
              label="Aceite agregado"
              value={
                summary.acceptanceRate === null
                  ? '—'
                  : `${summary.acceptanceRate.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`
              }
              hint="Aceites divididos pelas ofertas recebidas."
            />
            <StatCard label="Repasse total" value={money(summary.driverValue)} />
          </section>

          <section className="space-y-4">
            <ReportSectionHeading
              title="Ranking multidimensional"
              description="Clique no nome de uma métrica para ordenar. Valores sem amostra aparecem como travessão, nunca como zero."
              action={
                <Input
                  aria-label="Buscar entregador no relatório"
                  className="w-72 max-w-full"
                  placeholder="Buscar entregador..."
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              }
            />
            <Card>
              <CardContent className="p-0">
                <DriverRanking drivers={filteredDrivers} />
              </CardContent>
            </Card>
          </section>

          <section className="space-y-4">
            <ReportSectionHeading
              title="Como interpretar"
              description="As métricas respondem perguntas diferentes e não devem ser somadas em uma pontuação arbitrária."
            />
            <div className="grid gap-4 md:grid-cols-3">
              <Card>
                <CardHeader>
                  <Info className="size-5 text-primary" aria-hidden="true" />
                  <CardTitle>Conclusão</CardTitle>
                </CardHeader>
                <CardContent className="text-sm leading-6 text-muted-foreground">
                  Das corridas encerradas que o entregador assumiu, mostra quantas terminaram com
                  entrega concluída. Insucessos e cancelamentos após o aceite ficam visíveis.
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <Info className="size-5 text-primary" aria-hidden="true" />
                  <CardTitle>Aceite</CardTitle>
                </CardHeader>
                <CardContent className="text-sm leading-6 text-muted-foreground">
                  Compara ofertas aceitas com ofertas recebidas. Sem oferta no período, a taxa não
                  existe e aparece como travessão.
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <Info className="size-5 text-primary" aria-hidden="true" />
                  <CardTitle>Tempo médio</CardTitle>
                </CardHeader>
                <CardContent className="text-sm leading-6 text-muted-foreground">
                  Mede do primeiro aceite à conclusão e mostra o número de entregas usado na média,
                  para que amostras pequenas não pareçam definitivas.
                </CardContent>
              </Card>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
