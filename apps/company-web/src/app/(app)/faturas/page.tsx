'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { InvoiceStatus } from '@motoboycity/types';
import { Receipt } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
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
import { companyInvoicesApi } from '@/lib/api-client';
import { session } from '@/lib/session';

const currencyFormatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const dateFormatter = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium' });

const STATUS_LABEL: Record<InvoiceStatus, string> = {
  PENDING: 'Pendente',
  PAID: 'Paga',
  OVERDUE: 'Vencida',
  CANCELLED: 'Cancelada',
};

const STATUS_VARIANT: Record<InvoiceStatus, 'outline' | 'secondary' | 'destructive'> = {
  PENDING: 'outline',
  PAID: 'secondary',
  OVERDUE: 'destructive',
  CANCELLED: 'destructive',
};

export default function CompanyInvoicesPage() {
  const token = session.getToken();
  const [status, setStatus] = useState<InvoiceStatus | 'ALL'>('ALL');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [appliedFilters, setAppliedFilters] = useState<{
    status?: InvoiceStatus;
    from?: string;
    to?: string;
  }>({});

  const invoicesQuery = useQuery({
    queryKey: ['company', 'invoices', appliedFilters],
    queryFn: () => companyInvoicesApi.list(token as string, appliedFilters),
    enabled: Boolean(token),
  });

  if (!token) {
    return (
      <p className="text-sm text-muted-foreground">
        Faça login para consultar as faturas da empresa.
      </p>
    );
  }

  const invoices = invoicesQuery.data ?? [];

  function applyFilters() {
    setAppliedFilters({
      ...(status !== 'ALL' && { status }),
      ...(from && { from }),
      ...(to && { to }),
    });
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold">Faturas</h1>
        <p className="text-sm text-muted-foreground">
          Consulte valores, pedidos incluídos, vencimento e histórico de cada fechamento.
        </p>
      </div>

      <Card className="premium-panel">
        <CardContent className="flex flex-wrap items-end gap-3 pt-6">
          <div className="space-y-1">
            <Label htmlFor="invoice-status">Status</Label>
            <select
              id="invoice-status"
              className="h-9 rounded-lg border border-input bg-card/90 px-3 text-sm shadow-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/15"
              value={status}
              onChange={(event) => setStatus(event.target.value as InvoiceStatus | 'ALL')}
            >
              <option value="ALL">Todos os status</option>
              <option value="PENDING">Pendentes</option>
              <option value="PAID">Pagas</option>
              <option value="OVERDUE">Vencidas</option>
              <option value="CANCELLED">Canceladas</option>
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="invoice-from">Emissão a partir de</Label>
            <Input
              id="invoice-from"
              type="date"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="invoice-to">Emissão até</Label>
            <Input
              id="invoice-to"
              type="date"
              value={to}
              onChange={(event) => setTo(event.target.value)}
            />
          </div>
          <Button onClick={applyFilters}>Aplicar filtros</Button>
          <Button
            variant="outline"
            onClick={() => {
              setStatus('ALL');
              setFrom('');
              setTo('');
              setAppliedFilters({});
            }}
          >
            Limpar
          </Button>
        </CardContent>
      </Card>

      {invoicesQuery.isLoading && (
        <p className="text-sm text-muted-foreground">Carregando faturas...</p>
      )}
      {invoicesQuery.isError && (
        <p className="text-sm text-destructive">
          Não foi possível carregar as faturas. Tente novamente.
        </p>
      )}

      <Card className="premium-panel">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Número</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Emissão</TableHead>
                <TableHead>Vencimento</TableHead>
                <TableHead>Pedidos</TableHead>
                <TableHead>Valor total</TableHead>
                <TableHead>Pagamento</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.length === 0 && !invoicesQuery.isLoading ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-12 text-center text-muted-foreground">
                    <div className="flex flex-col items-center gap-2">
                      <Receipt className="size-8" />
                      Nenhuma fatura encontrada para os filtros informados.
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                invoices.map((invoice) => (
                  <TableRow key={invoice.id}>
                    <TableCell className="font-medium">{invoice.number}</TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[invoice.status]}>
                        {STATUS_LABEL[invoice.status]}
                      </Badge>
                    </TableCell>
                    <TableCell>{dateFormatter.format(new Date(invoice.issueDate))}</TableCell>
                    <TableCell>{dateFormatter.format(new Date(invoice.dueDate))}</TableCell>
                    <TableCell>{invoice.deliveryCount}</TableCell>
                    <TableCell className="font-medium">
                      {currencyFormatter.format(invoice.totalValue)}
                    </TableCell>
                    <TableCell>
                      {invoice.paymentDate
                        ? `${dateFormatter.format(new Date(invoice.paymentDate))} · ${
                            invoice.paymentMethod === 'ONLINE' ? 'Online' : 'Manual'
                          }`
                        : 'Aguardando pagamento'}
                    </TableCell>
                    <TableCell className="text-right">
                      <Link
                        href={`/faturas/${invoice.id}`}
                        className="inline-flex h-8 items-center rounded-lg border border-portal/20 bg-card px-3 text-xs font-semibold text-portal-deep shadow-sm transition-colors hover:bg-portal-soft"
                      >
                        Ver detalhes
                      </Link>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
