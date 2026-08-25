'use client';

import { useQuery } from '@tanstack/react-query';
import type { DriverPayoutPositionItem, PayoutAgingBucketKey } from '@motoboycity/types';
import { AlertTriangle, Clock, Scale } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { QueryState } from '@/components/ui/query-state';
import { adminFinancialApi } from '@/lib/api-client';
import { formatarData, formatarNumero } from '@/lib/dinheiro';
import { useMoney } from '@/lib/money';

/**
 * Faixas de espera do saque, do mais novo para o mais velho.
 *
 * A partir de 4 dias já é vermelho: o motoboy pediu o dinheiro dele e está
 * esperando. Não há prazo contratual aqui, mas há um limite do que é razoável.
 */
const FAIXAS: Array<{ key: PayoutAgingBucketKey; rotulo: string; classe: string }> = [
  {
    key: 'OPEN_0_1',
    rotulo: 'Até 1 dia',
    classe: 'bg-dinheiro-recebido-suave text-dinheiro-recebido',
  },
  {
    key: 'OPEN_2_3',
    rotulo: '2 a 3 dias',
    classe: 'bg-dinheiro-aguardando-suave text-dinheiro-aguardando',
  },
  {
    key: 'OPEN_4_7',
    rotulo: '4 a 7 dias',
    classe: 'bg-dinheiro-atrasado-suave text-dinheiro-atrasado',
  },
  {
    key: 'OPEN_8_PLUS',
    rotulo: 'Mais de 8 dias',
    classe: 'bg-dinheiro-atrasado-suave text-dinheiro-atrasado',
  },
];

/**
 * Quanto a operação deve, para quem, e há quanto tempo alguém espera.
 *
 * A fila de saques já mostra a data do pedido, mas não ordena por espera nem
 * soma a obrigação total. Este bloco responde as duas perguntas que aparecem
 * quando o caixa aperta: quanto eu devo hoje, e quem está esperando mais.
 */
