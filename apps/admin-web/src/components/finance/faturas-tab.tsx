'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import type { InvoiceStatus } from '@motoboycity/types';
import { AlertTriangle, CalendarClock, Eye, Package } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CancelInvoiceDialog } from '@/components/finance/cancel-invoice-dialog';
import { MetricCard } from '@/components/finance/metric-card';
import { ReceivablesAging } from '@/components/finance/receivables-aging';
import { adminFinancialApi, adminInvoicesApi } from '@/lib/api-client';
import { CloseInvoicesDialog } from '@/components/finance/close-invoices-dialog';
import { formatarData, formatarNumero } from '@/lib/dinheiro';
import { useMoney } from '@/lib/money';

const ROTULO_DO_STATUS: Record<InvoiceStatus, string> = {
  PENDING: 'Pendente',
  PAID: 'Paga',
  OVERDUE: 'Vencida',
  CANCELLED: 'Cancelada',
};

/** Segunda-feira no fuso da operação, que é quando o fechamento pode rodar. */
function ehSegundaFeira(data: Date): boolean {
  const diaEmSaoPaulo = data.toLocaleDateString('en-US', {
    timeZone: 'America/Sao_Paulo',
    weekday: 'short',
  });
  return diaEmSaoPaulo === 'Mon';
}

/** `AAAA-MM-DD` de hoje no fuso da operação. */
function hojeNaOperacao(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
}

