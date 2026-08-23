'use client';

import Link from 'next/link';
import { use, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { DeliveryStatus, InvoiceStatus } from '@motoboycity/types';
import { AlertCircle, ChevronLeft } from 'lucide-react';
import { StatusChip, STATUS_OPTIONS } from '@/components/orders/status-chip';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatCard } from '@/components/stat-card';
import { adminCompaniesApi, adminInvoicesApi, deliveriesApi } from '@/lib/api-client';
import { session } from '@/lib/session';
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

function formatDate(value: string | null): string {
  return value ? dateFormatter.format(new Date(value)) : '—';
}

export default function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const money = useMoney();
  const { id: companyId } = use(params);
  const token = session.getToken();
  const [orderStatus, setOrderStatus] = useState<DeliveryStatus | 'ALL'>('ALL');
  const [invoiceStatus, setInvoiceStatus] = useState<InvoiceStatus | 'ALL'>('ALL');

  const companyQuery = useQuery({
    queryKey: ['admin', 'company', companyId],
    queryFn: () => adminCompaniesApi.detail(token as string, companyId),
    enabled: Boolean(token),
  });
  const allOrdersQuery = useQuery({
    queryKey: ['admin', 'company-deliveries', companyId],
    queryFn: () => deliveriesApi.list(token as string, { companyId }),
    enabled: Boolean(token),
  });
  const ordersQuery = useQuery({
    queryKey: ['admin', 'company-deliveries', companyId, orderStatus],
    queryFn: () =>
      deliveriesApi.list(token as string, {
        companyId,
        ...(orderStatus !== 'ALL' && { status: orderStatus }),
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

  const deliveryStats = useMemo(() => {
    const deliveries = allOrdersQuery.data ?? [];
    const completed = deliveries.filter((delivery) => delivery.status === 'COMPLETED');
    return {
      total: deliveries.length,
      completed: completed.length,
      cancelled: deliveries.filter((delivery) => delivery.status === 'CANCELLED').length,
      totalValue: deliveries.reduce((sum, delivery) => sum + (delivery.totalValue ?? 0), 0),
      platformValue: completed.reduce((sum, delivery) => sum + (delivery.platformValue ?? 0), 0),
    };
  }, [allOrdersQuery.data]);

  const invoiceStats = useMemo(() => {
    const invoices = invoicesQuery.data ?? [];
    return {
      total: invoices.reduce((sum, invoice) => sum + invoice.totalValue, 0),
      receivable: invoices
        .filter((invoice) => invoice.status === 'PENDING' || invoice.status === 'OVERDUE')
        .reduce((sum, invoice) => sum + invoice.totalValue, 0),
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
  const orders = ordersQuery.data ?? [];
  const invoices = invoicesQuery.data ?? [];

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
          </header>

          <section className="grid grid-cols-2 gap-4 xl:grid-cols-5">
            <StatCard label="Pedidos" value={String(deliveryStats.total)} />
            <StatCard label="Concluídos" value={String(deliveryStats.completed)} />
            <StatCard label="Cancelados" value={String(deliveryStats.cancelled)} />
            <StatCard label="Valor dos pedidos" value={money(deliveryStats.totalValue)} />
            <StatCard label="Faturas em aberto" value={money(invoiceStats.receivable)} />
          </section>

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
                <StatCard label="Total faturado no filtro" value={money(invoiceStats.total)} />
                <StatCard
                  label="Receita da plataforma"
                  value={money(deliveryStats.platformValue)}
                />
                <StatCard label="Faturas encontradas" value={String(invoices.length)} />
              </CardContent>
            </Card>
          </section>

          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold">Pedidos do cliente</h2>
                <p className="text-sm text-muted-foreground">Entregas vinculadas a esta empresa.</p>
              </div>
              <select
                aria-label="Filtrar pedidos do cliente"
                className="h-9 rounded-md border bg-background px-3 text-sm"
                value={orderStatus}
                onChange={(event) => setOrderStatus(event.target.value as DeliveryStatus | 'ALL')}
              >
                <option value="ALL">Todos os status</option>
                {STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
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
              <div className="space-y-2">
                {orders.map((delivery) => (
                  <Card key={delivery.id}>
                    <CardContent className="flex flex-wrap items-center justify-between gap-3 py-3">
                      <div>
                        <p className="font-medium">
                          #{delivery.displayNumber} · {delivery.serviceTypeName}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {formatDate(delivery.createdAt)} ·{' '}
                          {delivery.distanceKm === null
                            ? 'distância não calculada'
                            : `${delivery.distanceKm} km`}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <StatusChip status={delivery.status} />
                          <p className="mt-1 text-sm font-medium">{money(delivery.totalValue)}</p>
                        </div>
                        <Link
                          className="inline-flex h-8 items-center rounded-md border px-3 text-xs font-medium hover:bg-accent"
                          href={`/pedidos/${delivery.id}`}
                        >
                          Ver detalhes
                        </Link>
                      </div>
                    </CardContent>
                  </Card>
                ))}
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
                {company.addresses.length === 0 ? (
                  <p className="text-muted-foreground">Nenhum endereço cadastrado.</p>
                ) : (
                  company.addresses.map((address) => (
                    <div key={address.id} className="rounded-md border p-3">
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{address.label ?? 'Sem rótulo'}</p>
                        {address.isPrimary && <Badge>Coleta principal</Badge>}
                      </div>
                      <p>
                        {address.street}, {address.number}
                        {address.complement ? ` · ${address.complement}` : ''}
                      </p>
                      <p className="text-muted-foreground">
                        {address.city} - {address.state} · {address.zip}
                      </p>
                      {address.lat !== null && (
                        <p className="text-xs text-muted-foreground">
                          GPS: {address.lat}, {address.lng}
                        </p>
                      )}
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Equipe vinculada</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {company.teamMembers.length === 0 ? (
                  <p className="text-muted-foreground">Nenhum membro cadastrado.</p>
                ) : (
                  company.teamMembers.map((member) => (
                    <div
                      key={member.id}
                      className="flex items-start justify-between gap-2 rounded-md border p-3"
                    >
                      <div>
                        <p className="font-medium">{member.user.name}</p>
                        <p className="text-muted-foreground">
                          {member.user.email} · {member.user.phone}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Entrou em {formatDate(member.joinedAt)}
                        </p>
                      </div>
                      <Badge variant={member.active ? 'secondary' : 'destructive'}>
                        {member.role === 'OWNER' ? 'Responsável' : 'Operador'} ·{' '}
                        {member.active ? 'ativo' : 'inativo'}
                      </Badge>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </section>
        </>
      )}
    </div>
  );
}
