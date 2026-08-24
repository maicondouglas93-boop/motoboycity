'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { DriverPayoutPositionItem, PayoutAgingBucketKey } from '@motoboycity/types';
import {
  AlertTriangle,
  ArrowDownUp,
  ArrowRight,
  CheckCircle2,
  Clock3,
  Download,
  WalletCards,
} from 'lucide-react';
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

type PositionFilter = 'ALL' | 'OPEN' | 'AVAILABLE' | 'DIVERGENT';
type SortKey =
  | 'driverName'
  | 'availableBalance'
  | 'blockedBalance'
  | 'pendingWithdrawalAmount'
  | 'totalObligation'
  | 'maxOpenDays';

const BUCKET_META: Record<
  PayoutAgingBucketKey,
  { label: string; description: string; tone: string }
> = {
  OPEN_0_1: {
    label: 'Aberto há 0–1 dia',
    description: 'Solicitações criadas hoje ou no dia anterior.',
    tone: 'border-sky-300/50 bg-sky-500/5',
  },
  OPEN_2_3: {
    label: 'Aberto há 2–3 dias',
    description: 'Solicitações abertas há dois ou três dias corridos.',
    tone: 'border-cyan-300/50 bg-cyan-500/5',
  },
  OPEN_4_7: {
    label: 'Aberto há 4–7 dias',
    description: 'Solicitações que continuam abertas entre quatro e sete dias.',
    tone: 'border-amber-300/50 bg-amber-500/5',
  },
  OPEN_8_PLUS: {
    label: 'Aberto há 8 dias ou mais',
    description: 'Solicitações abertas há oito dias ou mais, sem afirmar atraso de SLA.',
    tone: 'border-orange-300/60 bg-orange-500/5',
  },
};

const SORT_COLUMNS: Array<{ key: SortKey; label: string }> = [
  { key: 'driverName', label: 'Entregador' },
  { key: 'availableBalance', label: 'Disponível' },
  { key: 'blockedBalance', label: 'Bloqueado' },
  { key: 'pendingWithdrawalAmount', label: 'Reservado' },
  { key: 'totalObligation', label: 'Obrigação total' },
  { key: 'maxOpenDays', label: 'Mais antigo' },
];

function formatCivilDate(date: string): string {
  return new Intl.DateTimeFormat('pt-BR').format(new Date(`${date}T12:00:00Z`));
}

function csvNumber(value: number): string {
  return String(value).replace('.', ',');
}

function countLabel(count: number, singular: string, plural: string): string {
  return `${count.toLocaleString('pt-BR')} ${count === 1 ? singular : plural}`;
}

function hasReconciliationIssue(driver: DriverPayoutPositionItem): boolean {
  return !driver.cacheMatchesLedger || Math.abs(driver.withdrawalLedgerDifference) >= 0.01;
}

function matchesPosition(driver: DriverPayoutPositionItem, filter: PositionFilter): boolean {
  if (filter === 'OPEN') return driver.openWithdrawalCount > 0;
  if (filter === 'AVAILABLE') return driver.availableBalance > 0;
  if (filter === 'DIVERGENT') return hasReconciliationIssue(driver);
  return true;
}

