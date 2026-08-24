'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { DeliveryStatus } from '@motoboycity/types';
import { AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { StatCard } from '@/components/stat-card';
import { companyFinancialApi, deliveriesApi } from '@/lib/api-client';
import { session } from '@/lib/session';

const currencyFormatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

/**
 * Plural é legítimo aqui — são contagens, não o estado de um pedido. Mas o
 * vocabulário acompanha `status-chip.tsx`, para a mesma entrega não ser
 * chamada de uma coisa nesta tela e de outra na lista.
 */
const statusCountLabel: Record<DeliveryStatus, string> = {
  SCHEDULED: 'Agendados',
  AWAITING_DRIVER: 'Buscando motoboy',
  ACCEPTED: 'A caminho da coleta',
  COLLECTED: 'Em rota',
  DELIVERED: 'Voltando à loja',
  FAILED: 'Não entregues',
  COMPLETED: 'Concluídos',
  CANCELLED: 'Cancelados',
  AWAITING_PAYMENT: 'Aguardando pagamento',
};

function formatCurrency(value: number): string {
  return currencyFormatter.format(value);
}

/**
 * Duração em linguagem de operação: "8 min" para o que cabe numa corrida,
 * "1h 12min" para o que já virou problema. Sem casa decimal — ninguém decide
 * nada com 30,79 minutos.
 */
function formatDuration(minutes: number | null): string {
  if (minutes === null) {
    return '—';
  }
  const rounded = Math.round(minutes);
  if (rounded < 60) {
    return `${rounded} min`;
  }
  return `${Math.floor(rounded / 60)}h ${String(rounded % 60).padStart(2, '0')}min`;
}

/** Hoje em `AAAA-MM-DD`, no fuso da operacao. */
function hojeEmSaoPaulo(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
}

function trintaDiasAtras(): string {
  const data = new Date(Date.now() - 29 * 24 * 60 * 60 * 1000);
  return data.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
}

const STAGES = [
  { key: 'aceite', label: 'Até um motoboy aceitar' },
  { key: 'coleta', label: 'Do aceite até a coleta' },
  { key: 'entrega', label: 'Da coleta até a entrega' },
  { key: 'total', label: 'Total, do pedido à entrega' },
] as const;

export default function IndicatorsPage() {
  const token = session.getToken();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [periodError, setPeriodError] = useState<string | null>(null);
  const [appliedPeriod, setAppliedPeriod] = useState<{ from?: string; to?: string }>({});
  /**
   * O resumo exige intervalo; a tela nao.
   *
   * Sem filtro, o padrao sao os ultimos 30 dias. Aceitar "sem periodo" no
   * servidor significaria varrer todo o historico da loja, que e exatamente o
   * problema que este endpoint veio resolver.
   */
  const periodoDoResumo = useMemo(
    () => ({
      from: appliedPeriod.from ?? trintaDiasAtras(),
      to: appliedPeriod.to ?? hojeEmSaoPaulo(),
    }),
    [appliedPeriod],
  );
  /**
   * O resumo vem AGREGADO DO SERVIDOR.
   *
   * Antes esta tela chamava `GET /deliveries` — que nao tem paginacao nem
   * limite — e somava tudo no navegador. Com 22 entregas funcionava; com um
   * mes de operacao real seriam milhares de linhas atravessando a rede para
   * calcular uma media.
   */
  const summaryQuery = useQuery({
    queryKey: ['company', 'indicators', 'summary', periodoDoResumo],
    queryFn: () => companyFinancialApi.summary(token as string, periodoDoResumo),
    enabled: Boolean(token),
  });
  const stageTimesQuery = useQuery({
    queryKey: ['company', 'stage-times', appliedPeriod],
    queryFn: () => deliveriesApi.stageTimes(token as string, appliedPeriod),
    enabled: Boolean(token),
  });

  const indicators = useMemo(() => {
    const resumo = summaryQuery.data;
    const vazio = Object.fromEntries(
      Object.keys(statusCountLabel).map((status) => [status, 0]),
    ) as Record<DeliveryStatus, number>;

    if (!resumo) {
      return {
        total: 0,
        completed: 0,
        cancelled: 0,
        totalValue: 0,
        completedValue: 0,
        averageTicket: 0,
        cancellationRate: 0,
        requiresReturn: 0,
        byStatus: vazio,
        mostUsedService: 'Sem pedidos',
        daily: [] as Array<[string, number]>,
      };
    }

    return {
      total: resumo.current.count,
      completed: resumo.current.completed,
      cancelled: resumo.current.cancelled,
      totalValue: resumo.current.value,
      completedValue: resumo.current.completedValue,
      averageTicket: resumo.current.averageTicket,
      cancellationRate: resumo.current.count
        ? (resumo.current.cancelled / resumo.current.count) * 100
        : 0,
      requiresReturn: resumo.requiresReturnCount,
      // O servidor devolve so os status que ocorreram; a tela mostra todos,
      // entao os ausentes valem zero.
      byStatus: { ...vazio, ...resumo.byStatus },
      mostUsedService: resumo.topServiceType?.name ?? 'Sem pedidos',
      daily: resumo.daily.map((dia) => [dia.date, dia.count] as [string, number]),
    };
  }, [summaryQuery.data]);

  if (!token) {
    return <p className="text-sm text-muted-foreground">Faça login para ver os indicadores.</p>;
  }

  const maxDaily = Math.max(...indicators.daily.map(([, value]) => value), 1);

  function applyPeriod() {
    if (from && to && from > to) {
      setPeriodError('A data inicial não pode ser posterior à data final.');
      return;
    }
    setPeriodError(null);
    setAppliedPeriod({ ...(from && { from }), ...(to && { to }) });
  }

  function clearPeriod() {
    setFrom('');
    setTo('');
    setPeriodError(null);
    setAppliedPeriod({});
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Indicadores da operação</h1>
        <p className="text-sm text-muted-foreground">
          Pedidos da sua empresa, filtrados pela data de criação.
        </p>
      </div>
      <Card className="premium-panel">
        <CardContent className="flex flex-wrap items-end gap-4 pt-6">
          <div className="space-y-1.5">
            <Label htmlFor="start-date">Data inicial</Label>
            <Input
              id="start-date"
              type="date"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="end-date">Data final</Label>
            <Input
              id="end-date"
              type="date"
              value={to}
              onChange={(event) => setTo(event.target.value)}
            />
          </div>
          <Button onClick={applyPeriod}>Aplicar filtro</Button>
          <Button variant="outline" onClick={clearPeriod}>
            Limpar
          </Button>
          {periodError && <p className="text-sm text-destructive">{periodError}</p>}
        </CardContent>
      </Card>

      {summaryQuery.isLoading && (
        <p className="text-sm text-muted-foreground">Calculando indicadores...</p>
      )}
      {summaryQuery.isError && (
        <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertCircle className="size-4" /> Não foi possível carregar os indicadores.
        </div>
      )}

      {!summaryQuery.isLoading && !summaryQuery.isError && (
        <>
          <section className="grid grid-cols-2 gap-4 xl:grid-cols-5">
            <StatCard label="Pedidos" value={String(indicators.total)} />
            <StatCard label="Concluídos" value={String(indicators.completed)} />
            <StatCard label="Cancelados" value={String(indicators.cancelled)} />
            <StatCard label="Ticket médio" value={formatCurrency(indicators.averageTicket)} />
            <StatCard
              label="Taxa de cancelamento"
              value={`${indicators.cancellationRate.toFixed(1)}%`}
            />
          </section>
          <section className="grid grid-cols-2 gap-4 xl:grid-cols-4">
            <StatCard label="Valor dos pedidos" value={formatCurrency(indicators.totalValue)} />
            <StatCard label="Valor concluído" value={formatCurrency(indicators.completedValue)} />
            <StatCard label="Modalidade mais usada" value={indicators.mostUsedService} />
            <StatCard
              label="Pedidos com retorno"
              value={String(indicators.requiresReturn)}
            />
          </section>
          <section className="grid grid-cols-2 gap-4 xl:grid-cols-4">
            {Object.entries(indicators.byStatus).map(([status, count]) => (
              <StatCard
                key={status}
                label={statusCountLabel[status as DeliveryStatus]}
                value={String(count)}
              />
            ))}
          </section>
          <Card>
            <CardHeader>
              <CardTitle>Tempo por etapa</CardTitle>
            </CardHeader>
            <CardContent>
              {stageTimesQuery.isLoading ? (
                <p className="text-sm text-muted-foreground">Calculando tempos...</p>
              ) : stageTimesQuery.data ? (
                <>
                  <div className="overflow-hidden rounded-xl border border-portal/10">
                    <table className="w-full min-w-[520px] text-sm">
                      <thead className="bg-portal-soft/70">
                        <tr className="border-b text-left text-xs text-muted-foreground">
                          <th className="pb-2 font-medium">Etapa</th>
                          <th className="pb-2 text-right font-medium">Normal</th>
                          <th className="pb-2 text-right font-medium">Média</th>
                          <th className="pb-2 text-right font-medium">Dia ruim</th>
                          <th className="pb-2 text-right font-medium">Pedidos</th>
                        </tr>
                      </thead>
                      <tbody>
                        {STAGES.map((stage) => {
                          const data = stageTimesQuery.data[stage.key];
                          return (
                            <tr key={stage.key} className="border-b last:border-b-0">
                              <td className="py-2.5">{stage.label}</td>
                              <td className="py-2.5 text-right font-mono font-medium">
                                {formatDuration(data.medianMinutes)}
                              </td>
                              <td className="py-2.5 text-right font-mono text-muted-foreground">
                                {formatDuration(data.averageMinutes)}
                              </td>
                              <td className="py-2.5 text-right font-mono">
                                {formatDuration(data.p90Minutes)}
                              </td>
                              <td className="py-2.5 text-right font-mono text-muted-foreground">
                                {data.samples}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <p className="mt-3 text-xs text-muted-foreground">
                    <strong className="font-medium text-foreground">Normal</strong> é a mediana:
                    metade dos pedidos foi mais rápida que isso.{' '}
                    <strong className="font-medium text-foreground">Dia ruim</strong> é o que
                    acontece nos 10% piores — é onde mora o cliente irritado, e a média esconde.
                    Pedidos cancelados ficam de fora.
                  </p>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Não foi possível calcular os tempos.
                </p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Pedidos criados por dia</CardTitle>
            </CardHeader>
            <CardContent>
              {indicators.daily.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  Nenhum pedido no período.
                </p>
              ) : (
                <div className="flex h-48 items-end gap-2 overflow-x-auto pb-6">
                  {indicators.daily.map(([date, value]) => (
                    <div
                      key={date}
                      className="flex min-w-10 flex-1 flex-col items-center justify-end gap-1"
                    >
                      <span className="text-xs text-muted-foreground">{value}</span>
                      <div
                        className="w-full rounded-t-lg bg-gradient-to-t from-portal to-[#35b8b2] shadow-[0_8px_18px_-10px_rgba(15,107,112,0.8)]"
                        style={{ height: `${(value / maxDaily) * 100}%` }}
                      />
                      <span className="rotate-[-45deg] text-[10px] text-muted-foreground">
                        {date.slice(5)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
