'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { InvoiceStatus, WithdrawalRequestStatus } from '@motoboycity/types';
import { AlertTriangle, ArrowRight, CalendarClock, Download, Info } from 'lucide-react';
import { ReportFilterCard } from '@/components/reports/report-filter-card';
import {
  ReportPageHeader,
  ReportQueryState,
  ReportSectionHeading,
} from '@/components/reports/report-layout';
import { StatCard } from '@/components/stat-card';
import { Badge } from '@/components/ui/badge';
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
import { adminFinancialApi } from '@/lib/api-client';
import { downloadCsv, toCsv } from '@/lib/csv';
import { useMoney } from '@/lib/money';
import { session } from '@/lib/session';

const INVOICE_LABELS: Record<InvoiceStatus, string> = {
  PENDING: 'Em aberto',
  PAID: 'Paga',
  OVERDUE: 'Vencida',
  CANCELLED: 'Cancelada',
};

const WITHDRAWAL_LABELS: Record<WithdrawalRequestStatus, string> = {
  PENDING: 'Aguardando aprovação',
  APPROVED: 'Aprovado, não pago',
  PAID: 'Pago',
  REJECTED: 'Rejeitado',
};

function dateOnlyInSaoPaulo(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function defaultPeriod(): { from: string; to: string } {
  const from = dateOnlyInSaoPaulo(new Date());
  const [year, month, day] = from.split('-').map(Number);
  const toDate = new Date(Date.UTC(year!, month! - 1, day! + 29));
  return {
    from,
    to: `${toDate.getUTCFullYear()}-${String(toDate.getUTCMonth() + 1).padStart(2, '0')}-${String(toDate.getUTCDate()).padStart(2, '0')}`,
  };
}

function civilDayNumber(date: string): number {
  const [year, month, day] = date.split('-').map(Number);
  return Math.floor(Date.UTC(year!, month! - 1, day!) / 86_400_000);
}

function formatCivilDate(date: string): string {
  return new Intl.DateTimeFormat('pt-BR').format(new Date(`${date}T12:00:00Z`));
}

function formatDateTime(date: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(date));
}

function csvNumber(value: number): string {
  return String(value).replace('.', ',');
}

