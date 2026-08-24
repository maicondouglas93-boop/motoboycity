'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { DeliveryStageSummary, PlatformSettingsItem } from '@motoboycity/types';
import { AlertCircle, Clock3, Gauge, ShieldCheck, TimerReset } from 'lucide-react';
import { ReportFilterCard } from '@/components/reports/report-filter-card';
import {
  ReportPageHeader,
  ReportQueryState,
  ReportSectionHeading,
} from '@/components/reports/report-layout';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
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
import {
  adminCompaniesApi,
  adminDriversApi,
  adminPlatformSettingsApi,
  deliveriesApi,
} from '@/lib/api-client';
import { session } from '@/lib/session';

const saoPauloDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function dateOnly(date: Date): string {
  const parts = Object.fromEntries(
    saoPauloDate
      .formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  );
  return `${parts['year']}-${parts['month']}-${parts['day']}`;
}

function defaultPeriod(): { from: string; to: string } {
  const to = new Date();
  const from = new Date(to.getTime() - 29 * 24 * 60 * 60 * 1000);
  return { from: dateOnly(from), to: dateOnly(to) };
}

const INITIAL_PERIOD = defaultPeriod();

type StageKey = 'aceite' | 'coleta' | 'entrega' | 'total';
type AlertSetting =
  'slaAlertMinutesToAccept' | 'slaAlertMinutesToCollect' | 'slaAlertMinutesToDeliver';

