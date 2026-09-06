'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ApiError } from '@motoboycity/api-client';
import type { InvoiceStatus } from '@motoboycity/types';
import { AlertTriangle, CalendarClock, CheckCircle2, ReceiptText, RefreshCw } from 'lucide-react';
import { MetricCard } from '@/components/finance/metric-card';
import { ReportPagination } from '@/components/reports/report-pagination';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { QueryState } from '@/components/ui/query-state';
import { adminInvoicesApi } from '@/lib/api-client';
import { formatarData } from '@/lib/dinheiro';
import {
  filterInvoiceHistory,
  summarizeInvoiceHistory,
  type InvoiceHistoryFilters,
} from '@/lib/invoice-history';
import { useMoney } from '@/lib/money';
import { paginar } from '@/lib/paginacao';

const EMPTY_FILTERS: InvoiceHistoryFilters = { status: 'ALL', from: '', to: '', number: '' };
const STATUS_LABEL: Record<InvoiceStatus, string> = {
  PENDING: 'Pendente',
  PAID: 'Paga',
  OVERDUE: 'Vencida',
  CANCELLED: 'Cancelada',
};

export function CompanyInvoiceHistory({ companyId, token }: { companyId: string; token: string }) {
  const money = useMoney();
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  // O prefixo financeiro já é invalidado por baixa, cancelamento, vencimento e emissão.
  const query = useQuery({
    queryKey: ['admin', 'financial', 'invoices', 'company-history', companyId],
    queryFn: () => adminInvoicesApi.list(token, { companyId }),
  });
  const invalidPeriod = Boolean(filters.from && filters.to && filters.from > filters.to);
  const invoices = useMemo(
    () => filterInvoiceHistory(query.data ?? [], filters),
    [query.data, filters],
  );
  const summary = useMemo(() => summarizeInvoiceHistory(invoices), [invoices]);
  const pagination = paginar(invoices.length, page, pageSize);

  function changeFilters(patch: Partial<InvoiceHistoryFilters>) {
    setFilters((current) => ({ ...current, ...patch }));
    setPage(1);
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardContent className="space-y-4 py-5">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="space-y-1.5">
              <Label htmlFor="invoice-number">Número da fatura</Label>
              <Input
                id="invoice-number"
                placeholder="Buscar fatura..."
                value={filters.number}
                onChange={(event) => changeFilters({ number: event.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="invoice-status">Status</Label>
              <select
                id="invoice-status"
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                value={filters.status}
                onChange={(event) =>
                  changeFilters({ status: event.target.value as InvoiceHistoryFilters['status'] })
                }
              >
                <option value="ALL">Todos os status</option>
                {Object.entries(STATUS_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="invoice-from">Emissão a partir de</Label>
              <Input
                id="invoice-from"
                type="date"
                value={filters.from}
                max={filters.to || undefined}
                aria-invalid={invalidPeriod}
                aria-describedby={invalidPeriod ? 'invoice-period-error' : undefined}
                onChange={(event) => changeFilters({ from: event.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="invoice-to">Emissão até</Label>
              <Input
                id="invoice-to"
                type="date"
                value={filters.to}
                min={filters.from || undefined}
                aria-invalid={invalidPeriod}
                aria-describedby={invalidPeriod ? 'invoice-period-error' : undefined}
                onChange={(event) => changeFilters({ to: event.target.value })}
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              O período considera a data de emissão. Sem filtros, todo o histórico é exibido.
            </p>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setFilters(EMPTY_FILTERS);
                  setPage(1);
                }}
              >
                Limpar filtros
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={query.isFetching}
                onClick={() => void query.refetch()}
              >
                <RefreshCw
                  aria-hidden
                  className={`size-4 ${query.isFetching ? 'animate-spin' : ''}`}
                />
                {query.isFetching ? 'Atualizando...' : 'Atualizar'}
              </Button>
            </div>
          </div>
          {invalidPeriod && (
            <p id="invoice-period-error" role="alert" className="text-sm text-destructive">
              A data inicial não pode ser posterior à data final.
            </p>
          )}
        </CardContent>
      </Card>

      {query.isPending ? (
        <QueryState kind="loading" title="Carregando histórico de faturas" />
      ) : query.isError ? (
        <QueryState
          kind="error"
          title="Não foi possível carregar o histórico"
          description={
            query.error instanceof ApiError
              ? query.error.message
              : 'Tente atualizar a consulta novamente.'
          }
          onAction={() => void query.refetch()}
        />
      ) : (
        !invalidPeriod && (
          <>
            <section aria-label="Resumo das faturas no filtro" className="space-y-3">
              <h2 className="font-semibold">Resumo no filtro</h2>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <MetricCard
                  label="Total faturado"
                  value={money(summary.billed)}
                  icon={ReceiptText}
                  hint={`${summary.count} fatura(s) encontrada(s); ${summary.cancelledCount} cancelada(s), fora do total`}
                />
                <MetricCard
                  label="Pago"
                  value={money(summary.paid)}
                  intent="recebido"
                  icon={CheckCircle2}
                  hint={`${summary.paidCount} fatura(s) paga(s)`}
                />
                <MetricCard
                  label="Em aberto"
                  value={money(summary.outstanding)}
                  intent="aguardando"
                  icon={CalendarClock}
                  hint={`${summary.outstandingCount} fatura(s), incluindo vencidas`}
                />
                <MetricCard
                  label="Vencido"
                  value={money(summary.overdue)}
                  intent="atrasado"
                  icon={AlertTriangle}
                  neutralizarZero
                  hint={`${summary.overdueCount} fatura(s) em atraso; parte do valor em aberto`}
                />
              </div>
            </section>

            {invoices.length === 0 ? (
              <QueryState
                kind="empty"
                title={
                  query.data.length === 0
                    ? 'Este cliente ainda não possui faturas'
                    : 'Nenhuma fatura neste filtro'
                }
                description={
                  query.data.length === 0
                    ? 'As faturas aparecerão aqui após o fechamento.'
                    : 'Revise o número, o status ou o período de emissão.'
                }
              />
            ) : (
              <Card>
                <CardContent className="space-y-4 py-5">
                  <div className="overflow-x-auto" aria-busy={query.isFetching}>
                    <table className="w-full text-left text-sm">
                      <caption className="sr-only">
                        Faturas do cliente, da emissão mais recente para a mais antiga
                      </caption>
                      <thead className="border-b text-muted-foreground">
                        <tr>
                          {[
                            'Fatura',
                            'Emissão',
                            'Vencimento',
                            'Pagamento',
                            'Pedidos',
                            'Valor',
                            'Status',
                            'Detalhes',
                          ].map((label) => (
                            <th
                              key={label}
                              scope="col"
                              className="whitespace-nowrap px-3 py-3 font-medium"
                            >
                              {label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {invoices.slice(pagination.inicio, pagination.fim).map((invoice) => (
                          <tr key={invoice.id} className="border-b last:border-0 hover:bg-muted/30">
                            <td className="whitespace-nowrap px-3 py-4 font-mono text-xs">
                              {invoice.number}
                            </td>
                            <td className="whitespace-nowrap px-3 py-4">
                              {formatarData(invoice.issueDate)}
                            </td>
                            <td className="whitespace-nowrap px-3 py-4">
                              {formatarData(invoice.dueDate)}
                            </td>
                            <td className="whitespace-nowrap px-3 py-4">
                              {formatarData(invoice.paymentDate)}
                            </td>
                            <td className="px-3 py-4 tabular-nums">{invoice.deliveryCount}</td>
                            <td className="whitespace-nowrap px-3 py-4 font-semibold tabular-nums">
                              {money(invoice.totalValue)}
                            </td>
                            <td className="px-3 py-4">
                              <Badge
                                variant={
                                  invoice.status === 'OVERDUE'
                                    ? 'destructive'
                                    : invoice.status === 'PAID'
                                      ? 'default'
                                      : 'secondary'
                                }
                              >
                                {STATUS_LABEL[invoice.status]}
                              </Badge>
                            </td>
                            <td className="px-3 py-4">
                              <Link
                                href={`/faturas/${invoice.id}`}
                                aria-label={`Ver fatura ${invoice.number}`}
                                className="inline-flex h-8 items-center whitespace-nowrap rounded-md border px-3 text-xs font-medium hover:bg-accent"
                              >
                                Ver fatura
                              </Link>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <ReportPagination
                    page={pagination.numero}
                    pageSize={pageSize}
                    total={invoices.length}
                    isFetching={query.isFetching}
                    onPageChange={setPage}
                    onPageSizeChange={(size) => {
                      setPageSize(size);
                      setPage(1);
                    }}
                    itemLabel="faturas"
                  />
                </CardContent>
              </Card>
            )}
          </>
        )
      )}
    </div>
  );
}
