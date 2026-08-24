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
import { adminCompaniesApi, adminInvoicesApi } from '@/lib/api-client';
import { session } from '@/lib/session';
import { useMoney } from '@/lib/money';
import { MarkPaidDialog } from '@/components/finance/mark-paid-dialog';
import { InvoiceWhatsAppDialog } from '@/components/finance/invoice-whatsapp-dialog';

const date = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short' });

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
  const invoiceQuery = useQuery({
    queryKey: ['admin', 'invoice', id],
    queryFn: () => adminInvoicesApi.detail(token as string, id),
    enabled: Boolean(token && id),
  });
  const companyQuery = useQuery({
    queryKey: ['admin', 'company', invoiceQuery.data?.companyId],
    queryFn: () => adminCompaniesApi.detail(token as string, invoiceQuery.data!.companyId),
    enabled: Boolean(token && invoiceQuery.data?.companyId),
  });
  if (!token)
    return <p className="text-sm text-muted-foreground">Faça login para consultar esta fatura.</p>;
  if (invoiceQuery.isLoading)
    return <p className="text-sm text-muted-foreground">Carregando detalhes...</p>;
  if (invoiceQuery.isError || !invoiceQuery.data)
    return <p className="text-sm text-destructive">Não foi possível carregar esta fatura.</p>;
  const invoice = invoiceQuery.data;
  const whatsappContacts = (companyQuery.data?.teamMembers ?? [])
    .filter((member) => member.active && member.role === 'OWNER')
    .map((member) => ({
      memberId: member.id,
      name: member.user.name,
      phone: member.user.phone,
    }));
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
        <div className="flex flex-wrap items-center gap-2">
          <InvoiceWhatsAppDialog
            invoice={invoice}
            contacts={whatsappContacts}
            contactsLoading={
              companyQuery.isLoading || (!companyQuery.data && companyQuery.isFetching)
            }
            contactsError={companyQuery.isError}
            onRetryContacts={() => void companyQuery.refetch()}
          />
          <Badge variant={statusTone}>{invoiceStatusLabel[invoice.status] ?? invoice.status}</Badge>
        </div>
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
          <CardContent>
            {/*
              A data, a forma e a confirmacao mudaram para dentro do dialogo.
              Aqui era um botao solto: um clique e a divida da empresa sumia,
              sem pergunta, sem repetir o valor e sem desfazer.
            */}
            <MarkPaidDialog
              token={token}
              invoiceId={invoice.id}
              invoiceNumber={invoice.number}
              companyName={invoice.companyName}
              totalValue={invoice.totalValue}
              deliveryCount={invoice.deliveryCount}
            />
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
