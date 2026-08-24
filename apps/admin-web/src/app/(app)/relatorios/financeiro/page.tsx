'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, CheckCircle2, CircleDollarSign, Download, WalletCards } from 'lucide-react';
import { ReportFilterCard } from '@/components/reports/report-filter-card';
import {
  ReportPageHeader,
  ReportPeriodSummary,
  ReportQueryState,
  ReportSectionHeading,
} from '@/components/reports/report-layout';
import { StatCard } from '@/components/stat-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { adminFinancialApi, adminReportsApi } from '@/lib/api-client';
import { downloadCsv, toCsv } from '@/lib/csv';
import { useMoney } from '@/lib/money';
import { session } from '@/lib/session';

function formatShare(value: number): string {
  return `${value.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
}

function formatChange(value: number | null): string {
  if (value === null) return 'Sem base comparável';
  const signal = value > 0 ? '+' : '';
  return `${signal}${value.toLocaleString('pt-BR')}%`;
}

function csvNumber(value: number): string {
  return String(value).replace('.', ',');
}

export default function FinancialReportPage() {
  const token = session.getToken();
  const money = useMoney();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [periodError, setPeriodError] = useState<string | null>(null);
  const [appliedPeriod, setAppliedPeriod] = useState<{ from?: string; to?: string }>({});

  const reportQuery = useQuery({
    queryKey: ['admin', 'operations-report', 'financial', appliedPeriod],
    queryFn: () => adminReportsApi.operations(token as string, appliedPeriod),
    enabled: Boolean(token),
  });

  const cashQuery = useQuery({
    queryKey: ['admin', 'financial', 'cash-position', 'report'],
    queryFn: () => adminFinancialApi.cashPosition(token as string),
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
    const report = reportQuery.data;
    if (!report) return;

    const rows: unknown[][] = [
      [
        `${report.period.from} a ${report.period.to}`,
        'Entregas concluídas',
        report.deliveriesCompleted.count,
        'Período filtrado',
      ],
      [
        `${report.period.from} a ${report.period.to}`,
        'Valor concluído',
        csvNumber(report.deliveriesCompleted.totalValue),
        'Período filtrado',
      ],
      [
        `${report.period.from} a ${report.period.to}`,
        'Repasse aos entregadores',
        csvNumber(report.deliveriesCompleted.driverValue),
        'Período filtrado',
      ],
      [
        `${report.period.from} a ${report.period.to}`,
        'Receita da plataforma',
        csvNumber(report.deliveriesCompleted.platformValue),
        'Período filtrado',
      ],
      [
        `${report.period.from} a ${report.period.to}`,
        'Ticket médio concluído',
        csvNumber(report.deliveriesCompleted.averageTicket),
        'Período filtrado',
      ],
    ];

    if (cashQuery.data) {
      rows.push(
        [
          'Agora',
          'Total a receber',
          csvNumber(cashQuery.data.totalReceivable),
          'Sem filtro de período',
        ],
        [
          'Agora',
          'Concluído e ainda não faturado',
          csvNumber(cashQuery.data.unbilledValue),
          'Sem filtro de período',
        ],
        [
          'Agora',
          'Faturas a vencer',
          csvNumber(cashQuery.data.invoicesDueValue),
          'Sem filtro de período',
        ],
        [
          'Agora',
          'Faturas vencidas',
          csvNumber(cashQuery.data.invoicesOverdueValue),
          'Sem filtro de período',
        ],
        [
          'Agora',
          'Saldo disponível aos entregadores',
          csvNumber(cashQuery.data.driverAvailableBalance),
          'Sem filtro de período',
        ],
        [
          'Agora',
          'Saldo bloqueado dos entregadores',
          csvNumber(cashQuery.data.driverBlockedBalance),
          'Sem filtro de período',
        ],
        [
          'Agora',
          'Saques pendentes',
          csvNumber(cashQuery.data.pendingWithdrawalValue),
          'Sem filtro de período',
        ],
      );
    }

    downloadCsv(
      'relatorio-composicao-financeira.csv',
      toCsv(['Escopo', 'Indicador', 'Valor', 'Regra temporal'], rows),
    );
  }

  const report = reportQuery.data;
  const cash = cashQuery.data;
  const totalValue = report?.deliveriesCompleted.totalValue ?? 0;
  const driverShare = totalValue
    ? ((report?.deliveriesCompleted.driverValue ?? 0) / totalValue) * 100
    : 0;
  const platformShare = totalValue
    ? ((report?.deliveriesCompleted.platformValue ?? 0) / totalValue) * 100
    : 0;
  const reconciliationDifference = report
    ? Math.round(
        (report.deliveriesCompleted.totalValue -
          report.deliveriesCompleted.driverValue -
          report.deliveriesCompleted.platformValue) *
          100,
      ) / 100
    : 0;

  return (
    <div className="mx-auto w-full max-w-[1480px] space-y-7 pb-12">
      <ReportPageHeader
        icon={CircleDollarSign}
        title="Composição financeira"
        description="Analise o valor concluído, a divisão entre entregadores e plataforma e, em uma seção separada, a posição de caixa atual."
        action={
          <Button type="button" variant="outline" onClick={exportCsv} disabled={!report}>
            <Download className="size-4" aria-hidden="true" />
            Baixar CSV
          </Button>
        }
      />

      <ReportFilterCard
        idPrefix="financial-report"
        from={from}
        to={to}
        onFromChange={setFrom}
        onToChange={setTo}
        onApply={applyPeriod}
        onClear={clearPeriod}
        isFetching={reportQuery.isFetching}
        error={periodError}
        description="O filtro afeta somente os resultados concluídos. A posição de caixa abaixo representa o momento atual e não muda com o período."
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
              title="Resultados concluídos no período"
              description="Contagem e valores usam a data em que a entrega foi concluída, não a data em que o pedido foi criado."
            />
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
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
                label="Ticket médio"
                value={money(report.deliveriesCompleted.averageTicket)}
                changePercent={report.comparison.changePercent.averageTicket}
              />
              <StatCard
                label="Receita da plataforma"
                value={money(report.deliveriesCompleted.platformValue)}
                hint={`${formatShare(platformShare)} do valor concluído.`}
              />
            </div>
          </section>

          <section className="space-y-4">
            <ReportSectionHeading
              title="Divisão do valor concluído"
              description="A soma do repasse e da receita da plataforma deve reconciliar com o valor total concluído."
              action={
                <Badge variant={reconciliationDifference === 0 ? 'default' : 'destructive'}>
                  {reconciliationDifference === 0 ? (
                    <CheckCircle2 className="size-3" aria-hidden="true" />
                  ) : (
                    <AlertCircle className="size-3" aria-hidden="true" />
                  )}
                  {reconciliationDifference === 0
                    ? 'Valores reconciliados'
                    : `Diferença de ${money(reconciliationDifference)}`}
                </Badge>
              }
            />

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(420px,0.9fr)]">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Participação no total</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div
                    className="flex h-5 overflow-hidden rounded-full bg-muted"
                    role="img"
                    aria-label={`Repasse ${formatShare(driverShare)}; plataforma ${formatShare(platformShare)}`}
                  >
                    <span
                      className="h-full bg-primary"
                      style={{ width: `${Math.min(Math.max(driverShare, 0), 100)}%` }}
                    />
                    <span
                      className="h-full bg-colete"
                      style={{ width: `${Math.min(Math.max(platformShare, 0), 100)}%` }}
                    />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-xl border border-primary/15 bg-primary/5 p-4">
                      <p className="text-sm text-muted-foreground">Repasse aos entregadores</p>
                      <p className="mt-1 font-mono text-xl font-semibold tabular-nums">
                        {money(report.deliveriesCompleted.driverValue)}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {formatShare(driverShare)} do total concluído
                      </p>
                    </div>
                    <div className="rounded-xl border border-colete/20 bg-colete/5 p-4">
                      <p className="text-sm text-muted-foreground">Receita da plataforma</p>
                      <p className="mt-1 font-mono text-xl font-semibold tabular-nums">
                        {money(report.deliveriesCompleted.platformValue)}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {formatShare(platformShare)} do total concluído
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="overflow-x-auto p-0">
                  <Table>
                    <TableCaption className="sr-only">
                      Comparação financeira com o período anterior
                    </TableCaption>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Indicador</TableHead>
                        <TableHead className="text-right">Atual</TableHead>
                        <TableHead className="text-right">Anterior</TableHead>
                        <TableHead className="text-right">Variação</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
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
                        <TableCell className="font-medium">Ticket médio</TableCell>
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
            </div>
          </section>

          <section className="space-y-4">
            <ReportSectionHeading
              title="Posição de caixa agora"
              description="Esta fotografia não usa o filtro de período: valores antigos ainda não faturados, faturas em aberto e obrigações com entregadores continuam existindo hoje."
              action={
                <Badge variant="outline">
                  <WalletCards className="size-3" aria-hidden="true" />
                  Estado atual
                </Badge>
              }
            />

            {cashQuery.isLoading && (
              <Card>
                <CardContent className="py-12 text-center text-sm text-muted-foreground">
                  Calculando posição de caixa atual...
                </CardContent>
              </Card>
            )}

            {cashQuery.isError && (
              <div
                role="alert"
                className="flex flex-wrap items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
              >
                <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
                <span className="flex-1">Não foi possível carregar a posição de caixa atual.</span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    void cashQuery.refetch();
                  }}
                >
                  Tentar novamente
                </Button>
              </div>
            )}

            {cash && (
              <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <StatCard
                    label="Total a receber"
                    value={money(cash.totalReceivable)}
                    hint="Não faturado + a vencer + vencido."
                  />
                  <StatCard
                    label="Concluído sem fatura"
                    value={money(cash.unbilledValue)}
                    hint={`${cash.unbilledCount} entregas faturadas ainda sem fatura.`}
                  />
                  <StatCard
                    label="Faturas a vencer"
                    value={money(cash.invoicesDueValue)}
                    hint={`${cash.invoicesDueCount} faturas pendentes.`}
                  />
                  <StatCard
                    label="Faturas vencidas"
                    value={money(cash.invoicesOverdueValue)}
                    hint={`${cash.invoicesOverdueCount} faturas em atraso.`}
                  />
                </div>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Obrigações com entregadores</CardTitle>
                  </CardHeader>
                  <CardContent className="overflow-x-auto p-0">
                    <Table>
                      <TableCaption className="sr-only">
                        Saldos e saques devidos aos entregadores no momento atual
                      </TableCaption>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Componente</TableHead>
                          <TableHead className="text-right">Valor atual</TableHead>
                          <TableHead>Interpretação</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        <TableRow>
                          <TableCell className="font-medium">Saldo disponível</TableCell>
                          <TableCell className="text-right tabular-nums">
                            {money(cash.driverAvailableBalance)}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            Já liberado para solicitação de saque.
                          </TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell className="font-medium">Saldo bloqueado</TableCell>
                          <TableCell className="text-right tabular-nums">
                            {money(cash.driverBlockedBalance)}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            Ainda dentro do prazo de liberação.
                          </TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell className="font-medium">Saques pendentes</TableCell>
                          <TableCell className="text-right tabular-nums">
                            {money(cash.pendingWithdrawalValue)}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            Solicitados e ainda não pagos.
                          </TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
