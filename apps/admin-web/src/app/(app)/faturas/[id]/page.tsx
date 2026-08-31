'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, RotateCcw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { QueryState } from '@/components/ui/query-state';
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
import { UpdateInvoiceDueDateDialog } from '@/components/finance/update-invoice-due-date-dialog';
import { CancelInvoiceDialog } from '@/components/finance/cancel-invoice-dialog';
import { formatarData } from '@/lib/dinheiro';
import { paginar } from '@/lib/paginacao';
import { ReportPagination } from '@/components/reports/report-pagination';

const date = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short' });

/**
 * 25, e não os 10 do resto do painel: a fatura é um documento que alguém abre
 * para CONFERIR o fechamento, e quanto mais linhas couberem numa olhada, menos
 * vezes a pessoa perde o fio.
 */
const DELIVERY_PAGE_SIZE_PADRAO = 25;

/**
 * Abaixo disso não há o que paginar, e a régua seria enfeite embaixo de uma
 * tabela de oito linhas.
 */
const MINIMO_PARA_PAGINAR = 10;

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
  /**
   * Antes dos returns antecipados de propósito: esta página tem três, e um
   * `useState` depois deles mudaria a quantidade de hooks entre um render e
   * outro — o React quebra em cima disso.
   */
  const [deliveryPage, setDeliveryPage] = useState(1);
  const [deliveryPageSize, setDeliveryPageSize] = useState<number>(DELIVERY_PAGE_SIZE_PADRAO);
  if (!token)
    return <p className="text-sm text-muted-foreground">Faça login para consultar esta fatura.</p>;
  if (invoiceQuery.isLoading) {
    return (
      <QueryState
        kind="loading"
        title="Carregando os detalhes da fatura"
        description="Consultando valores, pedidos e trilha de auditoria."
      />
    );
  }
  if (invoiceQuery.isError || !invoiceQuery.data) {
    return (
      <div className="space-y-4">
        <QueryState
          kind="error"
          title="Não foi possível carregar esta fatura"
          description="Tente novamente. Se a falha continuar, volte para a lista de faturas."
          onAction={() => void invoiceQuery.refetch()}
        />
        <Link
          href="/faturas"
          className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
        >
          <ArrowLeft className="size-4" /> Voltar para faturas
        </Link>
      </div>
    );
  }
  const invoice = invoiceQuery.data;

  const totalDeliveries = invoice.deliveries.length;
  // A conta dos limites vive em `lib/paginacao`, testada — o que erra aqui não
  // é o JSX, é a página que sobra apontando para além do fim.
  const pagina = paginar(totalDeliveries, deliveryPage, deliveryPageSize);
  const deliveriesDaPagina = invoice.deliveries.slice(pagina.inicio, pagina.fim);
  /**
   * A régua é fixa, e não o tamanho escolhido: se dependesse da escolha, quem
   * selecionasse "100 por página" numa fatura de 12 pedidos veria os controles
   * sumirem — junto com o seletor que os traria de volta.
   */
  const mostrarPaginacao = totalDeliveries > MINIMO_PARA_PAGINAR;

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
          <p className="mt-1 text-xs text-muted-foreground">
            Emitida em {formatarData(invoice.issueDate)} / Vencimento{' '}
            {formatarData(invoice.dueDate)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {(invoice.status === 'PENDING' || invoice.status === 'OVERDUE') && (
            <>
              <UpdateInvoiceDueDateDialog
                token={token}
                invoiceId={invoice.id}
                invoiceNumber={invoice.number}
                companyName={invoice.companyName}
                issueDate={invoice.issueDate}
                currentDueDate={invoice.dueDate}
                status={invoice.status}
              />
              <CancelInvoiceDialog
                token={token}
                invoiceId={invoice.id}
                invoiceNumber={invoice.number}
                companyName={invoice.companyName}
                totalValue={invoice.totalValue}
                deliveryCount={invoice.deliveryCount}
              />
            </>
          )}
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
              {deliveriesDaPagina.map((delivery) => (
                <TableRow key={delivery.id}>
                  <TableCell className="font-medium">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <Link
                        className="text-primary hover:underline"
                        href={`/pedidos/${delivery.id}`}
                      >
                        #{delivery.displayNumber}
                      </Link>
                      {/*
                        Sem esta marca, um pedido com retorno parece anomalia na
                        fatura: mesma distancia, mesma comissao e o DOBRO do
                        total. A explicacao existe, mas so no documento de
                        regras — e quem confere o fechamento nao vai ler.
                      */}
                      {delivery.returnValue !== null && delivery.returnValue > 0 && (
                        <Badge variant="outline" className="gap-1 text-[10px] font-medium">
                          <RotateCcw aria-hidden className="size-3" />
                          retorno {money(delivery.returnValue)}
                        </Badge>
                      )}
                    </span>
                  </TableCell>
                  <TableCell>{date.format(new Date(delivery.completedAt))}</TableCell>
                  <TableCell>{money(delivery.driverValue)}</TableCell>
                  <TableCell>{money(delivery.platformValue)}</TableCell>
                  <TableCell>{money(delivery.totalValue)}</TableCell>
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
                {invoiceHistoryTitle(entry.fromStatus, entry.toStatus, entry.note)}
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
