'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import type { InvoiceStatus } from '@motoboycity/types';
import { AlertTriangle, CalendarClock, Eye, FilePlus2, Package } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { QueryState } from '@/components/ui/query-state';
import { CancelInvoiceDialog } from '@/components/finance/cancel-invoice-dialog';
import { MetricCard } from '@/components/finance/metric-card';
import { ManualInvoiceDialog } from '@/components/finance/manual-invoice-dialog';
import { ReceivablesAging } from '@/components/finance/receivables-aging';
import { adminFinancialApi, adminInvoicesApi } from '@/lib/api-client';
import { formatarData, formatarNumero } from '@/lib/dinheiro';
import { useMoney } from '@/lib/money';

const ROTULO_DO_STATUS: Record<InvoiceStatus, string> = {
  PENDING: 'Pendente',
  PAID: 'Paga',
  OVERDUE: 'Vencida',
  CANCELLED: 'Cancelada',
};

export function FaturasTab({ token }: { token: string }) {
  const money = useMoney();
  const [statusFiltrado, setStatusFiltrado] = useState<InvoiceStatus | 'ALL'>('ALL');
  const [faturaPersonalizada, setFaturaPersonalizada] = useState<{
    id: string;
    number: string;
  } | null>(null);

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

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden border-primary/20 bg-gradient-to-r from-primary/8 via-card to-card">
        <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="rounded-xl bg-primary/10 p-2.5 text-primary">
              <FilePlus2 aria-hidden className="size-5" />
            </span>
            <div>
              <p className="font-heading font-semibold">Fatura personalizada</p>
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                Selecione uma empresa, escolha os pedidos concluídos e defina emissão e vencimento.
                Os demais pedidos continuam aguardando a política configurada para a empresa.
              </p>
            </div>
          </div>
          <ManualInvoiceDialog
            token={token}
            onCreated={(invoice) =>
              setFaturaPersonalizada({ id: invoice.id, number: invoice.number })
            }
          />
        </CardContent>
        {faturaPersonalizada && (
          <div className="border-t border-primary/15 bg-primary/5 px-5 py-3 text-sm">
            Fatura <strong>{faturaPersonalizada.number}</strong> emitida com sucesso.{' '}
            <Link
              className="font-medium text-primary underline"
              href={`/faturas/${faturaPersonalizada.id}`}
            >
              Abrir fatura
            </Link>
          </div>
        )}
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarClock aria-hidden className="size-4 text-dinheiro-nao-cobrado" />
            Fechamentos por empresa
          </CardTitle>
          <p className="text-sm font-normal text-muted-foreground">
            Cada empresa pode fechar automaticamente por semana ou por mês, em seu próprio dia, ou
            ficar em modo manual. A configuração e o fechamento manual ficam no detalhe do cliente.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {caixaQuery.isLoading && (
            <QueryState compact kind="loading" title="Atualizando o fechamento financeiro" />
          )}
          {(caixaQuery.isError || (!caixa && !caixaQuery.isLoading)) && (
            <QueryState
              compact
              kind="error"
              title="Não foi possível consultar os valores do fechamento"
              description="Os indicadores foram ocultados para não parecerem zerados."
              onAction={() => void caixaQuery.refetch()}
            />
          )}
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

          <p className="text-sm text-muted-foreground">
            Abra Clientes, selecione a empresa e use Faturamento para ajustar a política. Empresas
            em modo manual exibem a ação Fechar fatura agora.
          </p>
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
            <div className="p-4">
              <QueryState compact kind="loading" title="Carregando faturas" />
            </div>
          ) : faturasQuery.isError ? (
            <div className="p-4">
              <QueryState
                compact
                kind="error"
                title="Não foi possível carregar as faturas"
                description="A lista não será mostrada como vazia enquanto a consulta estiver indisponível."
                onAction={() => void faturasQuery.refetch()}
              />
            </div>
          ) : faturas.length === 0 ? (
            <div className="p-4">
              <QueryState
                compact
                kind="empty"
                title="Nenhuma fatura neste filtro"
                description="Escolha outro status ou emita uma fatura personalizada."
              />
            </div>
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
