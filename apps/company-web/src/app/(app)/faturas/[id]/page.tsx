'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
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
import { paginar } from '@/lib/paginacao';
import { ReportPagination } from '@/components/reports/report-pagination';

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

function invoiceHistoryTitle(
  fromStatus: string | null,
  toStatus: string,
  note: string | null,
): string {
  if (fromStatus === toStatus && note?.startsWith('Vencimento alterado')) {
    return 'Vencimento alterado';
  }
  return `${fromStatus ? invoiceStatusLabel[fromStatus] : 'Criação'} → ${invoiceStatusLabel[toStatus] ?? toStatus}`;
}

/**
 * 25, e não os 10 dos relatórios: a fatura é um documento que a loja abre para
 * CONFERIR o fechamento, e quanto mais linhas couberem numa olhada, menos vezes
 * ela perde o fio.
 */
const DELIVERY_PAGE_SIZE_PADRAO = 25;

/**
 * Abaixo disso não há o que paginar, e a régua seria enfeite embaixo de uma
 * tabela de oito linhas. Fixa de propósito: se dependesse do tamanho escolhido,
 * quem selecionasse "100 por página" numa fatura de 12 pedidos veria os
 * controles sumirem — junto com o seletor que os traria de volta.
 */
const MINIMO_PARA_PAGINAR = 10;

export default function CompanyInvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const token = session.getToken();
  const invoiceQuery = useQuery({
    queryKey: ['company', 'invoice', id],
    queryFn: () => companyInvoicesApi.detail(token as string, id),
    enabled: Boolean(token && id),
  });
  /**
   * Antes dos returns antecipados de propósito: esta página tem três, e um
   * `useState` depois deles mudaria a quantidade de hooks entre um render e
   * outro — o React quebra em cima disso.
   */
  const [deliveryPage, setDeliveryPage] = useState(1);
  const [deliveryPageSize, setDeliveryPageSize] = useState<number>(DELIVERY_PAGE_SIZE_PADRAO);

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

  const totalDeliveries = invoice.deliveries.length;
  // A conta dos limites vive em `lib/paginacao`, testada — o que erra aqui não
  // é o JSX, é a página que sobra apontando para além do fim.
  const pagina = paginar(totalDeliveries, deliveryPage, deliveryPageSize);
  const deliveriesDaPagina = invoice.deliveries.slice(pagina.inicio, pagina.fim);
  const mostrarPaginacao = totalDeliveries > MINIMO_PARA_PAGINAR;

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
          <CardTitle>Pedidos faturados ({totalDeliveries})</CardTitle>
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
              {deliveriesDaPagina.map((delivery) => (
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

          {mostrarPaginacao && (
            <div className="border-t border-border/70 p-3">
              <ReportPagination
                page={pagina.numero}
                pageSize={deliveryPageSize}
                total={totalDeliveries}
                // A lista já está inteira na memória: não há busca para esperar.
                isFetching={false}
                onPageChange={setDeliveryPage}
                onPageSizeChange={(size) => {
                  setDeliveryPageSize(size);
                  setDeliveryPage(1);
                }}
                itemLabel="pedidos"
              />
            </div>
          )}
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
                {invoiceHistoryTitle(entry.fromStatus, entry.toStatus, entry.note)}
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