export default function CashFlowForecastPage() {
  const token = session.getToken();
  const money = useMoney();
  const [initialPeriod] = useState(defaultPeriod);
  const [from, setFrom] = useState(initialPeriod.from);
  const [to, setTo] = useState(initialPeriod.to);
  const [appliedPeriod, setAppliedPeriod] = useState(initialPeriod);
  const [periodError, setPeriodError] = useState<string | null>(null);

  const reportQuery = useQuery({
    queryKey: ['admin', 'financial', 'cash-flow-forecast', appliedPeriod],
    queryFn: () => adminFinancialApi.cashFlowForecast(token as string, appliedPeriod),
    enabled: Boolean(token),
  });

  if (!token) {
    return <p className="text-sm text-muted-foreground">Faça login como administrador.</p>;
  }

  function applyPeriod() {
    if (!from || !to) {
      setPeriodError('Informe as duas datas da previsão.');
      return;
    }
    if (from > to) {
      setPeriodError('A data inicial não pode ser posterior à data final.');
      return;
    }
    if (civilDayNumber(to) - civilDayNumber(from) > 92) {
      setPeriodError('A previsão de caixa aceita no máximo 93 dias por consulta.');
      return;
    }
    setPeriodError(null);
    setAppliedPeriod({ from, to });
  }

  function resetPeriod() {
    const next = defaultPeriod();
    setFrom(next.from);
    setTo(next.to);
    setAppliedPeriod(next);
    setPeriodError(null);
  }

  function exportCsv() {
    const report = reportQuery.data;
    if (!report) return;
    const rows: unknown[][] = [
      ...report.projectedInvoices.map((item) => [
        'FATURA_PREVISTA',
        item.dueDate,
        item.number,
        item.company.name,
        INVOICE_LABELS[item.status],
        csvNumber(item.totalValue),
        '',
      ]),
      ...report.overdueBeforePeriodInvoices.map((item) => [
        'FATURA_VENCIDA_ANTERIOR',
        item.dueDate,
        item.number,
        item.company.name,
        INVOICE_LABELS[item.status],
        csvNumber(item.totalValue),
        '',
      ]),
      ...report.realizedReceipts.map((item) => [
        'RECEBIMENTO_REALIZADO',
        item.paymentDate,
        item.number,
        item.company.name,
        INVOICE_LABELS[item.status],
        csvNumber(item.totalValue),
        '',
      ]),
      ...report.repasses.map((item) => [
        'LIBERACAO_REPASSE',
        item.releaseDate ?? '',
        item.delivery ? `#${item.delivery.displayNumber}` : item.transactionId,
        item.driver.name,
        item.timing,
        csvNumber(item.amount),
        '',
      ]),
      ...report.openWithdrawals.map((item) => [
        'SAQUE_ABERTO_SEM_DATA',
        '',
        item.withdrawalId,
        item.driver.name,
        WITHDRAWAL_LABELS[item.status],
        csvNumber(item.netAmount),
        item.createdAt,
      ]),
      ...report.realizedWithdrawals.map((item) => [
        'SAQUE_PAGO',
        item.paidAt,
        item.withdrawalId,
        item.driver.name,
        WITHDRAWAL_LABELS[item.status],
        csvNumber(item.netAmount),
        item.createdAt,
      ]),
    ];
    downloadCsv(
      'previsao-e-compromissos-de-caixa.csv',
      toCsv(
        ['Tipo', 'Data financeira', 'Referência', 'Parte', 'Situação', 'Valor', 'Criado em'],
        rows,
      ),
    );
  }

  const report = reportQuery.data;
  const actionableRepasses = report?.repasses.filter((item) => item.timing !== 'IN_PERIOD') ?? [];

  return (
    <div className="mx-auto w-full max-w-[1540px] space-y-7 pb-12">
      <ReportPageHeader
        icon={CalendarClock}
        title="Previsão e compromissos de caixa"
        description="Organize vencimentos, obrigações com entregadores e movimentos realizados sem confundir saldo liberado na carteira com dinheiro que já saiu do banco."
        action={
          <Button type="button" variant="outline" onClick={exportCsv} disabled={!report}>
            <Download className="size-4" aria-hidden="true" />
            Baixar CSV
          </Button>
        }
      />

      <ReportFilterCard
        idPrefix="cash-flow"
        from={from}
        to={to}
        onFromChange={setFrom}
        onToChange={setTo}
        onApply={applyPeriod}
        onClear={resetPeriod}
        isFetching={reportQuery.isFetching}
        error={periodError}
        description="O padrão mostra hoje e os próximos 29 dias. A consulta aceita até 93 dias e também pode incluir o passado para conferir o realizado."
      />

      <ReportQueryState
        loading={reportQuery.isLoading}
        error={reportQuery.isError}
        loadingLabel="Montando agenda de recebimentos e compromissos..."
        onRetry={() => void reportQuery.refetch()}
      />

      {report && (
        <div className="space-y-9">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/10 bg-admin-soft/35 px-4 py-3 text-sm text-muted-foreground">
            <p>
              Agenda de{' '}
              <strong className="text-admin-deep">{formatCivilDate(report.period.from)}</strong> a{' '}
              <strong className="text-admin-deep">{formatCivilDate(report.period.to)}</strong>.
            </p>
            <Badge variant="outline">Posição em {formatCivilDate(report.asOf)}</Badge>
          </div>

          <section className="space-y-4">
            <ReportSectionHeading
              title="Entradas e compromissos conhecidos"
              description="Vencimento não garante recebimento, e liberação de repasse ainda não é saque pago. Por isso cada valor permanece em sua própria categoria."
            />
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard
                label="Faturas com vencimento no período"
                value={money(report.summary.projectedInvoiceValue)}
                hint={`${report.summary.projectedInvoiceCount} faturas abertas`}
              />
              <StatCard
                label="Repasses a liberar no período"
                value={money(report.summary.scheduledRepasseValue)}
                hint={`${report.summary.scheduledRepasseCount} créditos ficarão sacáveis`}
              />
              <StatCard
                label="Saques abertos sem data"
                value={money(report.summary.openWithdrawalNetValue)}
                hint={`${report.summary.openWithdrawalCount} solicitacoes; ${report.summary.approvedWithdrawalCount} aprovadas`}
              />
              <StatCard
                label="Vencido antes do período"
                value={money(report.summary.overdueBeforePeriodValue)}
                hint={`${report.summary.overdueBeforePeriodCount} faturas carregadas do passado`}
              />
            </div>
          </section>

          <section className="space-y-4">
            <ReportSectionHeading
              title="Pontos que exigem ação"
              description="Itens sem uma data utilizável não entram artificialmente em nenhum dia da agenda."
              action={
                <Link
                  href="/financeiro"
                  className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
                >
                  Abrir financeiro <ArrowRight className="size-4" aria-hidden="true" />
                </Link>
              }
            />
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard
                label="Pedidos ainda sem fatura"
                value={money(report.summary.unbilledValue)}
                hint={`${report.summary.unbilledCount} pedidos sem vencimento`}
              />
              <StatCard
                label="Repasses com liberação atrasada"
                value={money(report.summary.overdueRepasseValue)}
                hint={`${report.summary.overdueRepasseCount} lançamentos bloqueados`}
              />
              <StatCard
                label="Repasses sem data"
                value={money(report.summary.unscheduledRepasseValue)}
                hint={`${report.summary.unscheduledRepasseCount} lançamentos legados`}
              />
              <StatCard
                label="Saques aprovados para pagar"
                value={money(report.summary.approvedWithdrawalNetValue)}
                hint={`${report.summary.approvedWithdrawalCount} saídas prioritárias`}
              />
            </div>
          </section>

          <section className="space-y-4">
            <ReportSectionHeading
              title="Agenda diária"
              description="Previsão e realizado aparecem em colunas diferentes. Dias sem movimento continuam visíveis para facilitar o planejamento."
            />
            <Card>
              <CardContent className="max-h-[620px] overflow-auto p-0">
                <Table>
                  <TableCaption className="sr-only">Agenda diária de caixa</TableCaption>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data</TableHead>
                      <TableHead className="text-right">Faturas a vencer</TableHead>
                      <TableHead className="text-right">Repasses a liberar</TableHead>
                      <TableHead className="text-right">Recebido</TableHead>
                      <TableHead className="text-right">Saques pagos</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.days.map((day) => (
                      <TableRow key={day.day}>
                        <TableCell className="whitespace-nowrap font-medium">
                          {formatCivilDate(day.day)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          <strong>{money(day.projectedInvoiceInflowValue)}</strong>{' '}
                          <span className="text-xs text-muted-foreground">
                            ({day.projectedInvoiceInflowCount})
                          </span>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          <strong>{money(day.scheduledRepasseReleaseValue)}</strong>{' '}
                          <span className="text-xs text-muted-foreground">
                            ({day.scheduledRepasseReleaseCount})
                          </span>
                        </TableCell>
                        <TableCell className="text-right text-emerald-700 tabular-nums">
                          <strong>{money(day.realizedReceiptValue)}</strong>{' '}
                          <span className="text-xs">({day.realizedReceiptCount})</span>
                        </TableCell>
                        <TableCell className="text-right text-red-700 tabular-nums">
                          <strong>{money(day.realizedWithdrawalValue)}</strong>{' '}
                          <span className="text-xs">({day.realizedWithdrawalCount})</span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </section>

          <section className="space-y-4">
            <ReportSectionHeading
              title="Faturas previstas"
              description="Faturas atuais em aberto ou vencidas cujo vencimento cai dentro do período."
            />
            <Card>
              <CardContent className="max-h-[520px] overflow-auto p-0">
                {report.projectedInvoices.length === 0 ? (
                  <p className="p-10 text-center text-sm text-muted-foreground">
                    Nenhuma fatura aberta vence no período.
                  </p>
                ) : (
                  <Table>
                    <TableCaption className="sr-only">Faturas com vencimento previsto</TableCaption>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Vencimento</TableHead>
                        <TableHead>Fatura</TableHead>
                        <TableHead>Cliente</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Valor</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {report.projectedInvoices.map((invoice) => (
                        <TableRow key={invoice.invoiceId}>
                          <TableCell>{formatCivilDate(invoice.dueDate)}</TableCell>
                          <TableCell className="font-medium">{invoice.number}</TableCell>
                          <TableCell>
                            <Link
                              href={`/clientes/${invoice.company.id}`}
                              className="text-primary hover:underline"
                            >
                              {invoice.company.name}
                            </Link>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{INVOICE_LABELS[invoice.status]}</Badge>
                          </TableCell>
                          <TableCell className="text-right font-semibold tabular-nums">
                            {money(invoice.totalValue)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </section>

          <div className="grid gap-6 xl:grid-cols-2">
            <section className="space-y-4">
              <ReportSectionHeading
                title="Saques aguardando pagamento"
                description="Sem data prometida persistida; aparecem como fila, não como saída em um dia inventado."
              />
              <Card>
                <CardContent className="max-h-[480px] overflow-auto p-0">
                  {report.openWithdrawals.length === 0 ? (
                    <p className="p-10 text-center text-sm text-muted-foreground">
                      Nenhum saque aberto.
                    </p>
                  ) : (
                    <Table>
                      <TableCaption className="sr-only">Saques abertos</TableCaption>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Entregador</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Líquido</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {report.openWithdrawals.map((withdrawal) => (
                          <TableRow key={withdrawal.withdrawalId}>
                            <TableCell>
                              <Link
                                href={`/financeiro/saques/${withdrawal.withdrawalId}`}
                                className="font-medium text-primary hover:underline"
                              >
                                {withdrawal.driver.name}
                              </Link>
                              <p className="text-xs text-muted-foreground">
                                {formatDateTime(withdrawal.createdAt)}
                              </p>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline">
                                {WITHDRAWAL_LABELS[withdrawal.status]}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right font-semibold">
                              {money(withdrawal.netAmount)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </section>

            <section className="space-y-4">
              <ReportSectionHeading
                title="Repasses para revisar"
                description="Liberacoes atrasadas ou sem data podem indicar job pendente ou legado incompleto."
              />
              <Card>
                <CardContent className="max-h-[480px] overflow-auto p-0">
                  {actionableRepasses.length === 0 ? (
                    <p className="p-10 text-center text-sm text-muted-foreground">
                      Nenhum repasse atrasado ou sem data.
                    </p>
                  ) : (
                    <Table>
                      <TableCaption className="sr-only">Repasses que exigem revisão</TableCaption>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Entregador</TableHead>
                          <TableHead>Referência</TableHead>
                          <TableHead>Situação</TableHead>
                          <TableHead className="text-right">Valor</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {actionableRepasses.map((repasse) => (
                          <TableRow key={repasse.transactionId}>
                            <TableCell>
                              <Link
                                href={`/entregadores/${repasse.driver.id}`}
                                className="font-medium text-primary hover:underline"
                              >
                                {repasse.driver.name}
                              </Link>
                            </TableCell>
                            <TableCell>
                              {repasse.delivery
                                ? `Pedido #${repasse.delivery.displayNumber}`
                                : repasse.transactionId.slice(0, 8)}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline">
                                {repasse.timing === 'UNSCHEDULED'
                                  ? 'Sem data'
                                  : `Atrasado desde ${formatCivilDate(repasse.releaseDate!)}`}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right font-semibold">
                              {money(repasse.amount)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </section>
          </div>

          <section className="space-y-4">
            <ReportSectionHeading
              title="Movimentos realizados no período"
              description="Recebimentos usam a data de pagamento; saídas usam o momento em que o saque foi marcado como pago."
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <StatCard
                label="Recebimentos confirmados"
                value={money(report.summary.realizedReceiptValue)}
                hint={`${report.summary.realizedReceiptCount} faturas pagas`}
              />
              <StatCard
                label="Saques efetivamente pagos"
                value={money(report.summary.realizedWithdrawalValue)}
                hint={`${report.summary.realizedWithdrawalCount} pagamentos registrados`}
              />
            </div>
          </section>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-500/5 p-4 text-sm text-muted-foreground">
              <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-700" aria-hidden="true" />
              <p className="leading-6">
                A previsão não é garantia de recebimento. Faturas vencidas continuam abertas até o
                pagamento ser confirmado.
              </p>
            </div>
            <div className="flex items-start gap-3 rounded-xl border border-primary/15 bg-primary/[0.035] p-4 text-sm text-muted-foreground">
              <Info className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
              <p className="leading-6">
                Não mostramos saldo futuro porque faltam saldo bancário inicial, despesas
                operacionais e data prometida para saques. Pedidos online também não possuem data de
                recebimento persistida.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
