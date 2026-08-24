'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { companyInvoicesApi } from '@/lib/api-client';
import { formatarData, formatarDataHora } from '@/lib/dinheiro';
import { session } from '@/lib/session';

const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

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

export default function CompanyInvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const token = session.getToken();
  const invoiceQuery = useQuery({
    queryKey: ['company', 'invoice', id],
    queryFn: () => companyInvoicesApi.detail(token as string, id),
    enabled: Boolean(token && id),
  });

  if (!token)
    return <p className="text-sm text-muted-foreground">Faça login para consultar esta fatura.</p>;
  if (invoiceQuery.isLoading)
    return <p className="text-sm text-muted-foreground">Carregando detalhes...</p>;
  if (invoiceQuery.isError || !invoiceQuery.data) {
    return (
      <p className="text-sm text-destructive">
        Não foi possível carregar os detalhes desta fatura.
      </p>
    );
  }

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
        className="inline-flex items-center gap-2 text-sm font-semibold text-portal hover:text-portal-deep hover:underline"
      >
        <ArrowLeft className="size-4" /> Voltar para faturas
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{invoice.number}</h1>
          <p className="text-sm text-muted-foreground">Fatura de {invoice.companyName}</p>
        </div>
        <Badge variant={statusTone}>
          {invoice.status === 'PAID'
            ? 'Paga'
            : invoice.status === 'PENDING'
              ? 'Pendente'
              : invoice.status === 'OVERDUE'
                ? 'Vencida'
                : 'Cancelada'}
        </Badge>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="metric-card">
          <CardHeader>
            <CardTitle className="text-sm">Valor total</CardTitle>
          </CardHeader>
          <CardContent className="font-heading text-2xl font-bold tracking-tight text-portal-deep">
            {currency.format(invoice.totalValue)}
          </CardContent>
        </Card>
        <Card className="metric-card">
          <CardHeader>
            <CardTitle className="text-sm">Pedidos faturados</CardTitle>
          </CardHeader>
          <CardContent className="font-heading text-2xl font-bold tracking-tight text-portal-deep">
            {invoice.deliveryCount}
          </CardContent>
        </Card>
      </div>

      <Card className="premium-panel">
        <CardHeader>
          <CardTitle>Datas e pagamento</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 text-sm md:grid-cols-3">
          <div>
            <p className="text-muted-foreground">Emissão</p>
            <p className="font-medium">{formatarData(invoice.issueDate)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Vencimento</p>
            <p className="font-medium">{formatarData(invoice.dueDate)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Pagamento</p>
            <p className="font-medium">
              {invoice.paymentDate
                ? `${formatarData(invoice.paymentDate)} · ${invoice.paymentMethod === 'ONLINE' ? 'Online' : 'Manual'}`
                : 'Aguardando confirmação'}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="premium-panel">
        <CardHeader>
          <CardTitle>Pedidos faturados ({invoice.deliveries.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Pedido</TableHead>
                <TableHead>Concluído em</TableHead>
                <TableHead>Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoice.deliveries.map((delivery) => (
                <TableRow key={delivery.id}>
                  <TableCell className="font-medium">
                    <Link
                      className="text-portal hover:text-portal-deep hover:underline"
                      href={`/pedidos/${delivery.id}`}
                    >
                      #{delivery.displayNumber}
                    </Link>
                  </TableCell>
                  <TableCell>{formatarDataHora(delivery.completedAt)}</TableCell>
                  <TableCell>{currency.format(delivery.totalValue)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card className="premium-panel">
        <CardHeader>
          <CardTitle>Histórico financeiro</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {invoice.statusHistory.map((entry, index) => (
            <div
              key={`${entry.changedAt}-${index}`}
              className="border-l-2 border-portal/30 pl-3 text-sm"
            >
              <p className="font-medium">
                {entry.fromStatus ? invoiceStatusLabel[entry.fromStatus] : 'Criação'} →{' '}
                {invoiceStatusLabel[entry.toStatus] ?? entry.toStatus}
              </p>
              <p className="text-muted-foreground">
                {formatarDataHora(entry.changedAt)}
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
