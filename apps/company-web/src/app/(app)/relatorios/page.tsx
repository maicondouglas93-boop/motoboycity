'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { DeliveryStatus, InvoiceStatus } from '@motoboycity/types';
import { AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { StatCard } from '@/components/stat-card';
import { companyInvoicesApi, deliveriesApi } from '@/lib/api-client';
import { session } from '@/lib/session';

const currencyFormatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

const invoiceStatusLabel: Record<InvoiceStatus, string> = {
  PENDING: 'Pendente',
  PAID: 'Paga',
  OVERDUE: 'Vencida',
  CANCELLED: 'Cancelada',
};

const deliveryStatusLabel: Record<DeliveryStatus, string> = {
  SCHEDULED: 'Agendado',
  AWAITING_DRIVER: 'Buscando entregador',
  ACCEPTED: 'Aceito',
  COLLECTED: 'Coletado',
  DELIVERED: 'Entregue',
  COMPLETED: 'Concluído',
  CANCELLED: 'Cancelado',
  AWAITING_PAYMENT: 'Aguardando pagamento',
};

function formatCurrency(value: number | null): string {
  return value === null ? 'A calcular na entrega' : currencyFormatter.format(value);
}

export default function CompanyReportsPage() {
  const token = session.getToken();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [invoiceStatus, setInvoiceStatus] = useState<InvoiceStatus | 'ALL'>('ALL');
  const [filterError, setFilterError] = useState<string | null>(null);
  const [appliedFilters, setAppliedFilters] = useState<{ from?: string; to?: string }>({});
  const [appliedInvoiceStatus, setAppliedInvoiceStatus] = useState<InvoiceStatus | 'ALL'>('ALL');
  const deliveriesQuery = useQuery({
    queryKey: ['company', 'report-deliveries', appliedFilters],
    queryFn: () => deliveriesApi.list(token as string, appliedFilters),
    enabled: Boolean(token),
  });
  const invoicesQuery = useQuery({
    queryKey: ['company', 'report-invoices', appliedFilters, appliedInvoiceStatus],
    queryFn: () =>
      companyInvoicesApi.list(token as string, {
        ...appliedFilters,
        ...(appliedInvoiceStatus !== 'ALL' && { status: appliedInvoiceStatus }),
      }),
    enabled: Boolean(token),
  });

  const summary = useMemo(() => {
    const deliveries = deliveriesQuery.data ?? [];
    const invoices = invoicesQuery.data ?? [];
    const completed = deliveries.filter((delivery) => delivery.status === 'COMPLETED');
    return {
      deliveries: deliveries.length,
      completed: completed.length,
      cancelled: deliveries.filter((delivery) => delivery.status === 'CANCELLED').length,
      completedValue: completed.reduce((sum, delivery) => sum + (delivery.totalValue ?? 0), 0),
      invoices: invoices.length,
      invoicedValue: invoices.reduce((sum, invoice) => sum + invoice.totalValue, 0),
      receivable: invoices
        .filter((invoice) => invoice.status === 'PENDING' || invoice.status === 'OVERDUE')
        .reduce((sum, invoice) => sum + invoice.totalValue, 0),
    };
  }, [deliveriesQuery.data, invoicesQuery.data]);

  if (!token) {
    return (
      <p className="text-sm text-muted-foreground">Faça login para consultar os relatórios.</p>
    );
  }

  const deliveries = deliveriesQuery.data ?? [];
  const invoices = invoicesQuery.data ?? [];
  const loading = deliveriesQuery.isLoading || invoicesQuery.isLoading;
  const hasError = deliveriesQuery.isError || invoicesQuery.isError;

  function applyFilters() {
    if (from && to && from > to) {
      setFilterError('A data inicial não pode ser posterior à data final.');
      return;
    }
    setFilterError(null);
    setAppliedFilters({ ...(from && { from }), ...(to && { to }) });
    setAppliedInvoiceStatus(invoiceStatus);
  }

  function clearFilters() {
    setFrom('');
    setTo('');
    setInvoiceStatus('ALL');
    setFilterError(null);
    setAppliedFilters({});
    setAppliedInvoiceStatus('ALL');
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Relatório de pedidos e faturamento</h1>
        <p className="text-sm text-muted-foreground">
          Consulte os registros reais da empresa por período e estado de cobrança.
        </p>
      </div>
      <Card>
        <CardContent className="flex flex-wrap items-end gap-4 pt-6">
          <div className="space-y-1">
            <Label htmlFor="report-from">A partir de</Label>
            <Input
              id="report-from"
              type="date"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="report-to">Até</Label>
            <Input
              id="report-to"
              type="date"
              value={to}
              onChange={(event) => setTo(event.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="invoice-status">Status da fatura</Label>
            <select
              id="invoice-status"
              className="block h-9 rounded-md border bg-background px-3 text-sm"
              value={invoiceStatus}
              onChange={(event) => setInvoiceStatus(event.target.value as InvoiceStatus | 'ALL')}
            >
              <option value="ALL">Todos</option>
              {Object.entries(invoiceStatusLabel).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <Button onClick={applyFilters}>Aplicar filtros</Button>
          <Button variant="outline" onClick={clearFilters}>
            Limpar
          </Button>
          {filterError && <p className="text-sm text-destructive">{filterError}</p>}
        </CardContent>
      </Card>

      {loading && <p className="text-sm text-muted-foreground">Montando relatório...</p>}
      {hasError && (
        <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertCircle className="size-4" /> Não foi possível carregar este relatório.
        </div>
      )}

      {!loading && !hasError && (
        <>
          <section className="grid grid-cols-2 gap-4 xl:grid-cols-4">
            <StatCard label="Pedidos" value={String(summary.deliveries)} />
            <StatCard label="Concluídos" value={String(summary.completed)} />
            <StatCard label="Cancelados" value={String(summary.cancelled)} />
            <StatCard label="Valor concluído" value={formatCurrency(summary.completedValue)} />
          </section>
          <section className="grid grid-cols-2 gap-4 xl:grid-cols-3">
            <StatCard label="Faturas no filtro" value={String(summary.invoices)} />
            <StatCard label="Total faturado" value={formatCurrency(summary.invoicedValue)} />
            <StatCard label="A pagar" value={formatCurrency(summary.receivable)} />
          </section>
          <section className="space-y-3">
            <div>
              <h2 className="font-semibold">Faturas</h2>
              <p className="text-sm text-muted-foreground">
                Cada item abre os pedidos, valores e histórico de cobrança.
              </p>
            </div>
            <Card>
              <CardContent className="p-0">
                {invoices.length === 0 ? (
                  <p className="p-8 text-center text-sm text-muted-foreground">
                    Nenhuma fatura neste filtro.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Número</TableHead>
                        <TableHead>Emissão</TableHead>
                        <TableHead>Vencimento</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Pedidos</TableHead>
                        <TableHead>Valor</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {invoices.map((invoice) => (
                        <TableRow key={invoice.id}>
                          <TableCell>
                            <Link
                              className="font-medium text-primary underline-offset-4 hover:underline"
                              href={`/faturas/${invoice.id}`}
                            >
                              {invoice.number}
                            </Link>
                          </TableCell>
                          <TableCell>{invoice.issueDate.slice(0, 10)}</TableCell>
                          <TableCell>{invoice.dueDate.slice(0, 10)}</TableCell>
                          <TableCell>{invoiceStatusLabel[invoice.status]}</TableCell>
                          <TableCell>{invoice.deliveryCount}</TableCell>
                          <TableCell>{formatCurrency(invoice.totalValue)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </section>
          <section className="space-y-3">
            <div>
              <h2 className="font-semibold">Pedidos no período</h2>
              <p className="text-sm text-muted-foreground">
                Abra o detalhe para acompanhar o histórico operacional.
              </p>
            </div>
            <Card>
              <CardContent className="p-0">
                {deliveries.length === 0 ? (
                  <p className="p-8 text-center text-sm text-muted-foreground">
                    Nenhum pedido neste período.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Pedido</TableHead>
                        <TableHead>Modalidade</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Distância</TableHead>
                        <TableHead>Valor</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {deliveries.map((delivery) => (
                        <TableRow key={delivery.id}>
                          <TableCell>
                            <Link
                              className="font-medium text-primary underline-offset-4 hover:underline"
                              href={`/pedidos/${delivery.id}`}
                            >
                              #{delivery.displayNumber}
                            </Link>
                          </TableCell>
                          <TableCell>{delivery.serviceTypeName}</TableCell>
                          <TableCell>{deliveryStatusLabel[delivery.status]}</TableCell>
                          <TableCell>
                            {delivery.distanceKm === null
                              ? 'A calcular'
                              : `${delivery.distanceKm} km`}
                          </TableCell>
                          <TableCell>{formatCurrency(delivery.totalValue)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </section>
        </>
      )}
    </div>
  );
}
