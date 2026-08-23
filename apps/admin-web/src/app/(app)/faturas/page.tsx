'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@motoboycity/api-client';
import type { InvoiceStatus } from '@motoboycity/types';
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
import { adminInvoicesApi } from '@/lib/api-client';
import { session } from '@/lib/session';
import { useMoney } from '@/lib/money';

const date = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium' });

const statusLabel: Record<InvoiceStatus, string> = {
  PENDING: 'Pendente',
  PAID: 'Paga',
  OVERDUE: 'Vencida',
  CANCELLED: 'Cancelada',
};

const statusTone: Record<InvoiceStatus, 'outline' | 'secondary' | 'destructive'> = {
  PENDING: 'outline',
  PAID: 'secondary',
  OVERDUE: 'destructive',
  CANCELLED: 'destructive',
};

function nextMonday(): string {
  const value = new Date();
  value.setUTCDate(value.getUTCDate() + ((8 - value.getUTCDay()) % 7 || 7));
  return value.toISOString().slice(0, 10);
}

export default function AdminInvoicesPage() {
  const money = useMoney();
  const token = session.getToken();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<InvoiceStatus | 'ALL'>('ALL');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [filterError, setFilterError] = useState<string | null>(null);
  const [filters, setFilters] = useState<{ status?: InvoiceStatus; from?: string; to?: string }>(
    {},
  );
  const [closingDate, setClosingDate] = useState(nextMonday);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const invoicesQuery = useQuery({
    queryKey: ['admin', 'invoices', filters],
    queryFn: () => adminInvoicesApi.list(token as string, filters),
    enabled: Boolean(token),
  });
  const closeMutation = useMutation({
    mutationFn: () => adminInvoicesApi.close(token as string, closingDate),
    onSuccess: (invoices) => {
      setActionMessage(
        invoices.length === 0
          ? 'Nenhuma entrega faturável encontrada para este fechamento.'
          : `${invoices.length} fatura(s) criada(s) com sucesso.`,
      );
      void queryClient.invalidateQueries({ queryKey: ['admin', 'invoices'] });
      void queryClient.invalidateQueries({ queryKey: ['admin', 'financial'] });
    },
    onError: (error) => {
      setActionMessage(
        error instanceof ApiError ? error.message : 'Não foi possível fechar as faturas.',
      );
    },
  });

  if (!token)
    return (
      <p className="text-sm text-muted-foreground">
        Faça login como administrador para ver as faturas.
      </p>
    );
  const invoices = invoicesQuery.data ?? [];

  function applyFilters() {
    if (from && to && from > to) {
      setFilterError('A data inicial não pode ser posterior à data final.');
      return;
    }
    setFilterError(null);
    setFilters({
      ...(status !== 'ALL' && { status }),
      ...(from && { from }),
      ...(to && { to }),
    });
  }

  function clearFilters() {
    setStatus('ALL');
    setFrom('');
    setTo('');
    setFilterError(null);
    setFilters({});
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold">Faturas</h1>
        <p className="text-sm text-muted-foreground">
          Fechamento semanal, cobrança manual e rastreabilidade de pagamento.
        </p>
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 pt-6">
          <div className="space-y-1">
            <Label htmlFor="close-date">Data de fechamento (segunda-feira)</Label>
            <Input
              id="close-date"
              type="date"
              value={closingDate}
              onChange={(event) => setClosingDate(event.target.value)}
            />
          </div>
          <Button disabled={closeMutation.isPending} onClick={() => closeMutation.mutate()}>
            {closeMutation.isPending ? 'Fechando...' : 'Fechar faturas pendentes'}
          </Button>
          {actionMessage && (
            <p
              className={
                closeMutation.isError ? 'text-sm text-destructive' : 'text-sm text-muted-foreground'
              }
            >
              {actionMessage}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 pt-6">
          <div className="space-y-1">
            <Label htmlFor="admin-invoice-status">Status</Label>
            <select
              id="admin-invoice-status"
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              value={status}
              onChange={(event) => setStatus(event.target.value as InvoiceStatus | 'ALL')}
            >
              <option value="ALL">Todos</option>
              <option value="PENDING">Pendentes</option>
              <option value="PAID">Pagas</option>
              <option value="OVERDUE">Vencidas</option>
              <option value="CANCELLED">Canceladas</option>
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="admin-invoice-from">Emissão a partir de</Label>
            <Input
              id="admin-invoice-from"
              type="date"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="admin-invoice-to">Emissão até</Label>
            <Input
              id="admin-invoice-to"
              type="date"
              value={to}
              onChange={(event) => setTo(event.target.value)}
            />
          </div>
          <Button onClick={applyFilters}>Aplicar filtros</Button>
          <Button variant="outline" onClick={clearFilters}>
            Limpar
          </Button>
          {filterError && <p className="text-sm text-destructive">{filterError}</p>}
        </CardContent>
      </Card>

      {invoicesQuery.isLoading && (
        <p className="text-sm text-muted-foreground">Carregando faturas...</p>
      )}
      {invoicesQuery.isError && (
        <p className="text-sm text-destructive">Não foi possível carregar as faturas.</p>
      )}

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Número</TableHead>
                <TableHead>Empresa</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Emissão</TableHead>
                <TableHead>Pedidos</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead>Pagamento</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.length === 0 && !invoicesQuery.isLoading ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-12 text-center text-muted-foreground">
                    Nenhuma fatura encontrada.
                  </TableCell>
                </TableRow>
              ) : (
                invoices.map((invoice) => (
                  <TableRow key={invoice.id}>
                    <TableCell className="font-medium">{invoice.number}</TableCell>
                    <TableCell>{invoice.companyName}</TableCell>
                    <TableCell>
                      <Badge variant={statusTone[invoice.status]}>
                        {statusLabel[invoice.status]}
                      </Badge>
                    </TableCell>
                    <TableCell>{date.format(new Date(invoice.issueDate))}</TableCell>
                    <TableCell>{invoice.deliveryCount}</TableCell>
                    <TableCell className="font-medium">{money(invoice.totalValue)}</TableCell>
                    <TableCell>
                      {invoice.paymentDate
                        ? `${date.format(new Date(invoice.paymentDate))} · ${invoice.paymentMethod === 'ONLINE' ? 'Online' : 'Manual'}`
                        : 'Aguardando'}
                    </TableCell>
                    <TableCell className="text-right">
                      <Link
                        href={`/faturas/${invoice.id}`}
                        className="inline-flex h-8 items-center rounded-md border border-input bg-background px-3 text-xs font-medium shadow-sm hover:bg-accent"
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
