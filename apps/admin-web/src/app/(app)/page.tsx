'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { DeliveryStatus } from '@motoboycity/types';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatCard } from '@/components/stat-card';
import {
  adminDriversApi,
  adminFinancialApi,
  adminInvoicesApi,
  deliveriesApi,
} from '@/lib/api-client';
import { session } from '@/lib/session';

const currencyFormatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const dateFormatter = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

const operationalSections: Array<{ status: DeliveryStatus; label: string }> = [
  { status: 'AWAITING_DRIVER', label: 'Aguardando entregador' },
  { status: 'ACCEPTED', label: 'Aceitos' },
  { status: 'COLLECTED', label: 'Coletados' },
  { status: 'DELIVERED', label: 'Aguardando retorno' },
];

function formatCurrency(value: number): string {
  return currencyFormatter.format(value);
}

export default function AdminDashboardPage() {
  const token = session.getToken();
  const deliveriesQuery = useQuery({
    queryKey: ['admin', 'dashboard', 'deliveries'],
    queryFn: () => deliveriesApi.list(token as string),
    enabled: Boolean(token),
  });
  const driversQuery = useQuery({
    queryKey: ['admin', 'dashboard', 'drivers'],
    queryFn: () => adminDriversApi.list(token as string),
    enabled: Boolean(token),
  });
  const financialQuery = useQuery({
    queryKey: ['admin', 'dashboard', 'financial'],
    queryFn: () => adminFinancialApi.overview(token as string),
    enabled: Boolean(token),
  });
  const invoicesQuery = useQuery({
    queryKey: ['admin', 'dashboard', 'invoices'],
    queryFn: () => adminInvoicesApi.list(token as string),
    enabled: Boolean(token),
  });

  const deliveries = useMemo(() => deliveriesQuery.data ?? [], [deliveriesQuery.data]);
  const drivers = driversQuery.data ?? [];
  const availableDrivers = drivers.filter(
    (driver) =>
      driver.approvalStatus === 'APPROVED' &&
      driver.accountStatus === 'ACTIVE' &&
      driver.availability === 'AVAILABLE',
  );
  const recentCompleted = useMemo(
    () => deliveries.filter((delivery) => delivery.status === 'COMPLETED').slice(0, 6),
    [deliveries],
  );
  const firstReceivable = (invoicesQuery.data ?? []).find(
    (invoice) => invoice.status === 'OVERDUE' || invoice.status === 'PENDING',
  );

  if (!token) {
    return (
      <p className="text-sm text-muted-foreground">
        Faça login como administrador para ver o dashboard.
      </p>
    );
  }

  const hasError =
    deliveriesQuery.isError ||
    driversQuery.isError ||
    financialQuery.isError ||
    invoicesQuery.isError;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Visão operacional</h1>
        <p className="text-sm text-muted-foreground">
          Pedidos, disponibilidade e financeiro calculados dos registros atuais.
        </p>
      </div>

      {hasError && (
        <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertCircle className="size-4" /> Parte dos dados não pôde ser atualizada. Use as telas
          de detalhe para investigar.
        </div>
      )}
      {firstReceivable && (
        <Card
          className={
            firstReceivable.status === 'OVERDUE'
              ? 'border-destructive/50 bg-destructive/5'
              : 'border-amber-300 bg-amber-50 dark:bg-amber-950/20'
          }
        >
          <CardContent className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
            <span>
              Fatura {firstReceivable.status === 'OVERDUE' ? 'vencida' : 'pendente'}:{' '}
              <strong>{firstReceivable.number}</strong> ·{' '}
              {formatCurrency(firstReceivable.totalValue)} · vencimento{' '}
              {firstReceivable.dueDate.slice(0, 10)}.
            </span>
            <Link
              className="font-medium text-primary underline-offset-4 hover:underline"
              href={`/faturas/${firstReceivable.id}`}
            >
              Ver fatura
            </Link>
          </CardContent>
        </Card>
      )}

      <section className="grid grid-cols-2 gap-4 xl:grid-cols-5">
        <StatCard
          label="Pedidos ativos"
          value={String(
            deliveries.filter((delivery) => !['COMPLETED', 'CANCELLED'].includes(delivery.status))
              .length,
          )}
        />
        <StatCard
          label="Concluídos"
          value={String(financialQuery.data?.completedDeliveries.count ?? 0)}
        />
        <StatCard
          label="Receita da plataforma"
          value={formatCurrency(financialQuery.data?.completedDeliveries.platformValue ?? 0)}
        />
        <StatCard
          label="Saldo a liberar"
          value={formatCurrency(financialQuery.data?.driverWallets.blockedBalance ?? 0)}
        />
        <StatCard label="Entregadores disponíveis" value={String(availableDrivers.length)} />
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="grid gap-4 md:grid-cols-2">
          {operationalSections.map((section) => {
            const orders = deliveries.filter((delivery) => delivery.status === section.status);
            return (
              <Card key={section.status}>
                <CardHeader className="flex-row items-center justify-between py-3">
                  <CardTitle className="text-sm font-medium">
                    {section.label} <Badge variant="secondary">{orders.length}</Badge>
                  </CardTitle>
                  <Link
                    className="text-xs text-primary underline-offset-4 hover:underline"
                    href="/pedidos"
                  >
                    Ver pedidos
                  </Link>
                </CardHeader>
                <CardContent className="space-y-2 pt-0">
                  {orders.length === 0 ? (
                    <p className="py-2 text-sm text-muted-foreground">
                      Nenhum pedido neste status.
                    </p>
                  ) : (
                    orders.slice(0, 5).map((order) => (
                      <Link
                        key={order.id}
                        href={`/pedidos/${order.id}`}
                        className="block rounded-md border p-3 text-sm transition-colors hover:bg-accent"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium">
                            #{order.displayNumber} · {order.companyName}
                          </span>
                          <span>{formatCurrency(order.totalValue ?? 0)}</span>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {order.serviceTypeName} ·{' '}
                          {order.distanceKm === null
                            ? 'distância pendente'
                            : `${order.distanceKm} km`}
                        </p>
                      </Link>
                    ))
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
        <Card>
          <CardHeader className="flex-row items-center justify-between py-3">
            <CardTitle className="text-sm font-medium">Disponibilidade registrada</CardTitle>
            <RefreshCw className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="space-y-2 pt-0">
            <p className="text-xs text-muted-foreground">
              Não é a fila em tempo real; mostra quem se declarou disponível no app.
            </p>
            {availableDrivers.length === 0 ? (
              <p className="py-2 text-sm text-muted-foreground">Nenhum entregador disponível.</p>
            ) : (
              availableDrivers.slice(0, 8).map((driver) => (
                <Link
                  key={driver.id}
                  className="flex items-center justify-between rounded-md border p-2 text-sm hover:bg-accent"
                  href={`/entregadores/${driver.id}`}
                >
                  <span>{driver.name}</span>
                  <Badge variant="secondary">Disponível</Badge>
                </Link>
              ))
            )}
          </CardContent>
        </Card>
      </section>

      <section>
        <Card>
          <CardHeader className="flex-row items-center justify-between py-3">
            <CardTitle className="text-sm font-medium">
              Concluídos recentemente <Badge variant="secondary">{recentCompleted.length}</Badge>
            </CardTitle>
            <Link
              className="text-xs text-primary underline-offset-4 hover:underline"
              href="/pedidos"
            >
              Ver histórico
            </Link>
          </CardHeader>
          <CardContent className="grid gap-2 md:grid-cols-2 xl:grid-cols-3 pt-0">
            {recentCompleted.length === 0 ? (
              <p className="py-2 text-sm text-muted-foreground">Nenhuma entrega concluída.</p>
            ) : (
              recentCompleted.map((order) => (
                <Link
                  key={order.id}
                  href={`/pedidos/${order.id}`}
                  className="rounded-md border p-3 text-sm hover:bg-accent"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium">#{order.displayNumber}</span>
                    <span>{formatCurrency(order.totalValue ?? 0)}</span>
                  </div>
                  <p className="mt-1 text-muted-foreground">
                    {order.companyName} · {dateFormatter.format(new Date(order.statusChangedAt))}
                  </p>
                </Link>
              ))
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