const stages: Array<{
  key: StageKey;
  title: string;
  description: string;
  alertSetting?: AlertSetting;
}> = [
  {
    key: 'aceite',
    title: 'Tempo até o aceite',
    description: 'Da entrada na fila até um entregador aceitar.',
    alertSetting: 'slaAlertMinutesToAccept',
  },
  {
    key: 'coleta',
    title: 'Tempo até a coleta',
    description: 'Do aceite até a coleta ser confirmada na loja.',
    alertSetting: 'slaAlertMinutesToCollect',
  },
  {
    key: 'entrega',
    title: 'Tempo até a entrega',
    description: 'Da coleta até a entrega ser confirmada ao cliente.',
    alertSetting: 'slaAlertMinutesToDeliver',
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

function thresholdFor(
  settings: PlatformSettingsItem | undefined,
  key: AlertSetting | undefined,
): number | null | undefined {
  if (!key) return null;
  if (!settings) return undefined;
  return settings[key];
}

function ThresholdBadge({
  p90,
  threshold,
  hasThreshold,
}: {
  p90: number | null;
  threshold: number | null | undefined;
  hasThreshold: boolean;
}) {
  if (!hasThreshold) return <Badge variant="secondary">Sem limite para o total</Badge>;
  if (threshold === undefined) return <Badge variant="secondary">Carregando limite</Badge>;
  if (threshold === null) return <Badge variant="outline">Alerta desligado</Badge>;
  if (p90 === null) return <Badge variant="secondary">Sem amostra suficiente</Badge>;
  if (p90 <= threshold) return <Badge>p90 dentro do limite</Badge>;
  return <Badge variant="destructive">p90 acima do limite</Badge>;
}

function StageCard({
  title,
  description,
  summary,
  threshold,
  hasThreshold,
}: {
  title: string;
  description: string;
  summary: DeliveryStageSummary;
  threshold: number | null | undefined;
  hasThreshold: boolean;
}) {
  return (
    <Card className="h-full">
      <CardHeader className="border-b border-border/60 pb-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle>{title}</CardTitle>
            <CardDescription className="mt-1 leading-5">{description}</CardDescription>
          </div>
          <Clock3 className="size-5 shrink-0 text-primary" aria-hidden="true" />
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
            {hasThreshold && threshold !== undefined && threshold !== null
              ? ` · alerta em ${threshold} min`
              : ''}
          </p>
          <ThresholdBadge
            p90={summary.p90Minutes}
            threshold={threshold}
            hasThreshold={hasThreshold}
          />
        </div>
      </CardContent>
    </Card>
  );
}

export default function StageTimesReportPage() {
  const token = session.getToken();
  const [from, setFrom] = useState(INITIAL_PERIOD.from);
  const [to, setTo] = useState(INITIAL_PERIOD.to);
  const [companyId, setCompanyId] = useState('');
  const [driverId, setDriverId] = useState('');
  const [excludeRetroactive, setExcludeRetroactive] = useState(false);
  const [filterError, setFilterError] = useState<string | null>(null);
  const [appliedFilters, setAppliedFilters] = useState<{
    from?: string;
    to?: string;
    companyId?: string;
    driverId?: string;
    excludeRetroactive?: boolean;
  }>({ ...INITIAL_PERIOD, excludeRetroactive: false });

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
  const settingsQuery = useQuery({
    queryKey: ['admin', 'platform-settings'],
    queryFn: () => adminPlatformSettingsApi.get(token as string),
    enabled: Boolean(token),
  });
  const timesQuery = useQuery({
    queryKey: ['admin', 'stage-times-report', appliedFilters],
    queryFn: () => deliveriesApi.stageTimes(token as string, appliedFilters),
    enabled: Boolean(token),
  });

  if (!token) {
    return <p className="text-sm text-muted-foreground">Faça login como administrador.</p>;
  }

  function applyFilters() {
    if (from && to && from > to) {
      setFilterError('A data inicial não pode ser posterior à data final.');
      return;
    }
    setFilterError(null);
    setAppliedFilters({
      ...(from && { from }),
      ...(to && { to }),
      ...(companyId && { companyId }),
      ...(driverId && { driverId }),
      excludeRetroactive,
    });
  }

  function clearFilters() {
    setFrom(INITIAL_PERIOD.from);
    setTo(INITIAL_PERIOD.to);
    setCompanyId('');
    setDriverId('');
    setExcludeRetroactive(false);
    setFilterError(null);
    setAppliedFilters({ ...INITIAL_PERIOD, excludeRetroactive: false });
  }

  const report = timesQuery.data;

  return (
    <div className="mx-auto w-full max-w-[1480px] space-y-7 pb-12">
      <ReportPageHeader
        icon={TimerReset}
        title="Tempos e SLA"
        description="Meça cada etapa do ciclo com média, mediana, p90 e tamanho da amostra, comparando a cauda da operação aos alertas configurados."
      />

      <ReportFilterCard
        idPrefix="stage-times-report"
        from={from}
        to={to}
        onFromChange={setFrom}
        onToChange={setTo}
        onApply={applyFilters}
        onClear={clearFilters}
        isFetching={timesQuery.isFetching}
        error={filterError}
        description="O período inicial cobre os últimos 30 dias. As datas selecionam pedidos pela data de criação."
      >
        <div className="min-w-52 flex-1 space-y-1.5 sm:max-w-64">
          <Label htmlFor="stage-times-company">Cliente</Label>
          <select
            id="stage-times-company"
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
          <Label htmlFor="stage-times-driver">Entregador</Label>
          <select
            id="stage-times-driver"
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
        <label className="flex min-h-9 max-w-xs cursor-pointer items-center gap-2 rounded-lg border border-border/70 bg-card px-3 py-2 text-sm">
          <Checkbox
            checked={excludeRetroactive}
            onCheckedChange={(checked) => setExcludeRetroactive(checked === true)}
            aria-label="Excluir marcações retroativas"
          />
          <span>Excluir marcações retroativas</span>
        </label>
      </ReportFilterCard>

      <ReportQueryState
        loading={timesQuery.isLoading}
        error={timesQuery.isError}
        onRetry={() => {
          void timesQuery.refetch();
        }}
      />

      {report && (
        <div className="space-y-8">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/10 bg-admin-soft/35 px-4 py-3 text-sm text-muted-foreground">
            <p>
              Pedidos criados de{' '}
              <strong className="text-admin-deep">
                {appliedFilters.from ?? 'todo o histórico'}
              </strong>{' '}
              até <strong className="text-admin-deep">{appliedFilters.to ?? 'hoje'}</strong>.
            </p>
            <Badge variant={appliedFilters.excludeRetroactive ? 'default' : 'outline'}>
              {appliedFilters.excludeRetroactive
                ? 'Somente horários do servidor'
                : 'Inclui horários declarados'}
            </Badge>
          </div>

          {settingsQuery.isError && (
            <div
              role="alert"
              className="flex items-center gap-2 rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive"
            >
              <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
              Os tempos foram calculados, mas não foi possível carregar os limites configurados.
            </div>
          )}

          <section className="space-y-4">
            <ReportSectionHeading
              title="Tempo por etapa"
              description="O p90 mostra o tempo abaixo do qual ficaram 90% das amostras e ajuda a enxergar a cauda que a média esconde."
            />
            <div className="grid gap-4 lg:grid-cols-2">
              {stages.map((stage) => (
                <StageCard
                  key={stage.key}
                  title={stage.title}
                  description={stage.description}
                  summary={report[stage.key]}
                  threshold={thresholdFor(settingsQuery.data, stage.alertSetting)}
                  hasThreshold={Boolean(stage.alertSetting)}
                />
              ))}
            </div>
          </section>

          <section className="space-y-4">
            <ReportSectionHeading
              title="Leitura comparativa"
              description="Os limites abaixo são os alertas da fila ao vivo. Eles servem como referência operacional; este contrato ainda não calcula percentual de pedidos dentro do SLA."
            />
            <Card>
              <CardContent className="overflow-x-auto p-0">
                <Table>
                  <TableCaption className="sr-only">
                    Tempos das etapas e limites operacionais configurados
                  </TableCaption>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Etapa</TableHead>
                      <TableHead className="text-right">Amostras</TableHead>
                      <TableHead className="text-right">Média</TableHead>
                      <TableHead className="text-right">Mediana</TableHead>
                      <TableHead className="text-right">p90</TableHead>
                      <TableHead className="text-right">Alerta configurado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {stages.map((stage) => {
                      const summary = report[stage.key];
                      const threshold = thresholdFor(settingsQuery.data, stage.alertSetting);
                      return (
                        <TableRow key={stage.key}>
                          <TableCell className="font-medium">{stage.title}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            {summary.samples}
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
                            {!stage.alertSetting
                              ? 'Não se aplica'
                              : threshold === undefined
                                ? 'Carregando'
                                : threshold === null
                                  ? 'Desligado'
                                  : `${threshold} min`}
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
                <Gauge className="size-5 text-primary" aria-hidden="true" />
                <CardTitle>Média, mediana e p90</CardTitle>
              </CardHeader>
              <CardContent className="text-sm leading-6 text-muted-foreground">
                A média resume o conjunto, a mediana mostra o caso central e o p90 revela os casos
                mais lentos sem deixar um único extremo dominar a leitura.
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <ShieldCheck className="size-5 text-primary" aria-hidden="true" />
                <CardTitle>Horários retroativos</CardTitle>
              </CardHeader>
              <CardContent className="text-sm leading-6 text-muted-foreground">
                No acompanhamento diário, horários declarados são a melhor aproximação disponível.
                Para cobrança de meta, exclua-os e use somente registros carimbados pelo servidor.
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <Clock3 className="size-5 text-primary" aria-hidden="true" />
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
