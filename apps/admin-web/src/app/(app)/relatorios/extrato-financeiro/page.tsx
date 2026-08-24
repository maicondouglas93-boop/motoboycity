'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type {
  FinancialCycleDeliveryItem,
  FinancialCycleIssue,
  InvoiceStatus,
  WalletTransactionStatus,
} from '@motoboycity/types';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Download,
  FileText,
  ReceiptText,
  WalletCards,
} from 'lucide-react';
import { ReportFilterCard } from '@/components/reports/report-filter-card';
import {
  ReportPageHeader,
  ReportQueryState,
  ReportSectionHeading,
} from '@/components/reports/report-layout';
import { ReportPagination } from '@/components/reports/report-pagination';
import { StatCard } from '@/components/stat-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
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

type CycleFilter =
  'ALL' | 'ISSUES' | 'UNBILLED' | 'OPEN_INVOICE' | 'PAID' | 'ONLINE' | 'REPASSE_ISSUE';

const ISSUE_LABELS: Record<FinancialCycleIssue, string> = {
  UNPRICED: 'Preço incompleto',
  MISSING_DRIVER: 'Sem entregador',
  MISSING_INVOICE: 'Sem fatura',
  CANCELLED_INVOICE: 'Fatura cancelada',
  PAID_WITHOUT_PAYMENT_DATE: 'Pago sem data',
  UNEXPECTED_INVOICE_FOR_ONLINE: 'Online com fatura inesperada',
  MISSING_REPASSE: 'Sem repasse',
  REPASSE_AMOUNT_MISMATCH: 'Repasse divergente',
  DUPLICATE_REPASSE: 'Repasse duplicado',
  CANCELLED_REPASSE: 'Repasse cancelado',
};

const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  PENDING: 'Em aberto',
  PAID: 'Paga',
  OVERDUE: 'Vencida',
  CANCELLED: 'Cancelada',
};

const WALLET_STATUS_LABELS: Record<WalletTransactionStatus, string> = {
  PENDING: 'Bloqueado',
  RELEASED: 'Liberado',
  CANCELLED: 'Cancelado',
};

