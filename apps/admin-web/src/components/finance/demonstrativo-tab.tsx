'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { FinancialStatementDimensionItem } from '@motoboycity/types';
import {
  AlertTriangle,
  Bike,
  Building2,
  Package,
  PiggyBank,
  Scale,
  SlidersHorizontal,
  TrendingUp,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MetricCard } from '@/components/finance/metric-card';
import { adminFinancialApi } from '@/lib/api-client';
import { formatarData, formatarNumero } from '@/lib/dinheiro';
import { useMoney } from '@/lib/money';

/** `AAAA-MM-DD` de N dias atrás, no fuso da operação. */
function diasAtras(dias: number): string {
  const data = new Date();
  data.setDate(data.getDate() - dias);
  return data.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
}

/** `+12,5%` ou `—` quando a base é zero e não há tendência a mostrar. */
function variacao(percentual: number | null): string {
  if (percentual === null) return '—';
  const sinal = percentual >= 0 ? '+' : '';
  return `${sinal}${percentual.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
}

export function DemonstrativoTab({ token }: { token: string }) {
  const money = useMoney();
  const [de, setDe] = useState(() => diasAtras(30));
  const [ate, setAte] = useState(() => diasAtras(0));
  const [erro, setErro] = useState<string | null>(null);
  const [filtro, setFiltro] = useState(() => ({ from: diasAtras(30), to: diasAtras(0) }));

  const statementQuery = useQuery({
    queryKey: ['admin', 'financial', 'statement', filtro],
    queryFn: () => adminFinancialApi.financialStatement(token, filtro),
  });

  function aplicar() {
    if (de > ate) {
      setErro('A data inicial não pode ser posterior à data final.');
      return;
    }
    setErro(null);
    setFiltro({ from: de, to: ate });
  }

  const dados = statementQuery.data;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Resultado do período</CardTitle>
          <p className="text-sm font-normal text-muted-foreground">
            Por competência: entregas concluídas no intervalo, comparadas com o período anterior de
            mesmo tamanho.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="dem-de">De</Label>
              <Input
                id="dem-de"
                type="date"
                className="w-44"
                value={de}
                onChange={(evento) => setDe(evento.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dem-ate">Até</Label>
              <Input
                id="dem-ate"
                type="date"
                className="w-44"
                value={ate}
                onChange={(evento) => setAte(evento.target.value)}
              />
            </div>
            <Button onClick={aplicar}>Aplicar</Button>
          </div>

          {erro && <p className="text-sm text-destructive">{erro}</p>}

          {statementQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando o demonstrativo...</p>
          ) : statementQuery.isError || !dados ? (
            <p className="text-sm text-destructive">Não foi possível carregar o demonstrativo.</p>
          ) : (
            <>
              {/*
                `live` significa que o periodo inclui hoje, e hoje ainda nao
                acabou. Sem esse aviso, o admin compara um periodo incompleto
                com um periodo fechado e conclui que a operacao caiu.
              */}
              {dados.live && (
                <p className="rounded-lg bg-dinheiro-aguardando-suave p-3 text-sm text-dinheiro-aguardando">
                  O período inclui hoje, que ainda não terminou. A comparação com o período anterior
                  fica desfavorecida até o dia fechar.
                </p>
              )}

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <MetricCard
                  label="Entregas concluídas"
                  value={formatarNumero(dados.totals.completedCount)}
                  hint={`${variacao(dados.comparison.changePercent.completedCount)} vs período anterior`}
                  intent="informativo"
                  icon={Package}
                />
                <MetricCard
                  label="Valor movimentado"
                  value={money(dados.totals.totalValue)}
                  hint={`${variacao(dados.comparison.changePercent.totalValue)} vs período anterior`}
                  intent="informativo"
                  icon={TrendingUp}
                />
                <MetricCard
                  label="Repasse aos entregadores"
                  value={money(dados.totals.driverValue)}
                  hint={`${variacao(dados.comparison.changePercent.driverValue)} vs período anterior`}
                  intent="retido"
                  icon={Bike}
                />
                <MetricCard
                  label="Receita da plataforma"
                  value={money(dados.totals.platformValue)}
                  hint={`${variacao(dados.comparison.changePercent.platformValue)} vs período anterior`}
                  intent="recebido"
                  icon={PiggyBank}
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg bg-dinheiro-retido-suave p-3">
                  <p className="text-xs text-muted-foreground">Ticket médio</p>
                  <p className="font-mono text-xl font-semibold tabular-nums">
                    {money(dados.totals.averageTicket)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {variacao(dados.comparison.changePercent.averageTicket)} vs anterior
                  </p>
                </div>
                <div className="rounded-lg bg-dinheiro-retido-suave p-3">
                  <p className="text-xs text-muted-foreground">Margem da plataforma</p>
                  <p className="font-mono text-xl font-semibold tabular-nums">
                    {dados.totals.contributionMarginPercent.toLocaleString('pt-BR', {
                      maximumFractionDigits: 1,
                    })}
                    %
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {dados.comparison.contributionMarginPercentagePointChange >= 0 ? '+' : ''}
                    {dados.comparison.contributionMarginPercentagePointChange.toLocaleString(
                      'pt-BR',
                      { maximumFractionDigits: 1 },
                    )}{' '}
                    ponto(s) vs anterior
                  </p>
                </div>
                {/*
                  Entrega concluida sem preco e dinheiro que ninguem cobrou. So
                  fica em destaque quando existe — zero aqui e o normal.
                */}
                <div
                  className={`rounded-lg p-3 ${
                    dados.totals.unpricedCount > 0
                      ? 'bg-dinheiro-atrasado-suave'
                      : 'bg-dinheiro-retido-suave'
                  }`}
                >
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    {dados.totals.unpricedCount > 0 && (
                      <AlertTriangle aria-hidden className="size-3 text-dinheiro-atrasado" />
                    )}
                    Entregas sem preço
                  </p>
                  <p
                    className={`font-mono text-xl font-semibold tabular-nums ${
                      dados.totals.unpricedCount > 0 ? 'text-dinheiro-atrasado' : ''
                    }`}
                  >
                    {formatarNumero(dados.totals.unpricedCount)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {dados.totals.unpricedCount > 0
                      ? 'concluídas e nunca precificadas'
                      : 'todas precificadas'}
                  </p>
                </div>
              </div>

              <p className="text-xs text-muted-foreground">
                Período de {formatarData(dados.period.from)} a {formatarData(dados.period.to)} ·
                comparado com {formatarData(dados.comparison.period.from)} a{' '}
                {formatarData(dados.comparison.period.to)}
              </p>
            </>
          )}
        </CardContent>
      </Card>

      {dados && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <SlidersHorizontal aria-hidden className="size-4 text-muted-foreground" />
              Ajustes manuais no período
            </CardTitle>
            {/*
              Ajuste nao e receita nem despesa da operacao, e correcao. Soma-lo
              ao resultado faria um mes com muitas correcoes parecer melhor ou
              pior do que foi — por isso ele vem SEPARADO, e nao dentro dos
              totais acima.
            */}
            <p className="text-sm font-normal text-muted-foreground">
              Ficam fora do resultado acima de propósito: ajuste é correção, não receita nem
              despesa da operação.
            </p>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg bg-dinheiro-recebido-suave p-3">
                <p className="text-xs text-dinheiro-recebido">Créditos lançados</p>
                <p className="font-mono text-lg font-semibold text-dinheiro-recebido tabular-nums">
                  {money(dados.walletAdjustments.creditValue)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatarNumero(dados.walletAdjustments.creditCount)} lançamento(s)
                </p>
              </div>
              <div className="rounded-lg bg-dinheiro-atrasado-suave p-3">
                <p className="text-xs text-dinheiro-atrasado">Débitos lançados</p>
                <p className="font-mono text-lg font-semibold text-dinheiro-atrasado tabular-nums">
                  {money(dados.walletAdjustments.debitValue)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatarNumero(dados.walletAdjustments.debitCount)} lançamento(s)
                </p>
              </div>
              <div className="rounded-lg bg-dinheiro-retido-suave p-3">
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Scale aria-hidden className="size-3" />
                  Efeito na obrigação
                </p>
                <p className="font-mono text-lg font-semibold tabular-nums">
                  {money(dados.walletAdjustments.netDriverObligationImpact)}
                </p>
                <p className="text-xs text-muted-foreground">créditos menos débitos</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {dados && dados.companies.length > 0 && (
        <TabelaPorDimensao
          titulo="Por empresa"
          icone={Building2}
          itens={dados.companies}
          money={money}
        />
      )}

      {dados && dados.serviceTypes.length > 0 && (
        <TabelaPorDimensao
          titulo="Por modalidade"
          icone={Package}
          itens={dados.serviceTypes}
          money={money}
        />
      )}
    </div>
  );
}

function TabelaPorDimensao({
  titulo,
  icone: Icone,
  itens,
  money,
}: {
  titulo: string;
  icone: typeof Building2;
  itens: FinancialStatementDimensionItem[];
  money: (valor: number | null | undefined) => string;
}) {
  // Maior movimento primeiro: aqui a pergunta é "de onde vem o dinheiro", e a
  // resposta é uma lista curta no topo.
  const ordenados = [...itens].sort((a, b) => b.totalValue - a.totalValue);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Icone aria-hidden className="size-4 text-muted-foreground" />
          {titulo}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border text-left text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Nome</th>
                <th className="px-4 py-2 font-medium">Entregas</th>
                <th className="px-4 py-2 font-medium">Movimentado</th>
                <th className="px-4 py-2 font-medium">Repasse</th>
                <th className="px-4 py-2 font-medium">Receita</th>
                <th className="px-4 py-2 font-medium">Margem</th>
              </tr>
            </thead>
            <tbody>
              {ordenados.map((item) => (
                <tr key={item.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-2 font-medium">{item.name}</td>
                  <td className="px-4 py-2 tabular-nums">{formatarNumero(item.completedCount)}</td>
                  <td className="px-4 py-2 font-mono tabular-nums">{money(item.totalValue)}</td>
                  <td className="px-4 py-2 font-mono text-muted-foreground tabular-nums">
                    {money(item.driverValue)}
                  </td>
                  <td className="px-4 py-2 font-mono text-dinheiro-recebido tabular-nums">
                    {money(item.platformValue)}
                  </td>
                  <td className="px-4 py-2 tabular-nums">
                    {item.contributionMarginPercent.toLocaleString('pt-BR', {
                      maximumFractionDigits: 1,
                    })}
                    %
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
