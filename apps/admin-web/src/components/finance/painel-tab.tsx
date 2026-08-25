'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  Bike,
  Building2,
  CircleDollarSign,
  Clock,
  FileClock,
  Lock,
  Package,
  PiggyBank,
  Receipt,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { QueryState } from '@/components/ui/query-state';
import { MetricCard } from '@/components/finance/metric-card';
import { adminFinancialApi } from '@/lib/api-client';
import { formatarNumero } from '@/lib/dinheiro';
import { useMoney } from '@/lib/money';

export function PainelTab({ token }: { token: string }) {
  const money = useMoney();
  const [de, setDe] = useState('');
  const [ate, setAte] = useState('');
  const [erroDoPeriodo, setErroDoPeriodo] = useState<string | null>(null);
  const [periodoAplicado, setPeriodoAplicado] = useState<{ from?: string; to?: string }>({});

  const caixaQuery = useQuery({
    queryKey: ['admin', 'financial', 'cash-position'],
    queryFn: () => adminFinancialApi.cashPosition(token),
  });

  const periodoQuery = useQuery({
    queryKey: ['admin', 'financial', 'overview', periodoAplicado],
    queryFn: () => adminFinancialApi.overview(token, periodoAplicado),
  });

  const caixa = caixaQuery.data;
  const periodo = periodoQuery.data;

  function aplicarPeriodo() {
    if (de && ate && de > ate) {
      setErroDoPeriodo('A data inicial não pode ser posterior à data final.');
      return;
    }
    setErroDoPeriodo(null);
    setPeriodoAplicado({ ...(de && { from: de }), ...(ate && { to: ate }) });
  }

  function limparPeriodo() {
    setDe('');
    setAte('');
    setErroDoPeriodo(null);
    setPeriodoAplicado({});
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">A receber — agora</CardTitle>
          <p className="text-sm font-normal text-muted-foreground">
            Fotografia do momento. O filtro de período mais abaixo não mexe nestes números.
          </p>
        </CardHeader>
        <CardContent>
          {caixaQuery.isLoading ? (
            <QueryState
              compact
              kind="loading"
              title="Atualizando a posição de caixa"
              description="Consultando faturas, saldos e valores a receber."
            />
          ) : caixaQuery.isError || !caixa ? (
            <QueryState
              compact
              kind="error"
              title="A posição de caixa está indisponível"
              description="Os indicadores foram ocultados para não parecerem zerados por engano."
              onAction={() => void caixaQuery.refetch()}
            />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                label="Pedidos sem fatura"
                value={money(caixa.unbilledValue)}
                hint={`${formatarNumero(caixa.unbilledCount)} entrega(s) feitas e ainda não cobradas`}
                intent="nao-cobrado"
                icon={Package}
                href="/financeiro?aba=faturas"
              />
              <MetricCard
                label="Faturas pendentes"
                value={money(caixa.invoicesDueValue)}
                hint={`${formatarNumero(caixa.invoicesDueCount)} fatura(s) no prazo`}
                intent="aguardando"
                icon={FileClock}
                href="/faturas?status=PENDING"
              />
              <MetricCard
                label="Faturas vencidas"
                value={money(caixa.invoicesOverdueValue)}
                hint={`${formatarNumero(caixa.invoicesOverdueCount)} fatura(s) atrasada(s)`}
                intent="atrasado"
                icon={AlertTriangle}
                href="/faturas?status=OVERDUE"
                neutralizarZero
              />
              <MetricCard
                label="Total a receber"
                value={money(caixa.totalReceivable)}
                hint="Soma dos três anteriores"
                intent="recebido"
                icon={CircleDollarSign}
              />
            </div>
          )}
        </CardContent>
      </Card>

      {caixa && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Carteiras</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div>
              <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
                <Bike aria-hidden className="size-4 text-muted-foreground" />
                Entregadores
              </h3>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <MetricCard
                  label="Saldo disponível"
                  value={money(caixa.driverAvailableBalance)}
                  hint="Já liberado — pode ser sacado a qualquer hora"
                  intent="recebido"
                  icon={Wallet}
                  href="/financeiro?aba=carteiras"
                />
                <MetricCard
                  label="Saldo a liberar"
                  value={money(caixa.driverBlockedBalance)}
                  hint="Ainda dentro do prazo de liberação"
                  intent="retido"
                  icon={Lock}
                />
                <MetricCard
                  label="Saques pendentes"
                  value={money(caixa.pendingWithdrawalValue)}
                  hint="Pedidos aguardando pagamento"
                  intent="aguardando"
                  icon={Clock}
                  href="/financeiro?aba=carteiras"
                  neutralizarZero
                />
              </div>
            </div>

            <div>
              <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
                <Building2 aria-hidden className="size-4 text-muted-foreground" />
                Empresas
              </h3>
              {/*
                Fica visível zerada de propósito. O modelo do banco já tem
                carteira de empresa, mas a operação ainda não usa. Esconder daria
                a impressão de que a funcionalidade não existe; mostrar zerado com
                a explicação diz a verdade.
              */}
              <p className="rounded-xl bg-dinheiro-retido-suave p-4 text-sm text-muted-foreground">
                A operação ainda não usa carteira de empresa — hoje a cobrança é por fatura. O
                cadastro já existe no sistema e esta seção passa a mostrar saldos quando for ligada.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="gap-3 pb-3">
          <div>
            <CardTitle className="text-base">Movimento por período</CardTitle>
            <p className="mt-1 text-sm font-normal text-muted-foreground">
              O que aconteceu no intervalo escolhido. Sem período, mostra tudo.
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="periodo-de">Concluídas a partir de</Label>
              <Input
                id="periodo-de"
                type="date"
                className="w-44"
                value={de}
                onChange={(evento) => setDe(evento.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="periodo-ate">Concluídas até</Label>
              <Input
                id="periodo-ate"
                type="date"
                className="w-44"
                value={ate}
                onChange={(evento) => setAte(evento.target.value)}
              />
            </div>
            <Button onClick={aplicarPeriodo}>Aplicar</Button>
            <Button variant="outline" onClick={limparPeriodo}>
              Limpar
            </Button>
          </div>
          {erroDoPeriodo && <p className="text-sm text-destructive">{erroDoPeriodo}</p>}
        </CardHeader>
        <CardContent>
          {periodoQuery.isLoading ? (
            <QueryState
              compact
              kind="loading"
              title="Calculando o movimento do período"
              description="Somando entregas, repasses e receita da plataforma."
            />
          ) : periodoQuery.isError || !periodo ? (
            <QueryState
              compact
              kind="error"
              title="Não foi possível calcular o período"
              description="Os totais não foram exibidos para evitar valores incorretos."
              onAction={() => void periodoQuery.refetch()}
            />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                label="Entregas concluídas"
                value={formatarNumero(periodo.completedDeliveries.count)}
                intent="informativo"
                icon={Package}
              />
              <MetricCard
                label="Valor movimentado"
                value={money(periodo.completedDeliveries.totalValue)}
                hint="Total cobrado das empresas"
                intent="informativo"
                icon={TrendingUp}
              />
              <MetricCard
                label="Repasse aos entregadores"
                value={money(periodo.completedDeliveries.driverValue)}
                intent="retido"
                icon={Bike}
              />
              <MetricCard
                label="Receita da plataforma"
                value={money(periodo.completedDeliveries.platformValue)}
                hint="O que fica para a operação"
                intent="recebido"
                icon={PiggyBank}
              />
              <MetricCard
                label="Sem fatura no período"
                value={money(periodo.completedDeliveries.unbilledValue)}
                hint="Entregas do período que ainda não entraram em fatura"
                intent="nao-cobrado"
                icon={Receipt}
                neutralizarZero
              />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
