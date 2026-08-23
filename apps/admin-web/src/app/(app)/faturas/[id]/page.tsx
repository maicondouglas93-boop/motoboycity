'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@motoboycity/api-client';
import { ArrowLeft } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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

const date = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short' });

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Status de fatura em português. O mesmo mapa da listagem — a linha do tempo
 * mostrava o enum cru, e "OVERDUE" não diz nada a quem opera a loja.
 */
const invoiceStatusLabel: Record<string, string> = {
  PENDING: 'Pendente',
  PAID: 'Paga',
  OVERDUE: 'Vencida',
  CANCELLED: 'Cancelada',
};

export default function AdminInvoiceDetailPage() {
  const money = useMoney();
  const { id } = useParams<{ id: string }>();
  const token = session.getToken();
  const queryClient = useQueryClient();
  const [paymentDate, setPaymentDate] = useState(today);
  const [paymentMethod, setPaymentMethod] = useState<'BILLED' | 'ONLINE'>('BILLED');
  const [actionError, setActionError] = useState<string | null>(null);
  const invoiceQuery = useQuery({
    queryKey: ['admin', 'invoice', id],
    queryFn: () => adminInvoicesApi.detail(token as string, id),
    enabled: Boolean(token && id),
  });
  const markPaidMutation = useMutation({
    mutationFn: () =>
      adminInvoicesApi.markPaid(token as string, id, { paymentDate, paymentMethod }),
    onSuccess: () => {
      setActionError(null);
      void queryClient.invalidateQueries({ queryKey: ['admin', 'invoice', id] });
      void queryClient.invalidateQueries({ queryKey: ['admin', 'invoices'] });
      void queryClient.invalidateQueries({ queryKey: ['admin', 'financial'] });
    },
    onError: (error) =>
      setActionError(
        error instanceof ApiError ? error.message : 'Não foi possível confirmar o pagamento.',
      ),
  });
  if (!token)
    return <p className="text-sm text-muted-foreground">Faça login para consultar esta fatura.</p>;
  if (invoiceQuery.isLoading)
    return <p className="text-sm text-muted-foreground">Carregando detalhes...</p>;
  if (invoiceQuery.isError || !invoiceQuery.data)
    return <p className="text-sm text-destructive">Não foi possível carregar esta fatura.</p>;
  const invoice = invoiceQuery.data;
  const statusTone =
    invoice.status === 'PAID'
      ? 'secondary'
      : invoice.status === 'PENDING'
        ? 'outline'
        : 'destructive';
  return (
    <div className="space-y-5">
      <Link
        href="/faturas"
        className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
      >
        <ArrowLeft className="size-4" /> Voltar para faturas
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{invoice.number}</h1>
          <p className="text-sm text-muted-foreground">
            {invoice.companyName} · {invoice.deliveryCount} pedido(s)
          </p>
        </div>
        <Badge variant={statusTone}>{invoiceStatusLabel[invoice.status] ?? invoice.status}</Badge>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Total faturado</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">{money(invoice.totalValue)}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Repasse</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">{money(invoice.driverValueSum)}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Receita da plataforma</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">
            {money(invoice.platformValueSum)}
          </CardContent>
        </Card>
      </div>
      {(invoice.status === 'PENDING' || invoice.status === 'OVERDUE') && (
        <Card>
          <CardHeader>
            <CardTitle>Confirmar pagamento manual</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label htmlFor="paid-at">Data</Label>
              <Input
                id="paid-at"
                type="date"
                value={paymentDate}
                onChange={(event) => setPaymentDate(event.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="paid-method">Forma</Label>
              <select
                id="paid-method"
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                value={paymentMethod}
                onChange={(event) => setPaymentMethod(event.target.value as 'BILLED' | 'ONLINE')}
              >
                <option value="BILLED">Manual / faturado</option>
                <option value="ONLINE">Online</option>
              </select>
            </div>
            <Button disabled={markPaidMutation.isPending} onClick={() => markPaidMutation.mutate()}>
              {markPaidMutation.isPending ? 'Confirmando...' : 'Marcar como paga'}
            </Button>
            {actionError && <p className="text-sm text-destructive">{actionError}</p>}
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader>
          <CardTitle>Pedidos incluídos</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Pedido</TableHead>
                <TableHead>Concluído</TableHead>
                <TableHead>Repasse</TableHead>
                <TableHead>Plataforma</TableHead>
                <TableHead>Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoice.deliveries.map((delivery) => (
                <TableRow key={delivery.id}>
                  <TableCell className="font-medium">
                    <Link className="text-primary hover:underline" href={`/pedidos/${delivery.id}`}>
                      #{delivery.displayNumber}
                    </Link>
                  </TableCell>
                  <TableCell>{date.format(new Date(delivery.completedAt))}</TableCell>
                  <TableCell>{money(delivery.driverValue)}</TableCell>
                  <TableCell>{money(delivery.platformValue)}</TableCell>
                  <TableCell>{money(delivery.totalValue)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Trilha de auditoria</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {invoice.statusHistory.map((entry, index) => (
            <div
              key={`${entry.changedAt}-${index}`}
              className="border-l-2 border-border pl-3 text-sm"
            >
              <p className="font-medium">
                {entry.fromStatus ? invoiceStatusLabel[entry.fromStatus] : 'Criação'} →{' '}
                {invoiceStatusLabel[entry.toStatus] ?? entry.toStatus}
              </p>
              <p className="text-muted-foreground">
                {date.format(new Date(entry.changedAt))}
                {entry.changedBy ? ` · ${entry.changedBy.name}` : ' · Atualização automática'}
              </p>
              {entry.note && <p className="mt-1 text-muted-foreground">{entry.note}</p>}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