const REPASSE_ISSUES = new Set<FinancialCycleIssue>([
  'MISSING_REPASSE',
  'REPASSE_AMOUNT_MISMATCH',
  'DUPLICATE_REPASSE',
  'CANCELLED_REPASSE',
]);

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
  const to = dateOnlyInSaoPaulo(new Date());
  const [year, month, day] = to.split('-').map(Number);
  const fromDate = new Date(Date.UTC(year!, month! - 1, day! - 29));
  return {
    from: `${fromDate.getUTCFullYear()}-${String(fromDate.getUTCMonth() + 1).padStart(2, '0')}-${String(fromDate.getUTCDate()).padStart(2, '0')}`,
    to,
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

function csvNumber(value: number | null): string {
  return value === null ? '' : String(value).replace('.', ',');
}

function activeRepasses(item: FinancialCycleDeliveryItem) {
  return item.repasses.filter((repasse) => repasse.status !== 'CANCELLED');
}

function repasseValue(item: FinancialCycleDeliveryItem): number {
  return (
    activeRepasses(item).reduce((total, repasse) => total + Math.round(repasse.amount * 100), 0) /
    100
  );
}

function matchesFilter(item: FinancialCycleDeliveryItem, filter: CycleFilter): boolean {
  if (filter === 'ISSUES') return item.issues.length > 0;
  if (filter === 'UNBILLED') return item.issues.includes('MISSING_INVOICE');
  if (filter === 'OPEN_INVOICE')
    return item.invoice?.status === 'PENDING' || item.invoice?.status === 'OVERDUE';
  if (filter === 'PAID') return item.invoice?.status === 'PAID';
  if (filter === 'ONLINE') return item.paymentMethod === 'ONLINE';
  if (filter === 'REPASSE_ISSUE') return item.issues.some((issue) => REPASSE_ISSUES.has(issue));
  return true;
}

export default function FinancialCycleReportPage() {
  const token = session.getToken();
  const money = useMoney();
  const [initialPeriod] = useState(defaultPeriod);
  const [from, setFrom] = useState(initialPeriod.from);
  const [to, setTo] = useState(initialPeriod.to);
  const [appliedPeriod, setAppliedPeriod] = useState(initialPeriod);
  const [periodError, setPeriodError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [cycleFilter, setCycleFilter] = useState<CycleFilter>('ALL');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const reportQuery = useQuery({
    queryKey: ['admin', 'financial', 'financial-cycle', appliedPeriod],
    queryFn: () => adminFinancialApi.financialCycle(token as string, appliedPeriod),
    enabled: Boolean(token),
  });

  const filteredItems = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase('pt-BR');
    return (reportQuery.data?.items ?? []).filter((item) => {
      if (!matchesFilter(item, cycleFilter)) return false;
      if (!normalizedSearch) return true;
      const searchable = [
        item.displayNumber,
        item.deliveryId,
        item.company.name,
        item.driver?.name ?? '',
        item.invoice?.number ?? '',
        item.serviceType.name,
      ]
        .join(' ')
        .toLocaleLowerCase('pt-BR');
      return searchable.includes(normalizedSearch);
    });
  }, [cycleFilter, reportQuery.data?.items, search]);

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const visibleItems = useMemo(
    () => filteredItems.slice((safePage - 1) * pageSize, safePage * pageSize),
    [filteredItems, pageSize, safePage],
  );

  if (!token) {
    return <p className="text-sm text-muted-foreground">Faça login como administrador.</p>;
  }

  function applyPeriod() {
    if (!from || !to) {
      setPeriodError('Informe as duas datas do extrato.');
      return;
    }
    if (from > to) {
      setPeriodError('A data inicial não pode ser posterior à data final.');
      return;
    }
    if (civilDayNumber(to) - civilDayNumber(from) > 92) {
      setPeriodError('O extrato financeiro aceita no máximo 93 dias por consulta.');
      return;
    }
    setPeriodError(null);
    setAppliedPeriod({ from, to });
    setPage(1);
  }

  function resetPeriod() {
    const next = defaultPeriod();
    setFrom(next.from);
    setTo(next.to);
    setAppliedPeriod(next);
    setPeriodError(null);
    setPage(1);
  }

  function exportCsv() {
    const report = reportQuery.data;
    if (!report) return;
    const rows: unknown[][] = filteredItems.map((item) => [
      'ENTREGA',
      `#${item.displayNumber}`,
      item.deliveryId,
      item.completedAt,
      item.company.name,
      item.driver?.name ?? '',
      item.serviceType.name,
      item.paymentMethod,
      csvNumber(item.totalValue),
      csvNumber(item.driverValue),
      csvNumber(item.platformValue),
      item.invoice?.number ?? '',
      item.invoice?.issueDate ?? '',
      item.invoice?.status ?? '',
      item.invoice?.paymentDate ?? '',
      csvNumber(repasseValue(item)),
      item.repasses.map((repasse) => WALLET_STATUS_LABELS[repasse.status]).join(' | '),
      item.issues.map((issue) => ISSUE_LABELS[issue]).join(' | '),
      '',
      '',
    ]);
    rows.push(
      ...report.adjustments.map((adjustment) => [
        'AJUSTE',
        adjustment.transactionId,
        '',
        adjustment.createdAt,
        '',
        adjustment.driver.name,
        '',
        '',
        csvNumber(adjustment.amount),
        '',
        '',
        '',
        '',
        adjustment.status,
        '',
        '',
        adjustment.direction,
        '',
        adjustment.reason ?? '',
        adjustment.createdBy?.name ?? 'Automático',
      ]),
    );
    downloadCsv(
      'extrato-financeiro-unificado.csv',
      toCsv(
        [
          'Tipo de registro',
          'Referência',
          'ID da entrega',
          'Data do evento',
          'Cliente',
          'Entregador',
          'Modalidade',
          'Forma de cobrança',
          'Valor total/ajuste',
          'Repasse previsto',
          'Receita da plataforma',
          'Fatura',
          'Emissão',
          'Status',
          'Recebimento',
          'Repasse registrado',
          'Estado do repasse/direção',
          'Pendências',
          'Motivo do ajuste',
          'Autor do ajuste',
        ],
        rows,
      ),
    );
  }

  const report = reportQuery.data;

  return (
    <div className="mx-auto w-full max-w-[1540px] space-y-7 pb-12">
      <ReportPageHeader
        icon={ReceiptText}
        title="Extrato financeiro unificado"
        description="Acompanhe cada pedido da competência até a fatura, o recebimento e o crédito de repasse, sem somar etapas que representam o mesmo dinheiro em datas diferentes."
        action={
          <Button type="button" variant="outline" onClick={exportCsv} disabled={!report}>
            <Download className="size-4" aria-hidden="true" />
            Baixar CSV auditável
          </Button>
        }
      />

      <ReportFilterCard
        idPrefix="financial-cycle"
        from={from}
        to={to}
        onFromChange={setFrom}
        onToChange={setTo}
        onApply={applyPeriod}
        onClear={resetPeriod}
        isFetching={reportQuery.isFetching}
        error={periodError}
        description="O período seleciona a data de conclusão dos pedidos e os ajustes criados nessa janela. Fatura, pagamento e repasse mostram o estado atual do pedido. Limite: 93 dias."
      />

      <ReportQueryState
        loading={reportQuery.isLoading}
        error={reportQuery.isError}
        loadingLabel="Relacionando competência, faturamento, recebimento e repasses..."
        onRetry={() => {
          void reportQuery.refetch();
        }}
      />

      {report && (
        <div className="space-y-9">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/10 bg-admin-soft/35 px-4 py-3 text-sm text-muted-foreground">
            <p>
              Competência de{' '}
              <strong className="text-admin-deep">{formatCivilDate(report.period.from)}</strong> a{' '}
              <strong className="text-admin-deep">{formatCivilDate(report.period.to)}</strong>. As
              etapas posteriores podem ter ocorrido fora dessa janela.
            </p>
            <Badge variant="outline">{report.summary.completedCount} pedidos concluídos</Badge>
          </div>

          <section className="space-y-4">
            <ReportSectionHeading
              title="Valores por etapa do ciclo"
              description="As quatro caixas não devem ser somadas: elas mostram o mesmo ciclo sob datas e responsabilidades diferentes."
            />
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard
                label="Reconhecido na competência"
                value={money(report.summary.competencyValue)}
                hint={`${report.summary.pricedCount} pedidos com preço completo`}
              />
              <StatCard
                label="Entregas já faturadas"
                value={money(report.summary.invoicedDeliveryValue)}
                hint={`${report.summary.invoicedCount} pedidos vinculados a fatura`}
              />
              <StatCard
                label="Entregas com recebimento"
                value={money(report.summary.receivedDeliveryValue)}
                hint={`${report.summary.receivedCount} pedidos em faturas pagas com data`}
              />
              <StatCard
                label="Repasses registrados"
                value={money(report.summary.repasseRegisteredValue)}
                hint={`${report.summary.repasseRegisteredCount} pedidos com crédito ativo`}
              />
            </div>

            <Card>
              <CardContent className="p-5">
                <div className="grid gap-3 lg:grid-cols-[1fr_auto_1fr_auto_1fr] lg:items-center">
                  <div className="rounded-xl border border-primary/15 bg-primary/5 p-4">
                    <p className="text-xs font-semibold tracking-wide text-primary uppercase">
                      1. Competência
                    </p>
                    <p className="mt-1 font-medium text-admin-deep">
                      Pedido concluído e preço reconhecido
                    </p>
                  </div>
                  <ArrowRight
                    className="mx-auto hidden size-5 text-muted-foreground lg:block"
                    aria-hidden="true"
                  />
                  <div className="rounded-xl border border-sky-200 bg-sky-500/5 p-4">
                    <p className="text-xs font-semibold tracking-wide text-sky-700 uppercase">
                      2. Faturamento
                    </p>
                    <p className="mt-1 font-medium text-admin-deep">
                      Pedido agrupado em fatura, quando faturado
                    </p>
                  </div>
                  <ArrowRight
                    className="mx-auto hidden size-5 text-muted-foreground lg:block"
                    aria-hidden="true"
                  />
                  <div className="rounded-xl border border-emerald-200 bg-emerald-500/5 p-4">
                    <p className="text-xs font-semibold tracking-wide text-emerald-700 uppercase">
                      3. Recebimento
                    </p>
                    <p className="mt-1 font-medium text-admin-deep">
                      Fatura paga e data confirmada
                    </p>
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-500/5 p-4">
                  <WalletCards className="size-5 shrink-0 text-amber-700" aria-hidden="true" />
                  <p className="text-sm text-muted-foreground">
                    <strong className="text-admin-deep">Repasse ao entregador:</strong> nasce junto
                    da conclusão, em paralelo ao faturamento da empresa, e muda de bloqueado para
                    liberado conforme a carteira.
                  </p>
                </div>
              </CardContent>
            </Card>
          </section>

          <section className="space-y-4">
            <ReportSectionHeading
              title="Pontos de controle"
              description="Pendências são contadas por pedido da competência, não por fatura. Assim uma fatura com dez pedidos continua rastreável até cada origem."
            />
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
              <StatCard
                label="Sem fatura"
                value={money(report.summary.unbilledValue)}
                hint={`${report.summary.unbilledCount} pedidos faturáveis`}
              />
              <StatCard
                label="Faturas em aberto"
                value={money(report.summary.openInvoiceValue)}
                hint={`${report.summary.openInvoiceCount} pedidos`}
              />
              <StatCard
                label="Faturas vencidas"
                value={money(report.summary.overdueValue)}
                hint={`${report.summary.overdueCount} pedidos`}
              />
              <StatCard
                label="Pedidos online"
                value={money(report.summary.onlineValue)}
                hint={`${report.summary.onlineCount} sem etapa de fatura`}
              />
              <StatCard
                label="Pedidos para revisar"
                value={report.summary.itemWithIssueCount}
                hint="Preço, fatura, entregador ou repasse"
              />
            </div>
          </section>

          <section className="space-y-4">
            <ReportSectionHeading
              title="Ciclo por pedido"
              description="Use os filtros para transformar divergências em fila de trabalho. O CSV respeita a busca e o filtro de ciclo."
              action={
                <Link
                  href="/financeiro?aba=faturas"
                  className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
                >
                  Abrir financeiro
                  <ArrowRight className="size-4" aria-hidden="true" />
                </Link>
              }
            />
            <Card>
              <CardContent className="flex flex-wrap items-end gap-3 p-4">
                <div className="min-w-64 flex-1 space-y-1.5">
                  <label htmlFor="cycle-search" className="text-sm font-medium">
                    Pedido, cliente, entregador ou fatura
                  </label>
                  <Input
                    id="cycle-search"
                    placeholder="Buscar no ciclo..."
                    value={search}
                    onChange={(event) => {
                      setSearch(event.target.value);
                      setPage(1);
                    }}
                  />
                </div>
                <div className="min-w-60 space-y-1.5">
                  <label htmlFor="cycle-filter" className="text-sm font-medium">
                    Situação
                  </label>
                  <select
                    id="cycle-filter"
                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-admin-deep"
                    value={cycleFilter}
                    onChange={(event) => {
                      setCycleFilter(event.target.value as CycleFilter);
                      setPage(1);
                    }}
                  >
                    <option value="ALL">Todos os pedidos</option>
                    <option value="ISSUES">Com qualquer pendência</option>
                    <option value="UNBILLED">Sem fatura</option>
                    <option value="OPEN_INVOICE">Fatura em aberto ou vencida</option>
                    <option value="PAID">Fatura paga</option>
                    <option value="ONLINE">Pagamento online</option>
                    <option value="REPASSE_ISSUE">Problema no repasse</option>
                  </select>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="overflow-x-auto p-0">
                {visibleItems.length === 0 ? (
                  <p className="p-10 text-center text-sm text-muted-foreground">
                    Nenhum pedido corresponde aos filtros selecionados.
                  </p>
                ) : (
                  <Table>
                    <TableCaption className="sr-only">
                      Ciclo financeiro detalhado por pedido
                    </TableCaption>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="min-w-36">Pedido</TableHead>
                        <TableHead className="min-w-48">Cliente / entregador</TableHead>
                        <TableHead className="text-right">Competência</TableHead>
                        <TableHead className="min-w-44">Faturamento</TableHead>
                        <TableHead className="min-w-40">Recebimento</TableHead>
                        <TableHead className="min-w-40">Repasse</TableHead>
                        <TableHead className="min-w-48">Diagnóstico</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {visibleItems.map((item) => {
                        const active = activeRepasses(item);
                        return (
                          <TableRow
                            key={item.deliveryId}
                            className={item.issues.length > 0 ? 'bg-amber-500/[0.035]' : ''}
                          >
                            <TableCell>
                              <Link
                                href={`/pedidos/${item.deliveryId}`}
                                className="font-semibold text-primary underline-offset-4 hover:underline"
                              >
                                #{item.displayNumber}
                              </Link>
                              <p className="mt-1 text-xs text-muted-foreground">
                                {formatDateTime(item.completedAt)}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {item.serviceType.name}
                              </p>
                            </TableCell>
                            <TableCell>
                              <Link
                                href={`/clientes/${item.company.id}`}
                                className="font-medium text-admin-deep hover:text-primary hover:underline"
                              >
                                {item.company.name}
                              </Link>
                              {item.driver ? (
                                <Link
                                  href={`/entregadores/${item.driver.id}`}
                                  className="mt-1 block text-xs text-muted-foreground hover:text-primary hover:underline"
                                >
                                  {item.driver.name}
                                </Link>
                              ) : (
                                <p className="mt-1 text-xs text-destructive">Sem entregador</p>
                              )}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              <p className="font-semibold">
                                {item.totalValue === null ? '—' : money(item.totalValue)}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                repasse {item.driverValue === null ? '—' : money(item.driverValue)}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                plataforma{' '}
                                {item.platformValue === null ? '—' : money(item.platformValue)}
                              </p>
                            </TableCell>
                            <TableCell>
                              {item.paymentMethod === 'ONLINE' && !item.invoice ? (
                                <Badge variant="outline">Não se aplica · online</Badge>
                              ) : item.invoice ? (
                                <>
                                  <Link
                                    href={`/faturas/${item.invoice.id}`}
                                    className="font-medium text-primary hover:underline"
                                  >
                                    {item.invoice.number}
                                  </Link>
                                  <p className="mt-1 text-xs text-muted-foreground">
                                    emitida {formatCivilDate(item.invoice.issueDate)}
                                  </p>
                                  <Badge
                                    className="mt-1"
                                    variant={
                                      item.invoice.status === 'OVERDUE' ||
                                      item.invoice.status === 'CANCELLED'
                                        ? 'destructive'
                                        : 'outline'
                                    }
                                  >
                                    {INVOICE_STATUS_LABELS[item.invoice.status]}
                                  </Badge>
                                </>
                              ) : (
                                <span className="text-sm text-destructive">Não faturado</span>
                              )}
                            </TableCell>
                            <TableCell>
                              {item.invoice?.status === 'PAID' && item.invoice.paymentDate ? (
                                <div className="flex items-center gap-2 text-sm text-emerald-700">
                                  <CheckCircle2 className="size-4" aria-hidden="true" />
                                  {formatCivilDate(item.invoice.paymentDate)}
                                </div>
                              ) : item.paymentMethod === 'ONLINE' ? (
                                <p className="text-xs leading-5 text-muted-foreground">
                                  Sem data de recebimento persistida
                                </p>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </TableCell>
                            <TableCell>
                              {active.length > 0 ? (
                                <>
                                  <p className="font-medium tabular-nums">
                                    {money(repasseValue(item))}
                                  </p>
                                  <p className="mt-1 text-xs text-muted-foreground">
                                    {active
                                      .map((repasse) => WALLET_STATUS_LABELS[repasse.status])
                                      .join(' · ')}
                                  </p>
                                </>
                              ) : (
                                <span className="text-sm text-destructive">Não registrado</span>
                              )}
                            </TableCell>
                            <TableCell>
                              {item.issues.length === 0 ? (
                                <Badge variant="outline" className="gap-1">
                                  <CheckCircle2 aria-hidden="true" />
                                  Ciclo consistente
                                </Badge>
                              ) : (
                                <div className="flex flex-wrap gap-1.5">
                                  {item.issues.map((issue) => (
                                    <Badge key={issue} variant="destructive" className="gap-1">
                                      <AlertTriangle aria-hidden="true" />
                                      {ISSUE_LABELS[issue]}
                                    </Badge>
                                  ))}
                                </div>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
            <ReportPagination
              page={safePage}
              pageSize={pageSize}
              total={filteredItems.length}
              isFetching={reportQuery.isFetching}
              itemLabel="pedidos"
              onPageChange={setPage}
              onPageSizeChange={(size) => {
                setPageSize(size);
                setPage(1);
              }}
            />
          </section>

          <section className="space-y-4">
            <ReportSectionHeading
              title="Ajustes lançados no período"
              description="Ajustes não pertencem automaticamente a um pedido. Por isso aparecem separados, com motivo, autor e efeito na carteira."
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <StatCard
                label="Créditos de ajuste ativos"
                value={money(report.summary.adjustmentCreditValue)}
                hint="Aumentam a obrigação com entregadores"
              />
              <StatCard
                label="Débitos de ajuste ativos"
                value={money(report.summary.adjustmentDebitValue)}
                hint="Reduzem a obrigação com entregadores"
              />
            </div>
            <Card>
              <CardContent className="overflow-x-auto p-0">
                {report.adjustments.length === 0 ? (
                  <p className="p-8 text-center text-sm text-muted-foreground">
                    Nenhum ajuste foi criado no período.
                  </p>
                ) : (
                  <Table>
                    <TableCaption className="sr-only">
                      Ajustes manuais e estornos do período
                    </TableCaption>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Data</TableHead>
                        <TableHead>Entregador</TableHead>
                        <TableHead>Direção</TableHead>
                        <TableHead className="text-right">Valor</TableHead>
                        <TableHead>Motivo</TableHead>
                        <TableHead>Autor</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {report.adjustments.map((adjustment) => (
                        <TableRow
                          key={adjustment.transactionId}
                          className={adjustment.status === 'CANCELLED' ? 'opacity-60' : ''}
                        >
                          <TableCell className="whitespace-nowrap">
                            {formatDateTime(adjustment.createdAt)}
                          </TableCell>
                          <TableCell>
                            <Link
                              href={`/entregadores/${adjustment.driver.id}`}
                              className="font-medium text-primary hover:underline"
                            >
                              {adjustment.driver.name}
                            </Link>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">
                              {adjustment.direction === 'CREDIT' ? 'Crédito' : 'Débito'} ·{' '}
                              {WALLET_STATUS_LABELS[adjustment.status]}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-semibold tabular-nums">
                            {money(adjustment.amount)}
                          </TableCell>
                          <TableCell className="max-w-md text-sm text-muted-foreground">
                            {adjustment.reason ?? 'Sem motivo registrado'}
                          </TableCell>
                          <TableCell className="text-sm">
                            {adjustment.createdBy?.name ?? 'Automático'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </section>

          <div className="flex items-start gap-3 rounded-xl border border-primary/15 bg-primary/[0.035] p-4 text-sm text-muted-foreground">
            <FileText className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
            <p className="leading-6">
              Pedidos online não entram em fatura e hoje não possuem uma data de recebimento
              persistida. O extrato os mantém separados para não fabricar uma confirmação de caixa
              que o banco de dados não registra.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