export function FaturasTab({ token }: { token: string }) {
  const money = useMoney();
  const [statusFiltrado, setStatusFiltrado] = useState<InvoiceStatus | 'ALL'>('ALL');
  /** Quantas faturas o ultimo fechamento gerou. `null` = ainda nao fechou. */
  const [faturasGeradas, setFaturasGeradas] = useState<number | null>(null);

  const caixaQuery = useQuery({
    queryKey: ['admin', 'financial', 'cash-position'],
    queryFn: () => adminFinancialApi.cashPosition(token),
  });

  const faturasQuery = useQuery({
    queryKey: ['admin', 'financial', 'invoices', statusFiltrado],
    queryFn: () =>
      adminInvoicesApi.list(token, {
        ...(statusFiltrado !== 'ALL' && { status: statusFiltrado }),
      }),
  });

  const caixa = caixaQuery.data;
  const faturas = faturasQuery.data ?? [];

  const hojeEhDiaDeFechar = ehSegundaFeira(new Date());

  return (
    <div className="space-y-6">
      {/*
        Este bloco existe porque o fechamento aqui NÃO é por seleção de pedidos.
        A regra do sistema é semanal e automática: roda toda segunda-feira a
        partir das 00:05, cobrindo tudo que ficou aberto até o corte. O botão
        manual é uma segunda chance para quando a rotina falha, e a própria API
        recusa em qualquer outro dia.

        Uma tela com caixinhas de seleção pareceria mais poderosa e prometeria
        algo que o servidor não faz.
      */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarClock aria-hidden className="size-4 text-dinheiro-nao-cobrado" />
            Fechamento semanal
          </CardTitle>
          <p className="text-sm font-normal text-muted-foreground">
            As faturas fecham sozinhas toda segunda-feira, a partir das 00:05, juntando tudo que
            ficou aberto na semana. O botão abaixo só serve se a rotina automática falhar.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {caixa && (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <MetricCard
                label="Aguardando o próximo fechamento"
                value={money(caixa.unbilledValue)}
                hint={`${formatarNumero(caixa.unbilledCount)} entrega(s) concluída(s) e ainda sem fatura`}
                intent="nao-cobrado"
                icon={Package}
              />
              <MetricCard
                label="Faturas em aberto"
                value={money(caixa.invoicesDueValue)}
                hint={`${formatarNumero(caixa.invoicesDueCount)} dentro do prazo`}
                intent="aguardando"
                icon={CalendarClock}
              />
              <MetricCard
                label="Faturas vencidas"
                value={money(caixa.invoicesOverdueValue)}
                hint={`${formatarNumero(caixa.invoicesOverdueCount)} passaram do vencimento`}
                intent="atrasado"
                icon={AlertTriangle}
                neutralizarZero
              />
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <CloseInvoicesDialog
              token={token}
              dataDoFechamento={hojeNaOperacao()}
              valorAFaturar={caixa?.unbilledValue ?? null}
              entregasAFaturar={caixa?.unbilledCount ?? null}
              desabilitado={!hojeEhDiaDeFechar}
              onFechado={setFaturasGeradas}
            />
            {/*
              O motivo do botão desligado fica escrito. Botão cinza sem
              explicação faz o admin achar que o sistema travou.
            */}
            {!hojeEhDiaDeFechar && (
              <p className="text-sm text-muted-foreground">
                Disponível somente às segundas-feiras — é a regra de fechamento da operação.
              </p>
            )}
          </div>

          {faturasGeradas !== null && (
            <p className="text-sm text-dinheiro-recebido">
              {faturasGeradas === 0
                ? 'Nada a fechar: nenhuma entrega em aberto até o corte.'
                : `${formatarNumero(faturasGeradas)} fatura(s) gerada(s).`}
            </p>
          )}
        </CardContent>
      </Card>

      <ReceivablesAging token={token} />

      <Card>
        <CardHeader className="gap-3 pb-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-base">Faturas emitidas</CardTitle>
          <div className="flex flex-wrap gap-1">
            {(['ALL', 'PENDING', 'OVERDUE', 'PAID'] as const).map((opcao) => (
              <Button
                key={opcao}
                size="sm"
                variant={statusFiltrado === opcao ? 'default' : 'outline'}
                onClick={() => setStatusFiltrado(opcao)}
              >
                {opcao === 'ALL' ? 'Todas' : ROTULO_DO_STATUS[opcao]}
              </Button>
            ))}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {faturasQuery.isLoading ? (
            <p className="p-6 text-sm text-muted-foreground">Carregando faturas...</p>
          ) : faturasQuery.isError ? (
            <p className="p-6 text-sm text-destructive">Não foi possível carregar as faturas.</p>
          ) : faturas.length === 0 ? (
            <p className="p-10 text-center text-sm text-muted-foreground">
              Nenhuma fatura neste filtro.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-border text-left text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 font-medium">Fatura</th>
                    <th className="px-4 py-2 font-medium">Empresa</th>
                    <th className="px-4 py-2 font-medium">Emissão</th>
                    <th className="px-4 py-2 font-medium">Vencimento</th>
                    <th className="px-4 py-2 font-medium">Valor</th>
                    <th className="px-4 py-2 font-medium">Status</th>
                    <th className="px-4 py-2 text-right font-medium">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {faturas.map((fatura) => (
                    <tr key={fatura.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-2 font-mono">{fatura.number}</td>
                      <td className="px-4 py-2 font-medium">{fatura.companyName}</td>
                      <td className="px-4 py-2 text-muted-foreground">
                        {formatarData(fatura.issueDate)}
                      </td>
                      <td className="px-4 py-2 text-muted-foreground">
                        {formatarData(fatura.dueDate)}
                      </td>
                      <td className="px-4 py-2 font-mono tabular-nums">
                        {money(fatura.totalValue)}
                      </td>
                      <td className="px-4 py-2">
                        <Badge
                          variant={
                            fatura.status === 'OVERDUE'
                              ? 'destructive'
                              : fatura.status === 'PAID'
                                ? 'default'
                                : 'secondary'
                          }
                        >
                          {ROTULO_DO_STATUS[fatura.status]}
                        </Badge>
                      </td>
                      <td className="px-4 py-2 text-right">
                        <div className="flex justify-end gap-2">
                          {/*
                            Fatura paga nao mostra o botao: dinheiro que entrou
                            se estorna, nao se cancela, e a API recusa. Mostrar
                            um botao que sempre falha ensina a ignorar botao.
                          */}
                          {fatura.status !== 'PAID' && fatura.status !== 'CANCELLED' && (
                            <CancelInvoiceDialog
                              token={token}
                              invoiceId={fatura.id}
                              invoiceNumber={fatura.number}
                              companyName={fatura.companyName}
                              totalValue={fatura.totalValue}
                              deliveryCount={fatura.deliveryCount}
                            />
                          )}
                          <Link
                            href={`/faturas/${fatura.id}`}
                            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-input bg-background px-3 text-xs font-medium shadow-sm transition-colors hover:bg-accent"
                          >
                            <Eye aria-hidden className="size-3.5" />
                            Ver
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
