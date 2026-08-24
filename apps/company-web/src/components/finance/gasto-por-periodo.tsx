'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Bike,
  CircleDollarSign,
  Download,
  Receipt,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MetricCard } from '@/components/finance/metric-card';
import { companyFinancialApi } from '@/lib/api-client';
import { downloadCsv } from '@/lib/csv';
import { formatarDinheiro, formatarNumero } from '@/lib/dinheiro';

/** Data de hoje em `AAAA-MM-DD`, no fuso da operação. */
function hoje(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
}

/** Sete dias atrás, incluindo hoje: a semana corrente da loja. */
function seteDiasAtras(): string {
  const data = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000);
  return data.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
}

/**
 * Variação percentual entre dois números.
 *
 * Nula quando não há base: dividir por zero daria `Infinity`, e mostrar
 * "+∞%" na primeira semana da loja não ajuda ninguém.
 */
function variacao(atual: number, anterior: number): number | null {
  if (anterior === 0) return null;
  return ((atual - anterior) / anterior) * 100;
}

function Comparacao({ atual, anterior }: { atual: number; anterior: number }) {
  const diferenca = variacao(atual, anterior);
  if (diferenca === null) return null;

  const subiu = diferenca > 0;
  const parado = Math.abs(diferenca) < 0.5;
  const Icone = subiu ? TrendingUp : TrendingDown;

  if (parado) {
    return <span className="text-xs text-muted-foreground">igual ao período anterior</span>;
  }

  return (
    <span className="flex items-center gap-1 text-xs text-muted-foreground">
      <Icone aria-hidden className="size-3" />
      {subiu ? '+' : ''}
      {diferenca.toFixed(0)}% vs. período anterior
    </span>
  );
}

export function GastoPorPeriodo({ token }: { token: string }) {
  const [from, setFrom] = useState(seteDiasAtras);
  const [to, setTo] = useState(hoje);
  const [periodo, setPeriodo] = useState({ from: seteDiasAtras(), to: hoje() });
  const [erro, setErro] = useState<string | null>(null);
  const [baixando, setBaixando] = useState(false);

  const resumoQuery = useQuery({
    queryKey: ['company', 'financial', 'summary', periodo],
    queryFn: () => companyFinancialApi.summary(token, periodo),
  });

  const resumo = resumoQuery.data;
  const anterior = resumo?.previous;

  function aplicar() {
    if (from > to) {
      setErro('A data inicial não pode ser posterior à data final.');
      return;
    }
    setErro(null);
    setPeriodo({ from, to });
  }

  /**
   * O CSV vem PRONTO do servidor.
   *
   * Monta-lo aqui exigiria baixar a lista inteira de pedidos do periodo — o
   * mesmo problema que o resumo agregado veio resolver.
   */
  async function exportar() {
    setBaixando(true);
    try {
      const csv = await companyFinancialApi.exportCsv(token, periodo);
      downloadCsv(`pedidos-${periodo.from}-a-${periodo.to}.csv`, csv);
      setErro(null);
    } catch {
      setErro('Não foi possível gerar o arquivo. Tente novamente.');
    } finally {
      setBaixando(false);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Gasto por período</CardTitle>
        <p className="text-sm font-normal text-muted-foreground">
          Quanto sua loja gastou com entregas, comparado com o período anterior de mesma duração.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label htmlFor="resumo-from">De</Label>
            <Input
              id="resumo-from"
              type="date"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="resumo-to">Até</Label>
            <Input
              id="resumo-to"
              type="date"
              value={to}
              onChange={(event) => setTo(event.target.value)}
            />
          </div>
          <Button onClick={aplicar}>Aplicar</Button>
          <Button variant="outline" onClick={exportar} disabled={baixando}>
            <Download aria-hidden className="size-4" />
            {baixando ? 'Gerando...' : 'Exportar CSV'}
          </Button>
        </div>

        {erro && <p className="text-sm text-destructive">{erro}</p>}

        {resumoQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Calculando...</p>
        ) : resumoQuery.isError || !resumo ? (
          <p className="text-sm text-destructive">Não foi possível calcular o período.</p>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="space-y-1">
                <MetricCard
                  label="Pedidos"
                  value={formatarNumero(resumo.current.count)}
                  hint={`${formatarNumero(resumo.current.completed)} concluído(s), ${formatarNumero(resumo.current.cancelled)} cancelado(s)`}
                  intent="informativo"
                  icon={Bike}
                />
                {anterior && (
                  <div className="px-4">
                    <Comparacao atual={resumo.current.count} anterior={anterior.count} />
                  </div>
                )}
              </div>
              <div className="space-y-1">
                <MetricCard
                  label="Valor total"
                  value={formatarDinheiro(resumo.current.value)}
                  hint="Soma de todos os pedidos do período"
                  intent="aguardando"
                  icon={CircleDollarSign}
                />
                {anterior && (
                  <div className="px-4">
                    <Comparacao atual={resumo.current.value} anterior={anterior.value} />
                  </div>
                )}
              </div>
              <div className="space-y-1">
                <MetricCard
                  label="Ticket médio"
                  value={formatarDinheiro(resumo.current.averageTicket)}
                  hint="Valor médio por pedido"
                  intent="informativo"
                  icon={Receipt}
                />
                {anterior && (
                  <div className="px-4">
                    <Comparacao
                      atual={resumo.current.averageTicket}
                      anterior={anterior.averageTicket}
                    />
                  </div>
                )}
              </div>
              <MetricCard
                label="Modalidade mais usada"
                value={resumo.topServiceType?.name ?? '—'}
                hint={
                  resumo.topServiceType
                    ? `${formatarNumero(resumo.topServiceType.count)} pedido(s)`
                    : 'sem pedidos no período'
                }
                intent="informativo"
                icon={Bike}
              />
            </div>

            {!anterior && resumo.current.count > 0 && (
              // Dizer que não há comparação é melhor que omitir em silêncio: a
              // loja veria os cartões sem a linha de baixo e pensaria em erro.
              <p className="text-xs text-muted-foreground">
                Não há movimento no período anterior para comparar.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
