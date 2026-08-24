'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type {
  FinancialAuditEvent,
  InvoiceStatus,
  WithdrawalRequestStatus,
} from '@motoboycity/types';
import { Download, FileClock, UserRoundCheck } from 'lucide-react';
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

type KindFilter = 'ALL' | FinancialAuditEvent['kind'];
type ActorFilter = 'ALL' | 'IDENTIFIED' | 'SYSTEM';

const INVOICE_STATUS: Record<InvoiceStatus, string> = {
  PENDING: 'Em aberto',
  PAID: 'Paga',
  OVERDUE: 'Vencida',
  CANCELLED: 'Cancelada',
};

const WITHDRAWAL_STATUS: Record<WithdrawalRequestStatus, string> = {
  PENDING: 'Pendente',
  APPROVED: 'Aprovado',
  PAID: 'Pago',
  REJECTED: 'Rejeitado',
};

const KIND_LABEL: Record<FinancialAuditEvent['kind'], string> = {
  WALLET_ADJUSTMENT: 'Ajuste de carteira',
  INVOICE_STATUS_CHANGE: 'Mudança de fatura',
  WITHDRAWAL_STATUS_CHANGE: 'Decisão de saque',
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

function eventSearchText(event: FinancialAuditEvent): string {
  if (event.kind === 'WALLET_ADJUSTMENT') {
    return [event.id, event.driver.name, event.actor?.name, event.reason].join(' ');
  }
  if (event.kind === 'INVOICE_STATUS_CHANGE') {
    return [
      event.id,
      event.invoice.number,
      event.invoice.company.name,
      event.actor?.name,
      event.note,
    ].join(' ');
  }
  return [
    event.id,
    event.withdrawal.id,
    event.withdrawal.driver.name,
    event.actor?.name,
    event.note,
  ].join(' ');
}

function eventChange(event: FinancialAuditEvent): string {
  if (event.kind === 'WALLET_ADJUSTMENT') {
    const direction = event.direction === 'CREDIT' ? 'Crédito' : 'Débito';
    return `${direction} · ${event.transactionStatus === 'CANCELLED' ? 'Cancelado' : 'Ativo'}`;
  }
  if (event.kind === 'INVOICE_STATUS_CHANGE') {
    return `${event.fromStatus ? INVOICE_STATUS[event.fromStatus] : 'Criada'} → ${INVOICE_STATUS[event.toStatus]}`;
  }
  return `${event.fromStatus ? WITHDRAWAL_STATUS[event.fromStatus] : 'Criado'} → ${WITHDRAWAL_STATUS[event.toStatus]}`;
}

function eventValue(event: FinancialAuditEvent): number {
  if (event.kind === 'WALLET_ADJUSTMENT') return event.amount;
  if (event.kind === 'INVOICE_STATUS_CHANGE') return event.invoice.totalValue;
  return event.withdrawal.netAmount;
}

function eventNote(event: FinancialAuditEvent): string | null {
  return event.kind === 'WALLET_ADJUSTMENT' ? event.reason : event.note;
}

export default function FinancialAuditPage() {
  const token = session.getToken();
  const money = useMoney();
  const [initialPeriod] = useState(defaultPeriod);
  const [from, setFrom] = useState(initialPeriod.from);
  const [to, setTo] = useState(initialPeriod.to);
  const [appliedPeriod, setAppliedPeriod] = useState(initialPeriod);
  const [periodError, setPeriodError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState<KindFilter>('ALL');
  const [actor, setActor] = useState<ActorFilter>('ALL');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const reportQuery = useQuery({
    queryKey: ['admin', 'financial', 'audit-trail', appliedPeriod],
    queryFn: () => adminFinancialApi.financialAudit(token as string, appliedPeriod),
    enabled: Boolean(token),
  });

  const filteredEvents = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase('pt-BR');
    return (reportQuery.data?.events ?? []).filter((event) => {
      if (kind !== 'ALL' && event.kind !== kind) return false;
      if (actor === 'IDENTIFIED' && !event.actor) return false;
      if (actor === 'SYSTEM' && event.actor) return false;
      return normalizedSearch
        ? eventSearchText(event).toLocaleLowerCase('pt-BR').includes(normalizedSearch)
        : true;
    });
  }, [actor, kind, reportQuery.data?.events, search]);

  const totalPages = Math.max(1, Math.ceil(filteredEvents.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const visibleEvents = useMemo(
    () => filteredEvents.slice((safePage - 1) * pageSize, safePage * pageSize),
    [filteredEvents, pageSize, safePage],
  );

  if (!token) {
    return <p className="text-sm text-muted-foreground">Faça login como administrador.</p>;
  }

  function applyPeriod() {
    if (!from || !to) {
      setPeriodError('Informe as duas datas da auditoria.');
      return;
    }
    if (from > to) {
      setPeriodError('A data inicial não pode ser posterior à data final.');
      return;
    }
    if (civilDayNumber(to) - civilDayNumber(from) > 30) {
      setPeriodError('A auditoria financeira aceita no máximo 31 dias por consulta.');
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
    if (!reportQuery.data) return;
    const rows = filteredEvents.map((event) => {
      const reference =
        event.kind === 'WALLET_ADJUSTMENT'
          ? event.driver.name
          : event.kind === 'INVOICE_STATUS_CHANGE'
            ? `${event.invoice.number} · ${event.invoice.company.name}`
            : event.withdrawal.driver.name;
      return [
        formatDateTime(event.occurredAt),
        KIND_LABEL[event.kind],
        reference,
        eventChange(event),
        csvNumber(eventValue(event)),
        event.actor?.name ?? 'Sistema',
        eventNote(event) ?? '',
        event.id,
      ];
    });
    downloadCsv(
      'auditoria-financeira.csv',
      toCsv(
        ['Data', 'Evento', 'Referência', 'Mudança', 'Valor', 'Autor', 'Motivo/nota', 'ID'],
        rows,
      ),
    );
  }

  const report = reportQuery.data;

  return (
    <div className="mx-auto w-full max-w-[1540px] space-y-7 pb-12">
      <ReportPageHeader
        icon={FileClock}
        title="Auditoria financeira"
        description="Descubra quem lançou um ajuste, mudou uma fatura ou decidiu um saque, com valor, horário e justificativa em uma única cronologia."
        action={
          <Button type="button" variant="outline" onClick={exportCsv} disabled={!report}>
            <Download className="size-4" aria-hidden="true" />
            Exportar eventos filtrados
          </Button>
        }
      />

      <ReportFilterCard
        idPrefix="financial-audit"
        from={from}
        to={to}
        onFromChange={setFrom}
        onToChange={setTo}
        onApply={applyPeriod}
        onClear={resetPeriod}
        isFetching={reportQuery.isFetching}
        error={periodError}
        description="A auditoria lê eventos individuais e aceita até 31 dias. O período usa o horário operacional de São Paulo."
      />

      <ReportQueryState
        loading={reportQuery.isLoading}
        error={reportQuery.isError}
        loadingLabel="Relacionando autores, valores e decisões financeiras..."
        onRetry={() => void reportQuery.refetch()}
      />

      {report && (
        <div className="space-y-9">
          <section className="space-y-4">
            <ReportSectionHeading
              title="Resumo do período"
              description="Créditos e débitos consideram somente ajustes ainda ativos. Eventos cancelados continuam na trilha detalhada."
            />
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
              <StatCard
                label="Eventos financeiros"
                value={report.summary.totalEventCount}
                hint={`${report.summary.systemEventCount} automáticos`}
              />
              <StatCard
                label="Ajustes de crédito ativos"
                value={money(report.summary.walletCreditValue)}
                hint={`${report.summary.walletAdjustmentCount} ajustes na trilha`}
              />
              <StatCard
                label="Ajustes de débito ativos"
                value={money(report.summary.walletDebitValue)}
                hint="Cancelados não afetam o total"
              />
              <StatCard
                label="Faturas marcadas como pagas"
                value={money(report.summary.invoicePaidValue)}
                hint={`${report.summary.invoicePaidCount} confirmações`}
              />
              <StatCard
                label="Saques marcados como pagos"
                value={money(report.summary.withdrawalPaidValue)}
                hint={`${report.summary.withdrawalPaidCount} confirmações`}
              />
            </div>
          </section>

          <section className="space-y-4">
            <ReportSectionHeading
              title="Linha do tempo auditável"
              description="A busca e os filtros também controlam o conteúdo exportado no CSV."
            />
            <Card>
              <CardContent className="grid gap-3 p-4 lg:grid-cols-[minmax(260px,1fr)_240px_220px]">
                <div className="space-y-1.5">
                  <label htmlFor="audit-search" className="text-sm font-medium">
                    Referência, pessoa ou motivo
                  </label>
                  <Input
                    id="audit-search"
                    placeholder="Buscar na auditoria..."
                    value={search}
                    onChange={(event) => {
                      setSearch(event.target.value);
                      setPage(1);
                    }}
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="audit-kind" className="text-sm font-medium">
                    Tipo de evento
                  </label>
                  <select
                    id="audit-kind"
                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={kind}
                    onChange={(event) => {
                      setKind(event.target.value as KindFilter);
                      setPage(1);
                    }}
                  >
                    <option value="ALL">Todos os eventos</option>
                    <option value="WALLET_ADJUSTMENT">Ajustes de carteira</option>
                    <option value="INVOICE_STATUS_CHANGE">Mudanças de fatura</option>
                    <option value="WITHDRAWAL_STATUS_CHANGE">Decisões de saque</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="audit-actor" className="text-sm font-medium">
                    Origem
                  </label>
                  <select
                    id="audit-actor"
                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={actor}
                    onChange={(event) => {
                      setActor(event.target.value as ActorFilter);
                      setPage(1);
                    }}
                  >
                    <option value="ALL">Pessoas e sistema</option>
                    <option value="IDENTIFIED">Autor identificado</option>
                    <option value="SYSTEM">Evento automático</option>
                  </select>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="overflow-x-auto p-0">
                {visibleEvents.length === 0 ? (
                  <p className="p-10 text-center text-sm text-muted-foreground">
                    Nenhum evento corresponde aos filtros.
                  </p>
                ) : (
                  <Table>
                    <TableCaption className="sr-only">Eventos da auditoria financeira</TableCaption>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Data</TableHead>
                        <TableHead>Evento</TableHead>
                        <TableHead>Referência</TableHead>
                        <TableHead>Mudança</TableHead>
                        <TableHead className="text-right">Valor</TableHead>
                        <TableHead>Autor</TableHead>
                        <TableHead>Motivo ou nota</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {visibleEvents.map((event) => (
                        <AuditRow key={`${event.kind}-${event.id}`} event={event} money={money} />
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
            <ReportPagination
              page={safePage}
              pageSize={pageSize}
              total={filteredEvents.length}
              isFetching={reportQuery.isFetching}
              itemLabel="eventos"
              onPageChange={setPage}
              onPageSizeChange={(size) => {
                setPageSize(size);
                setPage(1);
              }}
            />
          </section>

          <div className="flex items-start gap-3 rounded-xl border border-primary/15 bg-primary/[0.035] p-4 text-sm text-muted-foreground">
            <UserRoundCheck className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
            <p className="leading-6">
              “Sistema” significa que a trilha não possui usuário responsável — por exemplo,
              fechamento semanal automático. A tela não tenta adivinhar um autor. Esta auditoria
              cobre eventos financeiros persistidos; ela não substitui conciliação com extrato
              bancário.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function AuditRow({
  event,
  money,
}: {
  event: FinancialAuditEvent;
  money: (value: number | null | undefined) => string;
}) {
  const reference =
    event.kind === 'WALLET_ADJUSTMENT' ? (
      <Link
        href={`/entregadores/${event.driver.id}`}
        className="font-medium text-primary hover:underline"
      >
        {event.driver.name}
      </Link>
    ) : event.kind === 'INVOICE_STATUS_CHANGE' ? (
      <div>
        <Link
          href={`/faturas/${event.invoice.id}`}
          className="font-medium text-primary hover:underline"
        >
          {event.invoice.number}
        </Link>
        <p className="text-xs text-muted-foreground">{event.invoice.company.name}</p>
      </div>
    ) : (
      <Link
        href={`/financeiro/saques/${event.withdrawal.id}`}
        className="font-medium text-primary hover:underline"
      >
        {event.withdrawal.driver.name}
      </Link>
    );
  const cancelled = event.kind === 'WALLET_ADJUSTMENT' && event.transactionStatus === 'CANCELLED';

  return (
    <TableRow className={cancelled ? 'opacity-60' : ''}>
      <TableCell className="whitespace-nowrap">{formatDateTime(event.occurredAt)}</TableCell>
      <TableCell>
        <Badge variant="outline">{KIND_LABEL[event.kind]}</Badge>
      </TableCell>
      <TableCell>{reference}</TableCell>
      <TableCell className="whitespace-nowrap text-sm">{eventChange(event)}</TableCell>
      <TableCell className="text-right font-semibold tabular-nums">
        {money(eventValue(event))}
      </TableCell>
      <TableCell className="whitespace-nowrap">
        {event.actor?.name ?? <span className="text-muted-foreground">Sistema</span>}
      </TableCell>
      <TableCell className="min-w-64 max-w-md text-sm text-muted-foreground">
        {eventNote(event) ?? 'Sem observação registrada'}
      </TableCell>
    </TableRow>
  );
}
