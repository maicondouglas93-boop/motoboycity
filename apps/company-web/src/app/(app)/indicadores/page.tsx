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
import { deliveriesApi } from '@/lib/api-client';
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
  const deliveriesQuery = useQuery({
    queryKey: ['company', 'indicators', appliedPeriod],
    queryFn: () => deliveriesApi.list(token as string, appliedPeriod),
    enabled: Boolean(token),
  });
  const stageTimesQuery = useQuery({
    queryKey: ['company', 'stage-times', appliedPeriod],
    queryFn: () => deliveriesApi.stageTimes(token as string, appliedPeriod),
    enabled: Boolean(token),
  });

  const indicators = useMemo(() => {
    const deliveries = deliveriesQuery.data ?? [];
    const completed = deliveries.filter((delivery) => delivery.status === 'COMPLETED');
    const cancelled = deliveries.filter((delivery) => delivery.status === 'CANCELLED');
    const totalValue = deliveries.reduce((sum, delivery) => sum + (delivery.totalValue ?? 0), 0);
    const completedValue = completed.reduce((sum, delivery) => sum + (delivery.totalValue ?? 0), 0);
    const byStatus = Object.fromEntries(
      Object.keys(statusCountLabel).map((status) => [status, 0]),
    ) as Record<DeliveryStatus, number>;
    const serviceCounts = new Map<string, number>();
    const byDate = new Map<string, number>();

    for (const delivery of deliveries) {
      byStatus[delivery.status] += 1;
      serviceCounts.set(
        delivery.serviceTypeName,
        (serviceCounts.get(delivery.serviceTypeName) ?? 0) + 1,
      );
      const date = delivery.createdAt.slice(0, 10);
      byDate.set(date, (byDate.get(date) ?? 0) + 1);
    }

    const mostUsedService = [...serviceCounts.entries()].sort(
      (left, right) => right[1] - left[1],
    )[0];
    const daily = [...byDate.entries()].sort(([left], [right]) => left.localeCompare(right));
    return {
      total: deliveries.length,
      completed: completed.length,
      cancelled: cancelled.length,
      totalValue,
      completedValue,
      averageTicket: deliveries.length ? totalValue / deliveries.length : 0,
      cancellationRate: deliveries.length ? (cancelled.length / deliveries.length) * 100 : 0,
      byStatus,
      mostUsedService: mostUsedService?.[0] ?? 'Sem pedidos',
      daily,
    };
  }, [deliveriesQuery.data]);

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

      {deliveriesQuery.isLoading && (
        <p className="text-sm text-muted-foreground">Calculando indicadores...</p>
      )}
      {deliveriesQuery.isError && (
        <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertCircle className="size-4" /> Não foi possível carregar os indicadores.
        </div>
      )}

      {!deliveriesQuery.isLoading && !deliveriesQuery.isError && (
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
              value={String(
                (deliveriesQuery.data ?? []).filter((delivery) => delivery.requiresReturn).length,
              )}
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