export default function PayoutsReportPage() {
  const token = session.getToken();
  const money = useMoney();
  const [search, setSearch] = useState('');
  const [positionFilter, setPositionFilter] = useState<PositionFilter>('ALL');
  const [sortKey, setSortKey] = useState<SortKey>('totalObligation');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const reportQuery = useQuery({
    queryKey: ['admin', 'financial', 'payouts-aging'],
    queryFn: () => adminFinancialApi.payoutsAging(token as string),
    enabled: Boolean(token),
  });

  const filteredDrivers = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase('pt-BR');
    const drivers = (reportQuery.data?.drivers ?? []).filter(
      (driver) =>
        matchesPosition(driver, positionFilter) &&
        (normalizedSearch
          ? `${driver.driverName} ${driver.driverEmail}`
              .toLocaleLowerCase('pt-BR')
              .includes(normalizedSearch)
          : true),
    );

    return [...drivers].sort((left, right) => {
      const a = left[sortKey];
      const b = right[sortKey];
      const comparison =
        typeof a === 'string' ? a.localeCompare(String(b), 'pt-BR') : Number(a) - Number(b);
      return (
        (sortDirection === 'asc' ? comparison : -comparison) ||
        left.driverName.localeCompare(right.driverName, 'pt-BR')
      );
    });
  }, [positionFilter, reportQuery.data?.drivers, search, sortDirection, sortKey]);

  const totalPages = Math.max(1, Math.ceil(filteredDrivers.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const visibleDrivers = useMemo(
    () => filteredDrivers.slice((safePage - 1) * pageSize, safePage * pageSize),
    [filteredDrivers, pageSize, safePage],
  );

  if (!token) {
    return <p className="text-sm text-muted-foreground">Faça login como administrador.</p>;
  }

  function changeSort(nextKey: SortKey) {
    if (sortKey === nextKey) {
      setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(nextKey);
      setSortDirection(nextKey === 'driverName' ? 'asc' : 'desc');
    }
    setPage(1);
  }

  function exportCsv() {
    const report = reportQuery.data;
    if (!report) return;

    const csv = toCsv(
      [
        'Entregador',
        'E-mail',
        'Saldo disponível',
        'Saldo bloqueado',
        'Reservado para saques',
        'Obrigação total',
        'Saques abertos',
        'Valor solicitado em aberto',
        'Valor líquido em aberto',
        'Solicitações pendentes',
        'Solicitações aprovadas',
        'Data da solicitação mais antiga',
        'Dias da solicitação mais antiga',
        'Cache confere com ledger',
        'Diferença entre reserva e saques abertos',
        'Posição em',
      ],
      filteredDrivers.map((driver) => [
        driver.driverName,
        driver.driverEmail,
        csvNumber(driver.availableBalance),
        csvNumber(driver.blockedBalance),
        csvNumber(driver.pendingWithdrawalAmount),
        csvNumber(driver.totalObligation),
        driver.openWithdrawalCount,
        csvNumber(driver.openRequestedValue),
        csvNumber(driver.openNetValue),
        driver.pendingRequestCount,
        driver.approvedRequestCount,
        driver.oldestOpenDate ?? '',
        driver.maxOpenDays,
        driver.cacheMatchesLedger ? 'Sim' : 'Não',
        csvNumber(driver.withdrawalLedgerDifference),
        report.asOf,
      ]),
    );
    downloadCsv('relatorio-repasses-e-saques.csv', csv);
  }

  const report = reportQuery.data;
  const ledgerMatchesWithdrawals =
    report !== undefined && Math.abs(report.withdrawals.withdrawalLedgerDifference) < 0.01;
  const reconciled =
    report !== undefined && report.wallets.divergentCount === 0 && ledgerMatchesWithdrawals;

  return (
    <div className="mx-auto w-full max-w-[1480px] space-y-7 pb-12">
      <ReportPageHeader
        icon={WalletCards}
        title="Repasses e saques"
        description="Veja quanto a operação deve aos entregadores, acompanhe solicitações abertas e confira se saldos, reservas e saques estão conciliados."
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

      <ReportQueryState
        loading={reportQuery.isLoading}
        error={reportQuery.isError}
        loadingLabel="Conciliando repasses e saques..."
        onRetry={() => {
          void reportQuery.refetch();
        }}
      />

      {report && (
        <div className="space-y-9">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/10 bg-admin-soft/35 px-4 py-3 text-sm text-muted-foreground">
            <p>
              Posição financeira em{' '}
              <strong className="text-admin-deep">{formatCivilDate(report.asOf)}</strong>. O total
              inclui valores disponíveis, bloqueados e já reservados para saques.
            </p>
            <Badge variant="outline" className="gap-1.5">
              <Clock3 className="size-3" aria-hidden="true" />
              Fotografia atual
            </Badge>
          </div>

          <section className="space-y-4">
            <ReportSectionHeading
              title="Obrigações com entregadores"
              description="O valor reservado já saiu do saldo disponível, mas continua sendo uma obrigação até o saque ser concluído ou rejeitado."
            />
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard
                label="Obrigação total"
                value={money(report.totalObligation)}
                hint={countLabel(report.wallets.driverCount, 'entregador', 'entregadores')}
              />
              <StatCard
                label="Saldo disponível"
                value={money(report.wallets.availableBalance)}
                hint="Valor que ainda pode ser solicitado"
              />
              <StatCard
                label="Saldo bloqueado"
                value={money(report.wallets.blockedBalance)}
                hint="Valor contabilizado, mas ainda não liberado"
              />
              <StatCard
                label="Reservado para saques"
                value={money(report.wallets.pendingWithdrawalAmount)}
                hint={countLabel(
                  report.withdrawals.openCount,
                  'solicitação aberta',
                  'solicitações abertas',
                )}
              />
            </div>
          </section>

          <section className="space-y-4">
            <ReportSectionHeading
              title="Conciliação e andamento"
              description="Compare o fluxo operacional dos saques com as reservas do ledger e os saldos usados pela carteira."
              action={
                <Link
                  href="/financeiro?aba=carteiras"
                  className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
                >
                  Abrir financeiro
                  <ArrowRight className="size-4" aria-hidden="true" />
                </Link>
              }
            />
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <Card>
                <CardContent className="p-5">
                  <p className="text-sm font-medium text-admin-deep">Aguardando análise</p>
                  <p className="mt-2 font-mono text-2xl font-semibold tabular-nums">
                    {money(report.withdrawals.pendingNetValue)}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {countLabel(report.withdrawals.pendingCount, 'solicitação', 'solicitações')}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-5">
                  <p className="text-sm font-medium text-admin-deep">
                    Aprovado, aguardando pagamento
                  </p>
                  <p className="mt-2 font-mono text-2xl font-semibold tabular-nums">
                    {money(report.withdrawals.approvedNetValue)}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {countLabel(report.withdrawals.approvedCount, 'solicitação', 'solicitações')}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-5">
                  <p className="text-sm font-medium text-admin-deep">
                    Solicitação aberta mais antiga
                  </p>
                  <p className="mt-2 font-mono text-2xl font-semibold tabular-nums">
                    {report.withdrawals.maxOpenDays > 0
                      ? `${report.withdrawals.maxOpenDays} dias`
                      : report.withdrawals.openCount > 0
                        ? 'Hoje'
                        : '—'}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {report.withdrawals.oldestOpenDate
                      ? `Criada em ${formatCivilDate(report.withdrawals.oldestOpenDate)}`
                      : 'Nenhuma solicitação aberta'}
                  </p>
                </CardContent>
              </Card>
              <Card className={reconciled ? 'border-emerald-300/60' : 'border-amber-400/70'}>
                <CardContent className="p-5">
                  <p className="text-sm font-medium text-admin-deep">Conciliação</p>
                  <div className="mt-2 flex items-center gap-2">
                    {reconciled ? (
                      <CheckCircle2 className="size-6 text-emerald-600" aria-hidden="true" />
                    ) : (
                      <AlertTriangle className="size-6 text-amber-600" aria-hidden="true" />
                    )}
                    <p className="text-lg font-semibold text-admin-deep">
                      {reconciled ? 'Sem divergências' : 'Revisão necessária'}
                    </p>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-muted-foreground">
                    {report.wallets.divergentCount > 0 &&
                      `${countLabel(report.wallets.divergentCount, 'carteira divergente', 'carteiras divergentes')}. `}
                    {!ledgerMatchesWithdrawals &&
                      `Diferença nas reservas: ${money(report.withdrawals.withdrawalLedgerDifference)}.`}
                    {reconciled && 'Saldos em cache, ledger e solicitações abertas conferem.'}
                  </p>
                </CardContent>
              </Card>
            </div>
          </section>

          <section className="space-y-4">
            <ReportSectionHeading
              title="Idade das solicitações abertas"
              description="As faixas mostram há quanto tempo cada saque está aberto. Como não há SLA de pagamento configurado, idade não significa atraso."
            />
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {report.buckets.map((bucket) => {
                const meta = BUCKET_META[bucket.key];
                return (
                  <Card key={bucket.key} className={meta.tone}>
                    <CardContent className="p-5">
                      <p className="text-sm font-medium text-admin-deep">{meta.label}</p>
                      <p className="mt-2 font-mono text-2xl font-semibold tracking-tight tabular-nums">
                        {money(bucket.requestedValue)}
                      </p>
                      <p className="mt-1 text-xs font-medium text-muted-foreground">
                        {countLabel(bucket.count, 'solicitação', 'solicitações')} · líquido{' '}
                        {money(bucket.netValue)}
                      </p>
                      <p className="mt-3 text-xs leading-5 text-muted-foreground">
                        {meta.description}
                      </p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </section>

          <section className="space-y-4">
            <ReportSectionHeading
              title="Posição por entregador"
              description="Busque, filtre e ordene as carteiras. O CSV respeita os filtros e exporta todas as linhas encontradas."
            />

            <Card>
              <CardContent className="flex flex-wrap items-end gap-3 p-4">
                <div className="min-w-64 flex-1 space-y-1.5">
                  <label htmlFor="payouts-search" className="text-sm font-medium">
                    Entregador
                  </label>
                  <Input
                    id="payouts-search"
                    placeholder="Buscar por nome ou e-mail..."
                    value={search}
                    onChange={(event) => {
                      setSearch(event.target.value);
                      setPage(1);
                    }}
                  />
                </div>
                <div className="min-w-60 space-y-1.5">
                  <label htmlFor="payouts-filter" className="text-sm font-medium">
                    Posição da carteira
                  </label>
                  <select
                    id="payouts-filter"
                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-admin-deep"
                    value={positionFilter}
                    onChange={(event) => {
                      setPositionFilter(event.target.value as PositionFilter);
                      setPage(1);
                    }}
                  >
                    <option value="ALL">Todas as carteiras</option>
                    <option value="OPEN">Com saque aberto</option>
                    <option value="AVAILABLE">Com saldo disponível</option>
                    <option value="DIVERGENT">Com divergência</option>
                  </select>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="overflow-x-auto p-0">
                {visibleDrivers.length === 0 ? (
                  <p className="p-10 text-center text-sm text-muted-foreground">
                    Nenhum entregador corresponde aos filtros selecionados.
                  </p>
                ) : (
                  <Table>
                    <TableCaption className="sr-only">
                      Obrigações financeiras consolidadas por entregador
                    </TableCaption>
                    <TableHeader>
                      <TableRow>
                        {SORT_COLUMNS.map((column) => (
                          <TableHead
                            key={column.key}
                            className={column.key === 'driverName' ? 'min-w-56' : 'text-right'}
                            aria-sort={
                              sortKey === column.key
                                ? sortDirection === 'asc'
                                  ? 'ascending'
                                  : 'descending'
                                : 'none'
                            }
                          >
                            <button
                              type="button"
                              onClick={() => changeSort(column.key)}
                              className={`inline-flex items-center gap-1 whitespace-nowrap ${
                                column.key === 'driverName' ? '' : 'ml-auto'
                              }`}
                            >
                              {column.label}
                              <ArrowDownUp className="size-3" aria-hidden="true" />
                            </button>
                          </TableHead>
                        ))}
                        <TableHead className="min-w-44">Conciliação</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {visibleDrivers.map((driver) => {
                        const reconciliationIssue = hasReconciliationIssue(driver);
                        return (
                          <TableRow
                            key={driver.driverId}
                            className={reconciliationIssue ? 'bg-amber-500/[0.035]' : ''}
                          >
                            <TableCell>
                              <Link
                                href={`/entregadores/${driver.driverId}`}
                                className="font-medium text-primary underline-offset-4 hover:underline"
                              >
                                {driver.driverName}
                              </Link>
                              <p className="mt-0.5 text-xs text-muted-foreground">
                                {driver.driverEmail}
                              </p>
                            </TableCell>
                            <TableCell className="text-right font-medium tabular-nums">
                              {money(driver.availableBalance)}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {money(driver.blockedBalance)}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              <p className="font-medium">{money(driver.pendingWithdrawalAmount)}</p>
                              <p className="text-xs text-muted-foreground">
                                {countLabel(driver.openWithdrawalCount, 'saque', 'saques')}
                              </p>
                            </TableCell>
                            <TableCell className="text-right font-semibold tabular-nums">
                              {money(driver.totalObligation)}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {driver.openWithdrawalCount > 0 ? (
                                <>
                                  <p className="font-medium">
                                    {driver.maxOpenDays === 0
                                      ? 'Hoje'
                                      : `${driver.maxOpenDays} dias`}
                                  </p>
                                  {driver.oldestOpenDate && (
                                    <p className="text-xs text-muted-foreground">
                                      desde {formatCivilDate(driver.oldestOpenDate)}
                                    </p>
                                  )}
                                </>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant={reconciliationIssue ? 'destructive' : 'outline'}
                                className="gap-1"
                              >
                                {reconciliationIssue ? (
                                  <AlertTriangle aria-hidden="true" />
                                ) : (
                                  <CheckCircle2 aria-hidden="true" />
                                )}
                                {reconciliationIssue ? 'Revisar' : 'Confere'}
                              </Badge>
                              {!driver.cacheMatchesLedger && (
                                <p className="mt-1 text-xs text-muted-foreground">
                                  Cache diferente do ledger
                                </p>
                              )}
                              {Math.abs(driver.withdrawalLedgerDifference) >= 0.01 && (
                                <p className="mt-1 text-xs text-muted-foreground">
                                  Reserva: {money(driver.withdrawalLedgerDifference)} de diferença
                                </p>
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
              total={filteredDrivers.length}
              isFetching={reportQuery.isFetching}
              itemLabel="entregadores"
              onPageChange={setPage}
              onPageSizeChange={(size) => {
                setPageSize(size);
                setPage(1);
              }}
            />
          </section>
        </div>
      )}
    </div>
  );
}
