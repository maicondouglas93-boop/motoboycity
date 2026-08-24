'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type {
  FinancialStatementAdjustmentType,
  FinancialStatementTotals,
  PaymentMethod,
  WalletTransactionStatus,
} from '@motoboycity/types';
import {
  AlertTriangle,
  ArrowDownUp,
  ArrowRight,
  ChartNoAxesCombined,
  CheckCircle2,
  Download,
  Info,
} from 'lucide-react';
import { ReportFilterCard } from '@/components/reports/report-filter-card';
import {
  ReportPageHeader,
  ReportPeriodSummary,
  ReportQueryState,
  ReportSectionHeading,
} from '@/components/reports/report-layout';
import { ReportPagination } from '@/components/reports/report-pagination';
import { StatCard } from '@/components/stat-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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

type CompanySortKey =
  | 'name'
  | 'completedCount'
  | 'totalValue'
  | 'driverValue'
  | 'platformValue'
  | 'contributionMarginPercent'
  | 'averageTicket';

const COMPANY_COLUMNS: Array<{ key: CompanySortKey; label: string }> = [
  { key: 'name', label: 'Cliente' },
  { key: 'completedCount', label: 'Entregas' },
  { key: 'totalValue', label: 'Cobrado' },
  { key: 'driverValue', label: 'Repasse' },
  { key: 'platformValue', label: 'Contribuição' },
  { key: 'contributionMarginPercent', label: 'Margem' },
  { key: 'averageTicket', label: 'Ticket médio' },
];

const ADJUSTMENT_LABELS: Record<FinancialStatementAdjustmentType, string> = {
  CREDIT_ADJUSTMENT: 'Ajuste de crédito',
  DEBIT_ADJUSTMENT: 'Ajuste de débito',
  CREDIT_REFUND: 'Estorno creditado',
};

const TRANSACTION_STATUS_LABELS: Record<WalletTransactionStatus, string> = {
  PENDING: 'Bloqueado',
  RELEASED: 'Liberado',
  CANCELLED: 'Cancelado',
};

const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  BILLED: 'Faturado',
  ONLINE: 'Online',
};

function formatCivilDate(date: string): string {
  return new Intl.DateTimeFormat('pt-BR').format(new Date(`${date}T12:00:00Z`));
}

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
  const from = `${fromDate.getUTCFullYear()}-${String(fromDate.getUTCMonth() + 1).padStart(2, '0')}-${String(fromDate.getUTCDate()).padStart(2, '0')}`;
  return { from, to };
}

function civilDayNumber(date: string): number {
  const [year, month, day] = date.split('-').map(Number);
  return Math.floor(Date.UTC(year!, month! - 1, day!) / 86_400_000);
}

function csvNumber(value: number): string {
  return String(value).replace('.', ',');
}

function formatPercent(value: number): string {
  return `${value.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 2 })}%`;
}

function formatChange(value: number | null): string {
  if (value === null) return 'Sem base comparável';
  const signal = value > 0 ? '+' : '';
  return `${signal}${value.toLocaleString('pt-BR')}%`;
}

function totalsCsvRow(
  section: string,
  item: string,
  totals: FinancialStatementTotals,
  share: number | '',
  period: string,
): unknown[] {
  return [
    section,
    item,
    totals.completedCount,
    totals.pricedCount,
    totals.unpricedCount,
    csvNumber(totals.totalValue),
    csvNumber(totals.driverValue),
    csvNumber(totals.platformValue),
    csvNumber(totals.averageTicket),
    csvNumber(totals.contributionMarginPercent),
    share === '' ? '' : csvNumber(share),
    '',
    '',
    period,
  ];
}

