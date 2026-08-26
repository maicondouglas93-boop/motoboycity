'use client';

import Link from 'next/link';
import { use, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { DeliveryStatus, InvoiceStatus } from '@motoboycity/types';
import {
  AlertCircle,
  ArrowUpRight,
  Bike,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  MapPin,
  WalletCards,
} from 'lucide-react';
import { StatusChip, STATUS_OPTIONS, statusRailClass } from '@/components/orders/status-chip';
import { CompanyStatusDialog } from '@/components/companies/company-status-dialog';
import { EditCompanyDialog } from '@/components/companies/edit-company-dialog';
import {
  CompanyAddressesManager,
  CompanyMembersManager,
} from '@/components/companies/company-related-records';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { QueryState } from '@/components/ui/query-state';
import { StatCard } from '@/components/stat-card';
import { adminCompaniesApi, adminInvoicesApi, deliveriesApi } from '@/lib/api-client';
import { session } from '@/lib/session';
import { somarDinheiro } from '@/lib/dinheiro';
import { useMoney } from '@/lib/money';

const dateFormatter = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

const companyStatusLabel: Record<string, string> = {
  PENDING_APPROVAL: 'Pendente de aprovação',
  ACTIVE: 'Ativa',
  SUSPENDED: 'Suspensa',
};

const invoiceStatusLabel: Record<InvoiceStatus, string> = {
  PENDING: 'Pendente',
  PAID: 'Paga',
  OVERDUE: 'Vencida',
  CANCELLED: 'Cancelada',
};

const ORDER_PAGE_SIZES = [10, 25, 50] as const;

function formatDate(value: string | null): string {
  return value ? dateFormatter.format(new Date(value)) : '—';
}

export default function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const money = useMoney();
  const { id: companyId } = use(params);
  const token = session.getToken();
  const [orderStatus, setOrderStatus] = useState<DeliveryStatus | 'ALL'>('ALL');
  const [orderPage, setOrderPage] = useState(1);
  const [orderPageSize, setOrderPageSize] = useState<number>(ORDER_PAGE_SIZES[0]);
  const [invoiceStatus, setInvoiceStatus] = useState<InvoiceStatus | 'ALL'>('ALL');

  const companyQuery = useQuery({
    queryKey: ['admin', 'company', companyId],
    queryFn: () => adminCompaniesApi.detail(token as string, companyId),
    enabled: Boolean(token),
  });
  const deliverySummaryQuery = useQuery({
    queryKey: ['admin', 'company-deliveries', 'summary', companyId],
    queryFn: () => deliveriesApi.summary(token as string, { companyId }),
    enabled: Boolean(token),
  });
  const ordersQuery = useQuery({
    queryKey: [
      'admin',
      'company-deliveries',
      'paged',
      companyId,
      orderStatus,
      orderPage,
      orderPageSize,
    ],
    queryFn: () =>
      deliveriesApi.search(token as string, {
        companyId,
        ...(orderStatus !== 'ALL' && { status: orderStatus }),
        page: orderPage,
        pageSize: orderPageSize,
      }),
    enabled: Boolean(token),
  });
  const invoicesQuery = useQuery({
    queryKey: ['admin', 'company-invoices', companyId, invoiceStatus],
    queryFn: () =>
      adminInvoicesApi.list(token as string, {
        companyId,
        ...(invoiceStatus !== 'ALL' && { status: invoiceStatus }),
      }),
    enabled: Boolean(token),
  });

  const totalOrders = ordersQuery.data?.total ?? 0;
  const totalOrderPages = Math.max(1, Math.ceil(totalOrders / orderPageSize));

  const invoiceStats = useMemo(() => {
    const invoices = invoicesQuery.data;
    if (!invoices) return null;
    return {
      total: somarDinheiro(invoices.map((invoice) => invoice.totalValue)),
      receivable: somarDinheiro(
        invoices
          .filter((invoice) => invoice.status === 'PENDING' || invoice.status === 'OVERDUE')
          .map((invoice) => invoice.totalValue),
      ),
    };
  }, [invoicesQuery.data]);

  if (!token) {
    return (
      <p className="text-sm text-muted-foreground">
        Faça login como administrador para ver o cliente.
      </p>
    );
  }

  const company = companyQuery.data;
  const deliverySummary = deliverySummaryQuery.data;
  const orders = ordersQuery.data?.items ?? [];
  const invoices = invoicesQuery.data ?? [];
  const firstVisibleOrder = totalOrders === 0 ? 0 : (orderPage - 1) * orderPageSize + 1;
  const lastVisibleOrder = Math.min(orderPage * orderPageSize, totalOrders);

  return (
    <div className="space-y-6">
      <Link
        href="/clientes"
        className="flex w-fit items-center gap-1 text-sm text-muted-foreground"
      >
        <ChevronLeft className="size-4" /> Voltar para clientes
      </Link>

      {companyQuery.isLoading && (
        <p className="text-sm text-muted-foreground">Carregando cliente...</p>
      )}
      {companyQuery.isError && (
        <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertCircle className="size-4" /> Não foi possível carregar este cliente.
        </div>
      )}

      {company && (
        <>
          <header className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-xl font-semibold">{company.tradeName}</h1>
              <p className="text-sm text-muted-foreground">
                {company.legalName} · {company.document}
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Badge
                variant={
                  company.status === 'ACTIVE'
                    ? 'default'
                    : company.status === 'SUSPENDED'
                      ? 'destructive'
                      : 'outline'
                }
              >
                {companyStatusLabel[company.status] ?? company.status}
              </Badge>
              <EditCompanyDialog company={company} token={token} />
              <CompanyStatusDialog company={company} token={token} />
            </div>
          </header>

          <section className="grid grid-cols-2 gap-4 xl:grid-cols-5">
            <StatCard
              label="Pedidos"
              value={deliverySummary ? String(deliverySummary.totalCount) : '—'}
            />
            <StatCard
              label="Concluídos"
              value={deliverySummary ? String(deliverySummary.counts.COMPLETED ?? 0) : '—'}
            />
            <StatCard
              label="Cancelados"
              value={deliverySummary ? String(deliverySummary.counts.CANCELLED ?? 0) : '—'}
            />
            <StatCard
              label="Valor dos pedidos"
              value={deliverySummary ? money(deliverySummary.totalValue) : '—'}
            />
            <StatCard
              label="Faturas em aberto"
              value={invoiceStats ? money(invoiceStats.receivable) : '—'}
            />
          </section>

          {deliverySummaryQuery.isError && (
            <QueryState
              compact
              kind="error"
              title="Resumo dos pedidos indisponível"
              description="Os indicadores foram ocultados para não parecerem zerados por engano."
              onAction={() => void deliverySummaryQuery.refetch()}
            />
          )}

          <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
            <Card>
              <CardHeader>
                <CardTitle>Cadastro</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div>
                  <p className="text-muted-foreground">Praça de operação</p>
                  <p>{company.region.name}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Cadastrado em</p>
                  <p>{formatDate(company.createdAt)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Aprovação</p>
                  <p>
                    {company.approvedBy
                      ? `${company.approvedBy.name} · ${formatDate(company.approvedAt)}`
                      : 'Ainda não aprovada'}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Responsável</p>
                  <p>
                    {company.owner
                      ? `${company.owner.name} · ${company.owner.email}`
                      : 'Não identificado'}
                  </p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Conferência financeira</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                <StatCard
                  label="Total faturado no filtro"
                  value={invoiceStats ? money(invoiceStats.total) : '—'}
                />
                <StatCard
                  label="Receita da plataforma"
                  value={deliverySummary ? money(deliverySummary.completedPlatformValue) : '—'}
                />
                <StatCard
                  label="Faturas encontradas"
                  value={invoiceStats ? String(invoices.length) : '—'}
                />
              </CardContent>
            </Card>
          </section>

          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold">Pedidos do cliente</h2>
                <p className="text-sm text-muted-foreground">Entregas vinculadas a esta empresa.</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  aria-label="Filtrar pedidos do cliente"
                  className="h-9 rounded-md border bg-background px-3 text-sm"
                  value={orderStatus}
                  onChange={(event) => {
                    setOrderStatus(event.target.value as DeliveryStatus | 'ALL');
                    setOrderPage(1);
                  }}
                >
                  <option value="ALL">Todos os status</option>
                  {STATUS_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <select
                  aria-label="Pedidos por página"
                  className="h-9 rounded-md border bg-background px-3 text-sm"
                  value={orderPageSize}
                  onChange={(event) => {
                    setOrderPageSize(Number(event.target.value));
                    setOrderPage(1);
                  }}
                >
                  {ORDER_PAGE_SIZES.map((pageSize) => (
                    <option key={pageSize} value={pageSize}>
                      {pageSize} por página
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {ordersQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">Carregando pedidos...</p>
            ) : ordersQuery.isError ? (
              <p className="text-sm text-destructive">Não foi possível carregar os pedidos.</p>
            ) : orders.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-sm text-muted-foreground">
                  Nenhum pedido neste filtro.
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                <div
                  className="grid items-stretch gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 min-[1800px]:grid-cols-7"
                  aria-busy={ordersQuery.isFetching}
                >
                  {orders.map((delivery) => (
                    <Card
                      key={delivery.id}
                      size="sm"
                      className="h-full min-w-0 border-primary/15 bg-gradient-to-br from-card via-card to-admin-soft/35"
                    >
                      <span
                        aria-hidden="true"
                        className={`absolute inset-y-0 left-0 w-1 ${statusRailClass(delivery.status)}`}
                      />
                      <CardContent className="flex h-full min-w-0 flex-col gap-3 pl-4">
                        <div className="flex min-w-0 items-start justify-between gap-2">
                          <span className="rounded-md bg-admin-soft px-2 py-1 text-[11px] font-bold tracking-wide text-admin-deep">
                            #{delivery.displayNumber}
                          </span>
                          <StatusChip
                            status={delivery.status}
                            className="max-w-full px-2 py-1 text-[10px]"
                          />
                        </div>

                        <div className="min-w-0 space-y-1">
                          <p className="flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
                            <Bike className="size-3 text-primary" aria-hidden="true" /> Modalidade
                          </p>
                          <p
                            className="truncate text-sm font-semibold text-admin-deep"
                            title={delivery.serviceTypeName}
                          >
                            {delivery.serviceTypeName}
                          </p>
                        </div>

                        <div className="space-y-2 border-y border-primary/10 py-3 text-xs text-muted-foreground">
                          <p className="flex items-center gap-2">
                            <CalendarDays
                              className="size-3.5 shrink-0 text-primary"
                              aria-hidden="true"
                            />
                            <span className="truncate" title={formatDate(delivery.createdAt)}>
                              {formatDate(delivery.createdAt)}
                            </span>
                          </p>
                          <p className="flex items-center gap-2">
                            <MapPin className="size-3.5 shrink-0 text-primary" aria-hidden="true" />
                            {delivery.distanceKm === null
                              ? 'Distância pendente'
                              : `${delivery.distanceKm} km`}
                          </p>
                        </div>

                        <div className="mt-auto rounded-xl bg-admin-soft/70 p-2.5 ring-1 ring-inset ring-primary/10">
                          <p className="flex items-center gap-1.5 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
                            <WalletCards className="size-3 text-primary" aria-hidden="true" /> Valor
                          </p>
                          <p className="mt-1 text-sm font-bold text-admin-deep">
                            {money(delivery.totalValue)}
                          </p>
                        </div>

                        <Link
                          className="inline-flex h-8 min-w-0 items-center justify-center gap-1 rounded-lg border border-primary/15 bg-card px-2 text-xs font-semibold text-primary shadow-sm transition-colors hover:bg-admin-soft"
                          href={`/pedidos/${delivery.id}`}
                        >
                          Ver detalhes
                          <ArrowUpRight className="size-3" aria-hidden="true" />
                        </Link>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/70 bg-card/70 px-4 py-3 text-sm">
                  <p className="text-muted-foreground" aria-live="polite">
                    Mostrando {firstVisibleOrder}–{lastVisibleOrder} de {totalOrders} pedidos
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setOrderPage((current) => Math.max(1, current - 1))}
                      disabled={orderPage <= 1 || ordersQuery.isFetching}
                    >
                      <ChevronLeft data-icon="inline-start" aria-hidden="true" />
                      Anterior
                    </Button>
                    <span className="min-w-24 text-center text-xs font-medium text-admin-deep">
                      Página {orderPage} de {totalOrderPages}
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        setOrderPage((current) => Math.min(totalOrderPages, current + 1))
                      }
                      disabled={orderPage >= totalOrderPages || ordersQuery.isFetching}
                    >
                      Próxima
                      <ChevronRight data-icon="inline-end" aria-hidden="true" />
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </section>

          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold">Faturas</h2>
                <p className="text-sm text-muted-foreground">
                  Ciclo de cobrança auditável deste cliente.
                </p>
              </div>
              <select
                aria-label="Filtrar faturas do cliente"
                className="h-9 rounded-md border bg-background px-3 text-sm"
                value={invoiceStatus}
                onChange={(event) => setInvoiceStatus(event.target.value as InvoiceStatus | 'ALL')}
              >
                <option value="ALL">Todos os status</option>
                {Object.entries(invoiceStatusLabel).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            {invoicesQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">Carregando faturas...</p>
            ) : invoicesQuery.isError ? (
              <p className="text-sm text-destructive">Não foi possível carregar as faturas.</p>
            ) : invoices.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-sm text-muted-foreground">
                  Nenhuma fatura neste filtro.
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {invoices.map((invoice) => (
                  <Card key={invoice.id}>
                    <CardContent className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                      <div>
                        <p className="font-medium">{invoice.number}</p>
                        <p className="text-muted-foreground">
                          Emissão: {formatDate(invoice.issueDate)} · Vencimento:{' '}
                          {formatDate(invoice.dueDate)} · {invoice.deliveryCount} pedido(s)
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <Badge
                            variant={invoice.status === 'OVERDUE' ? 'destructive' : 'secondary'}
                          >
                            {invoiceStatusLabel[invoice.status]}
                          </Badge>
                          <p className="mt-1 font-medium">{money(invoice.totalValue)}</p>
                        </div>
                        <Link
                          className="inline-flex h-8 items-center rounded-md border px-3 text-xs font-medium hover:bg-accent"
                          href={`/faturas/${invoice.id}`}
                        >
                          Ver fatura
                        </Link>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Endereços cadastrados</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <CompanyAddressesManager company={company} token={token} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Equipe vinculada</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <CompanyMembersManager company={company} token={token} />
              </CardContent>
            </Card>
          </section>
        </>
      )}
    </div>
  );
}
