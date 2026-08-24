'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, BarChart3, Clock3, ListChecks, UsersRound } from 'lucide-react';
import { STATUS_OPTIONS } from '@/components/orders/status-chip';
import { ReportFilterCard } from '@/components/reports/report-filter-card';
import {
  ReportPageHeader,
  ReportPeriodSummary,
  ReportQueryState,
  ReportSectionHeading,
} from '@/components/reports/report-layout';
import { StatCard } from '@/components/stat-card';
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
import { useMoney } from '@/lib/money';
import { session } from '@/lib/session';

function formatChange(value: number | null): string {
  if (value === null) return 'Sem base comparável';
  const signal = value > 0 ? '+' : '';
  return `${signal}${value.toLocaleString('pt-BR')}%`;
}

export default function GeneralReportPage() {
  const token = session.getToken();
  const money = useMoney();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [periodError, setPeriodError] = useState<string | null>(null);
  const [appliedPeriod, setAppliedPeriod] = useState<{ from?: string; to?: string }>({});

  const reportQuery = useQuery({
    queryKey: ['admin', 'operations-report', 'general', appliedPeriod],
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

  const report = reportQuery.data;

  return (
    <div className="mx-auto w-full max-w-[1480px] space-y-7 pb-12">
      <ReportPageHeader
        icon={BarChart3}
        title="Analítico geral"
        description="Uma leitura executiva do volume, das conclusões e dos valores da operação, sempre comparada com uma janela anterior de mesma duração."
      />

      <ReportFilterCard
        idPrefix="general-report"
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
        <div className="space-y-9">
          <ReportPeriodSummary
            period={report.period}
            comparisonPeriod={report.comparison.period}
            live={report.live}
          />

          <section className="space-y-4">
            <ReportSectionHeading
              title="Indicadores principais"
              description="Pedidos criados usam a data de criação; conclusões e valores usam a data em que a entrega foi concluída."
            />
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard
                label="Pedidos criados"
                value={report.ordersCreated.count}
                changePercent={report.comparison.changePercent.ordersCreated}
              />
              <StatCard
                label="Entregas concluídas"
                value={report.deliveriesCompleted.count}
                changePercent={report.comparison.changePercent.deliveriesCompleted}
              />
              <StatCard
                label="Valor concluído"
                value={money(report.deliveriesCompleted.totalValue)}
                changePercent={report.comparison.changePercent.totalValue}
              />
              <StatCard
                label="Ticket médio concluído"
                value={money(report.deliveriesCompleted.averageTicket)}
                changePercent={report.comparison.changePercent.averageTicket}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <StatCard
                label="Repasse aos entregadores"
                value={money(report.deliveriesCompleted.driverValue)}
                hint="Somente entregas concluídas no período."
              />
              <StatCard
                label="Receita da plataforma"
                value={money(report.deliveriesCompleted.platformValue)}
                hint="Somente entregas concluídas no período."
              />
            </div>
          </section>

          <section className="space-y-4">
            <ReportSectionHeading
              title="Comparação com o período anterior"
              description="A janela anterior tem a mesma duração do período selecionado. Quando a base anterior é zero, não exibimos uma porcentagem artificial."
            />
            <Card>
              <CardContent className="overflow-x-auto p-0">
                <Table>
                  <TableCaption className="sr-only">
                    Comparação dos indicadores do período atual com o período anterior
                  </TableCaption>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Indicador</TableHead>
                      <TableHead className="text-right">Período atual</TableHead>
                      <TableHead className="text-right">Período anterior</TableHead>
                      <TableHead className="text-right">Variação</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow>
                      <TableCell className="font-medium">Pedidos criados</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {report.ordersCreated.count}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {report.comparison.ordersCreatedCount}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatChange(report.comparison.changePercent.ordersCreated)}
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="font-medium">Entregas concluídas</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {report.deliveriesCompleted.count}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {report.comparison.deliveriesCompletedCount}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatChange(report.comparison.changePercent.deliveriesCompleted)}
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="font-medium">Valor concluído</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {money(report.deliveriesCompleted.totalValue)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {money(report.comparison.totalValue)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatChange(report.comparison.changePercent.totalValue)}
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="font-medium">Ticket médio concluído</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {money(report.deliveriesCompleted.averageTicket)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {money(report.comparison.averageTicket)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatChange(report.comparison.changePercent.averageTicket)}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </section>

          <section className="space-y-4">
            <ReportSectionHeading
              title="Estado atual dos pedidos criados"
              description="A distribuição abaixo acompanha hoje os pedidos que nasceram no período selecionado."
              action={
                <Link
                  href="/relatorios/pedidos"
                  className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
                >
                  Abrir relatório de pedidos
                  <ArrowRight className="size-4" aria-hidden="true" />
                </Link>
              }
            />
            <Card>
              <CardContent className="overflow-x-auto p-0">
                <Table>
                  <TableCaption className="sr-only">
                    Quantidade e participação dos pedidos por status atual
                  </TableCaption>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Status atual</TableHead>
                      <TableHead className="text-right">Pedidos</TableHead>
                      <TableHead className="text-right">Participação</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {STATUS_OPTIONS.map((option) => {
                      const count = report.ordersCreated.byCurrentStatus[option.value];
                      const share = report.ordersCreated.count
                        ? (count / report.ordersCreated.count) * 100
                        : 0;
                      return (
                        <TableRow key={option.value}>
                          <TableCell className="font-medium">{option.label}</TableCell>
                          <TableCell className="text-right tabular-nums">{count}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            {share.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </section>

          <section className="space-y-4">
            <ReportSectionHeading
              title="Aprofunde a análise"
              description="Abra o relatório específico quando precisar investigar pedidos, tempos, clientes ou entregadores."
            />
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {[
                {
                  href: '/relatorios/pedidos',
                  title: 'Pedidos',
                  description: 'Busca e paginação pedido a pedido.',
                  icon: ListChecks,
                },
                {
                  href: '/relatorios/tempos-sla',
                  title: 'Tempos e SLA',
                  description: 'Média, mediana, p90 e amostras.',
                  icon: Clock3,
                },
                {
                  href: '/relatorios/clientes',
                  title: 'Clientes',
                  description: 'Volume e valores por empresa.',
                  icon: UsersRound,
                },
                {
                  href: '/relatorios/entregadores',
                  title: 'Entregadores',
                  description: 'Volume, aceite, tempo e repasse.',
                  icon: UsersRound,
                },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="group flex items-center gap-3 rounded-xl border border-primary/10 bg-card p-4 transition-colors hover:border-primary/30 hover:bg-admin-soft/40"
                  >
                    <Icon className="size-5 shrink-0 text-primary" aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold text-admin-deep">{item.title}</span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {item.description}
                      </span>
                    </span>
                    <ArrowRight
                      className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                      aria-hidden="true"
                    />
                  </Link>
                );
              })}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