export function PayoutsAging({ token }: { token: string }) {
  const money = useMoney();

  const agingQuery = useQuery({
    queryKey: ['admin', 'financial', 'payouts-aging'],
    queryFn: () => adminFinancialApi.payoutsAging(token),
  });

  const relatorio = agingQuery.data;

  /**
   * Ordenado por dias de espera, e não por valor.
   *
   * Quem espera há 8 dias é um problema mesmo devendo pouco; quem pediu hoje é
   * fluxo normal mesmo devendo muito. Ordenar por valor esconderia o primeiro.
   */
  const motoboys = [...(relatorio?.drivers ?? [])]
    .filter((m) => m.totalObligation > 0 || m.openWithdrawalCount > 0)
    .sort((a, b) => b.maxOpenDays - a.maxOpenDays || b.totalObligation - a.totalObligation);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Quanto devemos, e quem está esperando</CardTitle>
        <p className="text-sm font-normal text-muted-foreground">
          Saques abertos por tempo de espera. Ordenado pela espera maior, não pelo valor.
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        {agingQuery.isLoading ? (
          <QueryState compact kind="loading" title="Calculando as obrigações com entregadores" />
        ) : agingQuery.isError || !relatorio ? (
          <QueryState
            compact
            kind="error"
            title="Não foi possível carregar as obrigações"
            description="Os saldos e faixas de espera foram ocultados para não parecerem zerados."
            onAction={() => void agingQuery.refetch()}
          />
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-lg bg-dinheiro-informativo-suave p-3">
                <p className="text-xs text-dinheiro-informativo">Obrigação total</p>
                <p className="font-mono text-xl font-semibold text-dinheiro-informativo tabular-nums">
                  {money(relatorio.totalObligation)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatarNumero(relatorio.wallets.driverCount)} entregador(es)
                </p>
              </div>
              <div className="rounded-lg bg-dinheiro-aguardando-suave p-3">
                <p className="text-xs text-dinheiro-aguardando">Saques abertos</p>
                <p className="font-mono text-xl font-semibold text-dinheiro-aguardando tabular-nums">
                  {money(relatorio.withdrawals.netValue)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatarNumero(relatorio.withdrawals.openCount)} pedido(s)
                </p>
              </div>
              <div
                className={`rounded-lg p-3 ${
                  relatorio.withdrawals.maxOpenDays >= 4
                    ? 'bg-dinheiro-atrasado-suave'
                    : 'bg-dinheiro-retido-suave'
                }`}
              >
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Clock aria-hidden className="size-3" />
                  Espera mais longa
                </p>
                <p
                  className={`font-mono text-xl font-semibold tabular-nums ${
                    relatorio.withdrawals.maxOpenDays >= 4 ? 'text-dinheiro-atrasado' : ''
                  }`}
                >
                  {formatarNumero(relatorio.withdrawals.maxOpenDays)} dia(s)
                </p>
                <p className="text-xs text-muted-foreground">
                  {relatorio.withdrawals.oldestOpenDate
                    ? `desde ${formatarData(relatorio.withdrawals.oldestOpenDate)}`
                    : 'nenhum saque aberto'}
                </p>
              </div>
              {/*
                Divergência entre o saldo guardado e a soma do ledger é erro de
                contabilidade. Fica em destaque quando existe, e neutro quando
                não — zero aqui é o estado saudável, não uma conquista.
              */}
              <div
                className={`rounded-lg p-3 ${
                  relatorio.wallets.divergentCount > 0
                    ? 'bg-dinheiro-atrasado-suave'
                    : 'bg-dinheiro-retido-suave'
                }`}
              >
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Scale aria-hidden className="size-3" />
                  Carteiras divergentes
                </p>
                <p
                  className={`font-mono text-xl font-semibold tabular-nums ${
                    relatorio.wallets.divergentCount > 0 ? 'text-dinheiro-atrasado' : ''
                  }`}
                >
                  {formatarNumero(relatorio.wallets.divergentCount)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {relatorio.wallets.divergentCount > 0
                    ? 'saldo não bate com o extrato'
                    : 'saldo confere com o extrato'}
                </p>
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              {FAIXAS.map((faixa) => {
                const dados = relatorio.buckets.find((b) => b.key === faixa.key);
                const valor = dados?.netValue ?? 0;
                const classe =
                  valor === 0 ? 'bg-dinheiro-retido-suave text-muted-foreground' : faixa.classe;
                return (
                  <div key={faixa.key} className={`rounded-lg p-3 ${classe}`}>
                    <p className="text-xs">{faixa.rotulo}</p>
                    <p className="font-mono text-lg font-semibold tabular-nums">{money(valor)}</p>
                    <p className="text-xs opacity-80">
                      {formatarNumero(dados?.count ?? 0)} saque(s)
                    </p>
                  </div>
                );
              })}
            </div>

            {motoboys.length === 0 ? (
              <p className="rounded-xl bg-dinheiro-retido-suave p-6 text-center text-sm text-muted-foreground">
                Nenhuma obrigação em aberto. Nada a pagar agora.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-border text-left text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 font-medium">Entregador</th>
                      <th className="px-3 py-2 font-medium">Espera</th>
                      <th className="px-3 py-2 font-medium">Saques abertos</th>
                      <th className="px-3 py-2 font-medium">Disponível</th>
                      <th className="px-3 py-2 font-medium">A liberar</th>
                      <th className="px-3 py-2 font-medium">Obrigação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {motoboys.map((motoboy) => (
                      <LinhaDoMotoboy key={motoboy.driverId} motoboy={motoboy} money={money} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              Posição de {formatarData(relatorio.asOf)} · obrigação total{' '}
              {money(relatorio.totalObligation)}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function LinhaDoMotoboy({
  motoboy,
  money,
}: {
  motoboy: DriverPayoutPositionItem;
  money: (valor: number | null | undefined) => string;
}) {
  const esperandoDemais = motoboy.maxOpenDays >= 4;

  return (
    <tr className="border-b border-border last:border-0">
      <td className="px-3 py-2">
        <p className="font-medium">{motoboy.driverName}</p>
        {!motoboy.cacheMatchesLedger && (
          <span className="inline-flex items-center gap-1 text-xs text-dinheiro-atrasado">
            <AlertTriangle aria-hidden className="size-3" />
            saldo não bate com o extrato
          </span>
        )}
      </td>
      <td className="px-3 py-2">
        {motoboy.openWithdrawalCount === 0 ? (
          <span className="text-xs text-muted-foreground">sem saque aberto</span>
        ) : (
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
              esperandoDemais
                ? 'bg-dinheiro-atrasado-suave text-dinheiro-atrasado'
                : 'bg-dinheiro-aguardando-suave text-dinheiro-aguardando'
            }`}
          >
            <Clock aria-hidden className="size-3" />
            {formatarNumero(motoboy.maxOpenDays)} dia(s)
          </span>
        )}
      </td>
      <td className="px-3 py-2 font-mono tabular-nums">
        {motoboy.openWithdrawalCount > 0 ? money(motoboy.openNetValue) : '—'}
      </td>
      <td className="px-3 py-2 font-mono text-dinheiro-recebido tabular-nums">
        {money(motoboy.availableBalance)}
      </td>
      <td className="px-3 py-2 font-mono text-muted-foreground tabular-nums">
        {money(motoboy.blockedBalance)}
      </td>
      <td className="px-3 py-2 font-mono font-semibold tabular-nums">
        {money(motoboy.totalObligation)}
      </td>
    </tr>
  );
}
