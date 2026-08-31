'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { InvoiceStatus } from '@motoboycity/types';
import { AlertTriangle, Receipt } from 'lucide-react';
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
import { PaymentNoticeDialog } from '@/components/finance/payment-notice-dialog';
import { formatarData, formatarDinheiro, somarDinheiro } from '@/lib/dinheiro';

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

export function FaturasTab({ token }: { token: string }) {
  const [status, setStatus] = useState<InvoiceStatus | 'ALL'>('ALL');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [filtros, setFiltros] = useState<{
    status?: InvoiceStatus;
    from?: string;
    to?: string;
  }>({});

  const faturasQuery = useQuery({
    queryKey: ['company', 'invoices', filtros],
    queryFn: () => companyInvoicesApi.list(token, filtros),
  });

  const faturas = faturasQuery.data ?? [];
  /**
   * As vencidas saem da tabela e sobem para o topo.
   *
   * Na lista antiga elas ficavam na ordem de emissao, no meio das outras: a
   * unica coisa que exige acao hoje era a mais facil de nao ver.
   */
  const vencidas = faturas.filter((fatura) => fatura.status === 'OVERDUE');
  const demais = faturas.filter((fatura) => fatura.status !== 'OVERDUE');

  function aplicarFiltros() {
    setFiltros({
      ...(status !== 'ALL' && { status }),
      ...(from && { from }),
      ...(to && { to }),
    });
  }

  return (
    <div className="space-y-5">
      {vencidas.length > 0 && (
        <Card className="border-dinheiro-atrasado/40 bg-dinheiro-atrasado-suave">
          <CardContent className="space-y-3 pt-6">
            <div className="flex items-start gap-2">
              <AlertTriangle
                aria-hidden
                className="mt-0.5 size-5 shrink-0 text-dinheiro-atrasado"
              />
              <div>
                <p className="font-semibold text-dinheiro-atrasado">
                  {vencidas.length === 1
                    ? '1 fatura vencida'
                    : `${vencidas.length} faturas vencidas`}
                </p>
                <p className="text-sm text-muted-foreground">
                  Total de{' '}
                  <strong className="font-mono">
                    {formatarDinheiro(somarDinheiro(vencidas.map((fatura) => fatura.totalValue)))}
                  </strong>{' '}
                  em atraso.
                </p>
              </div>
            </div>
            <ul className="space-y-1">
              {vencidas.map((fatura) => (
                <li key={fatura.id}>
                  <Link
                    href={`/faturas/${fatura.id}`}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-card/70 px-3 py-2 text-sm transition hover:bg-card"
                  >
                    <span className="font-medium">{fatura.number}</span>
                    <span className="text-muted-foreground">
                      venceu em {formatarData(fatura.dueDate)}
                    </span>
                    <span className="font-mono font-semibold text-dinheiro-atrasado">
                      {formatarDinheiro(fatura.totalValue)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

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
          <Button onClick={aplicarFiltros}>Aplicar filtros</Button>
          <Button
            variant="outline"
            onClick={() => {
              setStatus('ALL');
              setFrom('');
              setTo('');
              setFiltros({});
            }}
          >
            Limpar
          </Button>
        </CardContent>
      </Card>

      {faturasQuery.isLoading && (
        <p className="text-sm text-muted-foreground">Carregando faturas...</p>
      )}
      {faturasQuery.isError && (
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
              {demais.length === 0 && !faturasQuery.isLoading && !faturasQuery.isError ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-12 text-center text-muted-foreground">
                    <div className="flex flex-col items-center gap-2">
                      <Receipt className="size-8" />
                      {vencidas.length > 0
                        ? 'Nenhuma outra fatura além das vencidas acima.'
                        : 'Nenhuma fatura encontrada para os filtros informados.'}
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                demais.map((fatura) => (
                  <TableRow key={fatura.id}>
                    <TableCell className="font-medium">{fatura.number}</TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[fatura.status]}>
                        {STATUS_LABEL[fatura.status]}
                      </Badge>
                    </TableCell>
                    <TableCell>{formatarData(fatura.issueDate)}</TableCell>
                    <TableCell>{formatarData(fatura.dueDate)}</TableCell>
                    <TableCell>{fatura.deliveryCount}</TableCell>
                    <TableCell className="font-mono font-medium">
                      {formatarDinheiro(fatura.totalValue)}
                    </TableCell>
                    <TableCell>
                      {fatura.paymentDate
                        ? `${formatarData(fatura.paymentDate)} · ${
                            fatura.paymentMethod === 'ONLINE' ? 'Online' : 'Manual'
                          }`
                        : 'Aguardando pagamento'}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        {/*
                          "Ja paguei" so aparece no que ainda esta em aberto.
                          Fatura paga ou cancelada nao tem o que avisar.
                        */}
                        {(fatura.status === 'PENDING' || fatura.status === 'OVERDUE') && (
                          <>
                            <Link
                              href={`/faturas/${fatura.id}`}
                              className="inline-flex h-8 items-center rounded-lg bg-portal px-3 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-portal-deep"
                            >
                              Pagar com Pix
                            </Link>
                            <PaymentNoticeDialog
                              token={token}
                              invoiceId={fatura.id}
                              invoiceNumber={fatura.number}
                              invoiceTotal={fatura.totalValue}
                            />
                          </>
                        )}
                        <Link
                          href={`/faturas/${fatura.id}`}
                          className="inline-flex h-8 items-center rounded-lg border border-portal/20 bg-card px-3 text-xs font-semibold text-portal-deep shadow-sm transition-colors hover:bg-portal-soft"
                        >
                          Ver detalhes
                        </Link>
                      </div>
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
