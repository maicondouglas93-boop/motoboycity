'use client';

import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CalendarClock, CircleDollarSign, FileClock, Package } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { GastoPorPeriodo } from '@/components/finance/gasto-por-periodo';
import { MetricCard } from '@/components/finance/metric-card';
import { companyFinancialApi } from '@/lib/api-client';
import { formatarData, formatarDinheiro, formatarNumero } from '@/lib/dinheiro';

export function ResumoTab({ token }: { token: string }) {
  const posicaoQuery = useQuery({
    queryKey: ['company', 'financial', 'position'],
    queryFn: () => companyFinancialApi.position(token),
  });

  const posicao = posicaoQuery.data;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Minha posição</CardTitle>
          <p className="text-sm font-normal text-muted-foreground">
            Tudo que está em aberto com a plataforma neste momento.
          </p>
        </CardHeader>
        <CardContent>
          {posicaoQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando sua posição...</p>
          ) : posicaoQuery.isError || !posicao ? (
            <p className="text-sm text-destructive">Não foi possível carregar sua posição.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                label="A vencer"
                value={formatarDinheiro(posicao.notDue.value)}
                hint={`${formatarNumero(posicao.notDue.count)} fatura(s) no prazo`}
                intent="aguardando"
                icon={FileClock}
                href="/financeiro?aba=faturas"
              />
              <MetricCard
                label="Vencido"
                value={formatarDinheiro(posicao.overdue.value)}
                hint={
                  posicao.overdue.count === 0
                    ? 'nenhuma fatura em atraso'
                    : `${formatarNumero(posicao.overdue.count)} fatura(s) · atraso de até ${formatarNumero(posicao.overdue.maxOverdueDays)} dia(s)`
                }
                intent="atrasado"
                icon={AlertTriangle}
                href="/financeiro?aba=faturas"
                neutralizarZero
              />
              {/*
                O cartao mais valioso desta tela: e o numero que a loja nao
                conseguia saber. Antes ela so descobria o valor na segunda,
                quando a fatura fechava.
              */}
              <MetricCard
                label="Ainda não faturado"
                value={formatarDinheiro(posicao.unbilled.value)}
                hint={`${formatarNumero(posicao.unbilled.count)} pedido(s) já feitos`}
                intent="nao-cobrado"
                icon={Package}
                href="/financeiro?aba=pedidos"
              />
              <MetricCard
                label="Total em aberto"
                value={formatarDinheiro(posicao.totalOpen)}
                hint="Soma dos três anteriores"
                intent="informativo"
                icon={CircleDollarSign}
              />
            </div>
          )}
        </CardContent>
      </Card>

      {posicao && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarClock aria-hidden className="size-4 text-dinheiro-nao-cobrado" />
              Próximo fechamento
            </CardTitle>
          </CardHeader>
          <CardContent>
            {/*
              A regra semanal existe no sistema e era folclore para a loja: ela
              via a fatura aparecer sem saber quando nem com o quê.
            */}
            <p className="text-sm">
              A próxima fatura fecha em{' '}
              <strong>{formatarData(posicao.nextClosingDate)}</strong>, juntando os pedidos feitos
              até lá.
            </p>
            {posicao.unbilled.count > 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">
                Hoje já somam{' '}
                <strong className="font-mono text-dinheiro-nao-cobrado">
                  {formatarDinheiro(posicao.unbilled.value)}
                </strong>{' '}
                em {formatarNumero(posicao.unbilled.count)} pedido(s).
              </p>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">
                Nenhum pedido aguardando fatura no momento.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      <GastoPorPeriodo token={token} />
    </div>
  );
}