export default function OperatingResultReportPage() {
  const token = session.getToken();
  const money = useMoney();
  const [initialPeriod] = useState(defaultPeriod);
  const [from, setFrom] = useState(initialPeriod.from);
  const [to, setTo] = useState(initialPeriod.to);
  const [periodError, setPeriodError] = useState<string | null>(null);
  const [appliedPeriod, setAppliedPeriod] = useState(initialPeriod);
  const [companySearch, setCompanySearch] = useState('');
  const [companySortKey, setCompanySortKey] = useState<CompanySortKey>('platformValue');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const reportQuery = useQuery({
    queryKey: ['admin', 'financial', 'financial-statement', appliedPeriod],
    queryFn: () => adminFinancialApi.financialStatement(token as string, appliedPeriod),
    enabled: Boolean(token),
  });

  const filteredCompanies = useMemo(() => {
    const normalizedSearch = companySearch.trim().toLocaleLowerCase('pt-BR');
    const companies = (reportQuery.data?.companies ?? []).filter((company) =>
      normalizedSearch ? company.name.toLocaleLowerCase('pt-BR').includes(normalizedSearch) : true,
    );
    return [...companies].sort((left, right) => {
      const a = left[companySortKey];
      const b = right[companySortKey];
      const comparison =
        typeof a === 'string' ? a.localeCompare(String(b), 'pt-BR') : Number(a) - Number(b);
      return (
        (sortDirection === 'asc' ? comparison : -comparison) ||
        left.name.localeCompare(right.name, 'pt-BR')
      );
    });
  }, [companySearch, companySortKey, reportQuery.data?.companies, sortDirection]);

  const totalPages = Math.max(1, Math.ceil(filteredCompanies.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const visibleCompanies = useMemo(
    () => filteredCompanies.slice((safePage - 1) * pageSize, safePage * pageSize),
    [filteredCompanies, pageSize, safePage],
  );

  if (!token) {
    return <p className="text-sm text-muted-foreground">Faça login como administrador.</p>;
  }

  function applyPeriod() {
    if (!from || !to) {
      setPeriodError('Informe as duas datas do demonstrativo.');
      return;
    }
    if (from > to) {
      setPeriodError('A data inicial não pode ser posterior à data final.');
      return;
    }
    if (civilDayNumber(to) - civilDayNumber(from) > 365) {
      setPeriodError('O demonstrativo aceita no máximo 366 dias por consulta.');
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

  function changeCompanySort(nextKey: CompanySortKey) {
    if (companySortKey === nextKey) {
      setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'));
    } else {
      setCompanySortKey(nextKey);
      setSortDirection(nextKey === 'name' ? 'asc' : 'desc');
    }
    setPage(1);
  }

  function exportCsv() {
    const report = reportQuery.data;
    if (!report) return;
    const period = `${report.period.from} a ${report.period.to}`;
    const rows: unknown[][] = [
      totalsCsvRow('Resumo', 'Resultado do período', report.totals, 100, period),
      ...report.companies.map((item) =>
        totalsCsvRow('Cliente', item.name, item, item.platformRevenueSharePercent, period),
      ),
      ...report.serviceTypes.map((item) =>
        totalsCsvRow('Modalidade', item.name, item, item.platformRevenueSharePercent, period),
      ),
      ...report.paymentMethods.map((item) =>
        totalsCsvRow('Forma de cobrança', PAYMENT_LABELS[item.paymentMethod], item, '', period),
      ),
      ...report.days.map((item) => totalsCsvRow('Dia', item.day, item, '', period)),
      ...report.walletAdjustments.items.map((item) => [
        'Ajuste de carteira',
        `${ADJUSTMENT_LABELS[item.type]} · ${TRANSACTION_STATUS_LABELS[item.status]}`,
        item.count,
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        item.direction === 'CREDIT' ? csvNumber(item.value) : '',
        item.direction === 'DEBIT' ? csvNumber(item.value) : '',
        period,
      ]),
    ];
    downloadCsv(
      'demonstrativo-resultado-operacao.csv',
      toCsv(
        [
          'Seção',
          'Item',
          'Entregas/lançamentos',
          'Entregas com preço',
          'Entregas sem preço completo',
          'Valor cobrado',
          'Repasse',
          'Receita da plataforma',
          'Ticket médio',
          'Margem de contribuição (%)',
          'Participação na receita (%)',
          'Créditos de ajuste',
          'Débitos de ajuste',
          'Período',
        ],
        rows,
      ),
    );
  }

  const report = reportQuery.data;
  const reconciled = report?.totals.reconciliationDifference === 0;
  const maxDailyPlatformValue = Math.max(
    0,
    ...(report?.days.map((day) => day.platformValue) ?? []),
  );

  return (
    <div className="mx-auto w-full max-w-[1480px] space-y-7 pb-12">
      <ReportPageHeader
        icon={ChartNoAxesCombined}
        title="Resultado por competência"
        description="Analise valor cobrado, repasse direto e margem de contribuição pelas entregas concluídas, com detalhamento por cliente, modalidade, cobrança e dia."
        action={
          <Button type="button" variant="outline" onClick={exportCsv} disabled={!report}>
            <Download className="size-4" aria-hidden="true" />
            Baixar CSV completo
          </Button>
        }
      />

      <ReportFilterCard
        idPrefix="operating-result"
        from={from}
        to={to}
        onFromChange={setFrom}
        onToChange={setTo}
        onApply={applyPeriod}
        onClear={resetPeriod}
        isFetching={reportQuery.isFetching}
        error={periodError}
        description="A competência usa a data de conclusão da entrega. O intervalo é obrigatório e aceita até 366 dias. Limpar restaura os últimos 30 dias."
      />

      <ReportQueryState
        loading={reportQuery.isLoading}
        error={reportQuery.isError}
        loadingLabel="Calculando resultado por competência..."
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
              title="Resultado das entregas concluídas"
              description="Margem de contribuição é a receita da plataforma depois do repasse direto. Não representa lucro líquido: impostos e despesas operacionais ainda não são registrados neste módulo."
            />
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard
                label="Valor cobrado"
                value={money(report.totals.totalValue)}
                hint={`${report.totals.pricedCount} entregas com preço completo`}
                changePercent={report.comparison.changePercent.totalValue}
              />
              <StatCard
                label="Repasse direto"
                value={money(report.totals.driverValue)}
                hint="Remuneração congelada das entregas"
                changePercent={report.comparison.changePercent.driverValue}
              />
              <StatCard
                label="Margem de contribuição"
                value={money(report.totals.platformValue)}
                hint={formatPercent(report.totals.contributionMarginPercent)}
                changePercent={report.comparison.changePercent.platformValue}
              />
              <StatCard
                label="Ticket médio"
                value={money(report.totals.averageTicket)}
                hint="Calculado somente sobre entregas com preço completo"
                changePercent={report.comparison.changePercent.averageTicket}
              />
            </div>

            {report.totals.unpricedCount > 0 && (
              <div
                role="alert"
                className="flex items-start gap-3 rounded-xl border border-amber-400/50 bg-amber-500/5 p-4 text-sm"
              >
                <AlertTriangle
                  className="mt-0.5 size-5 shrink-0 text-amber-600"
                  aria-hidden="true"
                />
                <div>
                  <p className="font-semibold text-admin-deep">
                    {report.totals.unpricedCount} entrega(s) concluída(s) sem composição financeira
                    completa
                  </p>
                  <p className="mt-1 leading-5 text-muted-foreground">
                    Elas entram na contagem operacional, mas não nos valores nem no ticket médio.
                    Assim, dados ausentes não são transformados silenciosamente em R$ 0,00.
                  </p>
                </div>
              </div>
            )}
          </section>

          <section className="space-y-4">
            <ReportSectionHeading
              title="Ponte e comparação do resultado"
              description="A ponte reconcilia o preço congelado das entregas. A comparação usa uma janela imediatamente anterior, com a mesma duração e sem sobreposição."
              action={
                <Badge variant={reconciled ? 'default' : 'destructive'}>
                  {reconciled ? (
                    <CheckCircle2 className="size-3" aria-hidden="true" />
                  ) : (
                    <AlertTriangle className="size-3" aria-hidden="true" />
                  )}
                  {reconciled
                    ? 'Composição reconciliada'
                    : `Diferença de ${money(report.totals.reconciliationDifference)}`}
                </Badge>
              }
            />
            <div className="grid gap-4 xl:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Formação da margem</CardTitle>
                </CardHeader>
                <CardContent className="overflow-x-auto p-0">
                  <Table>
                    <TableCaption className="sr-only">
                      Formação da margem de contribuição
                    </TableCaption>
                    <TableBody>
                      <TableRow>
                        <TableCell className="font-medium">Valor cobrado</TableCell>
                        <TableCell className="text-right font-semibold tabular-nums">
                          {money(report.totals.totalValue)}
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-medium">(−) Repasse direto</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {money(report.totals.driverValue)}
                        </TableCell>
                      </TableRow>
                      <TableRow className="bg-primary/[0.035]">
                        <TableCell className="font-semibold">(=) Margem de contribuição</TableCell>
                        <TableCell className="text-right font-semibold tabular-nums">
                          {money(report.totals.platformValue)}
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="text-muted-foreground">Margem percentual</TableCell>
                        <TableCell className="text-right font-medium tabular-nums">
                          {formatPercent(report.totals.contributionMarginPercent)}
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Período atual × anterior</CardTitle>
                </CardHeader>
                <CardContent className="overflow-x-auto p-0">
                  <Table>
                    <TableCaption className="sr-only">
                      Comparação do resultado com o período anterior
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
                        <TableCell className="font-medium">Valor cobrado</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {money(report.totals.totalValue)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {money(report.comparison.totals.totalValue)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatChange(report.comparison.changePercent.totalValue)}
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-medium">Contribuição</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {money(report.totals.platformValue)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {money(report.comparison.totals.platformValue)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatChange(report.comparison.changePercent.platformValue)}
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-medium">Margem percentual</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatPercent(report.totals.contributionMarginPercent)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatPercent(report.comparison.totals.contributionMarginPercent)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {report.comparison.contributionMarginPercentagePointChange > 0 ? '+' : ''}
                          {report.comparison.contributionMarginPercentagePointChange.toLocaleString(
                            'pt-BR',
                          )}{' '}
                          p.p.
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
              title="Ajustes de carteira no período"
              description="Créditos aumentam e débitos reduzem a obrigação com entregadores. Eles ficam fora da margem porque o ledger atual não informa a classificação contábil necessária para tratá-los como receita ou despesa da plataforma."
              action={
                <Link
                  href="/financeiro?aba=carteiras"
                  className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
                >
                  Abrir carteiras
                  <ArrowRight className="size-4" aria-hidden="true" />
                </Link>
              }
            />
            <div className="grid gap-4 sm:grid-cols-3">
              <StatCard
                label="Créditos de ajuste"
                value={money(report.walletAdjustments.creditValue)}
                hint={`${report.walletAdjustments.creditCount} lançamento(s)`}
              />
              <StatCard
                label="Débitos de ajuste"
                value={money(report.walletAdjustments.debitValue)}
                hint={`${report.walletAdjustments.debitCount} lançamento(s)`}
              />
              <StatCard
                label="Impacto líquido na obrigação"
                value={money(report.walletAdjustments.netDriverObligationImpact)}
                hint="Créditos menos débitos; não altera a margem acima"
              />
            </div>
            <Card>
              <CardContent className="overflow-x-auto p-0">
                {report.walletAdjustments.items.length === 0 ? (
                  <p className="p-8 text-center text-sm text-muted-foreground">
                    Nenhum ajuste de carteira não cancelado foi criado no período.
                  </p>
                ) : (
                  <Table>
                    <TableCaption className="sr-only">Ajustes de carteira no período</TableCaption>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Tipo</TableHead>
                        <TableHead>Status financeiro</TableHead>
                        <TableHead>Efeito na obrigação</TableHead>
                        <TableHead className="text-right">Lançamentos</TableHead>
                        <TableHead className="text-right">Valor</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {report.walletAdjustments.items.map((item) => (
                        <TableRow key={`${item.type}-${item.status}`}>
                          <TableCell className="font-medium">
                            {ADJUSTMENT_LABELS[item.type]}
                          </TableCell>
                          <TableCell>{TRANSACTION_STATUS_LABELS[item.status]}</TableCell>
                          <TableCell>
                            <Badge variant="outline">
                              {item.direction === 'CREDIT' ? 'Aumenta' : 'Reduz'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{item.count}</TableCell>
                          <TableCell className="text-right font-medium tabular-nums">
                            {money(item.value)}
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
              title="Resultado por cliente"
              description="Priorize clientes por contribuição, margem ou volume. A participação mede quanto cada cliente representa da receita da plataforma no período."
            />
            <Card>
              <CardContent className="p-4">
                <label htmlFor="result-company-search" className="mb-1.5 block text-sm font-medium">
                  Cliente
                </label>
                <Input
                  id="result-company-search"
                  className="max-w-lg"
                  placeholder="Buscar cliente..."
                  value={companySearch}
                  onChange={(event) => {
                    setCompanySearch(event.target.value);
                    setPage(1);
                  }}
                />
              </CardContent>
            </Card>
            <Card>
              <CardContent className="overflow-x-auto p-0">
                {visibleCompanies.length === 0 ? (
                  <p className="p-10 text-center text-sm text-muted-foreground">
                    Nenhum cliente corresponde à busca.
                  </p>
                ) : (
                  <Table>
                    <TableCaption className="sr-only">
                      Resultado financeiro por cliente
                    </TableCaption>
                    <TableHeader>
                      <TableRow>
                        {COMPANY_COLUMNS.map((column) => (
                          <TableHead
                            key={column.key}
                            className={column.key === 'name' ? 'min-w-52' : 'text-right'}
                            aria-sort={
                              companySortKey === column.key
                                ? sortDirection === 'asc'
                                  ? 'ascending'
                                  : 'descending'
                                : 'none'
                            }
                          >
                            <button
                              type="button"
                              onClick={() => changeCompanySort(column.key)}
                              className={`inline-flex items-center gap-1 whitespace-nowrap ${column.key === 'name' ? '' : 'ml-auto'}`}
                            >
                              {column.label}
                              <ArrowDownUp className="size-3" aria-hidden="true" />
                            </button>
                          </TableHead>
                        ))}
                        <TableHead className="text-right">Participação</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {visibleCompanies.map((company) => (
                        <TableRow
                          key={company.id}
                          className={company.unpricedCount > 0 ? 'bg-amber-500/[0.035]' : ''}
                        >
                          <TableCell>
                            <Link
                              href={`/clientes/${company.id}`}
                              className="font-medium text-primary underline-offset-4 hover:underline"
                            >
                              {company.name}
                            </Link>
                            {company.unpricedCount > 0 && (
                              <p className="mt-1 text-xs text-amber-700">
                                {company.unpricedCount} sem preço completo
                              </p>
                            )}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {company.completedCount}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {money(company.totalValue)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {money(company.driverValue)}
                          </TableCell>
                          <TableCell className="text-right font-semibold tabular-nums">
                            {money(company.platformValue)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatPercent(company.contributionMarginPercent)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {money(company.averageTicket)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatPercent(company.platformRevenueSharePercent)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
            <ReportPagination
              page={safePage}
              pageSize={pageSize}
              total={filteredCompanies.length}
              isFetching={reportQuery.isFetching}
              itemLabel="clientes"
              onPageChange={setPage}
              onPageSizeChange={(size) => {
                setPageSize(size);
                setPage(1);
              }}
            />
          </section>

          <section className="space-y-4">
            <ReportSectionHeading
              title="Modalidades e formas de cobrança"
              description="Compare a economia unitária das modalidades e quanto do resultado veio de faturamento ou pagamento online."
            />
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.65fr)]">
              <Card>
                <CardContent className="overflow-x-auto p-0">
                  <Table>
                    <TableCaption className="sr-only">Resultado por modalidade</TableCaption>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Modalidade</TableHead>
                        <TableHead className="text-right">Entregas</TableHead>
                        <TableHead className="text-right">Cobrado</TableHead>
                        <TableHead className="text-right">Repasse</TableHead>
                        <TableHead className="text-right">Contribuição</TableHead>
                        <TableHead className="text-right">Margem</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {report.serviceTypes.map((serviceType) => (
                        <TableRow key={serviceType.id}>
                          <TableCell className="font-medium">{serviceType.name}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            {serviceType.completedCount}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {money(serviceType.totalValue)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {money(serviceType.driverValue)}
                          </TableCell>
                          <TableCell className="text-right font-semibold tabular-nums">
                            {money(serviceType.platformValue)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatPercent(serviceType.contributionMarginPercent)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
              <div className="grid gap-4">
                {report.paymentMethods.map((paymentMethod) => (
                  <Card key={paymentMethod.paymentMethod}>
                    <CardContent className="p-5">
                      <p className="text-sm font-medium text-admin-deep">
                        {PAYMENT_LABELS[paymentMethod.paymentMethod]}
                      </p>
                      <p className="mt-2 font-mono text-2xl font-semibold tabular-nums">
                        {money(paymentMethod.totalValue)}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {paymentMethod.completedCount} entregas · contribuição{' '}
                        {money(paymentMethod.platformValue)} · margem{' '}
                        {formatPercent(paymentMethod.contributionMarginPercent)}
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <ReportSectionHeading
              title="Evolução diária da contribuição"
              description="Cada linha usa o dia local de conclusão. Dias sem conclusão não aparecem; o CSV mantém toda a série retornada."
            />
            <Card>
              <CardContent className="p-0">
                {report.days.length === 0 ? (
                  <p className="p-10 text-center text-sm text-muted-foreground">
                    Nenhuma entrega foi concluída no período.
                  </p>
                ) : (
                  <div className="max-h-[520px] divide-y overflow-y-auto">
                    {report.days.map((day) => (
                      <div
                        key={day.day}
                        className="grid gap-3 px-5 py-4 md:grid-cols-[110px_minmax(180px,1fr)_150px_150px] md:items-center"
                      >
                        <div>
                          <p className="font-medium text-admin-deep">{formatCivilDate(day.day)}</p>
                          <p className="text-xs text-muted-foreground">
                            {day.completedCount} entregas
                          </p>
                        </div>
                        <div
                          className="h-2.5 overflow-hidden rounded-full bg-muted"
                          aria-hidden="true"
                        >
                          <div
                            className="h-full rounded-full bg-primary"
                            style={{
                              width: `${maxDailyPlatformValue ? Math.max(2, (day.platformValue / maxDailyPlatformValue) * 100) : 0}%`,
                            }}
                          />
                        </div>
                        <p className="text-sm tabular-nums md:text-right">
                          <span className="text-muted-foreground">Cobrado </span>
                          {money(day.totalValue)}
                        </p>
                        <p className="text-sm font-semibold tabular-nums md:text-right">
                          <span className="text-muted-foreground">Contribuição </span>
                          {money(day.platformValue)}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </section>

          <div className="flex items-start gap-3 rounded-xl border border-primary/15 bg-primary/[0.035] p-4 text-sm text-muted-foreground">
            <Info className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
            <p className="leading-6">
              Este é um demonstrativo gerencial de contribuição, não um DRE contábil completo. Para
              chegar ao lucro líquido ainda será necessário persistir e classificar despesas
              operacionais, impostos e demais custos. A posição de caixa continua nos relatórios de
              contas a receber e repasses.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
