'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import type { ReceivablesAgingBucketKey, ReceivablesCompanyItem } from '@motoboycity/types';
import { AlertTriangle, ArrowUpRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { adminFinancialApi } from '@/lib/api-client';
import { formatarData, formatarNumero } from '@/lib/dinheiro';
import { useMoney } from '@/lib/money';

/**
 * Faixas de idade da dívida, do mais novo para o mais velho.
 *
 * A ordem é a da cobrança: o que está sem fatura só precisa ser faturado; o
 * que passou de 31 dias precisa de telefonema.
 */
const FAIXAS: Array<{
  key: ReceivablesAgingBucketKey;
  rotulo: string;
  classe: string;
}> = [
  { key: 'UNBILLED', rotulo: 'Sem fatura', classe: 'bg-dinheiro-nao-cobrado-suave text-dinheiro-nao-cobrado' },
  { key: 'NOT_DUE', rotulo: 'No prazo', classe: 'bg-dinheiro-aguardando-suave text-dinheiro-aguardando' },
  { key: 'OVERDUE_1_7', rotulo: '1 a 7 dias', classe: 'bg-dinheiro-atrasado-suave text-dinheiro-atrasado' },
  { key: 'OVERDUE_8_15', rotulo: '8 a 15 dias', classe: 'bg-dinheiro-atrasado-suave text-dinheiro-atrasado' },
  { key: 'OVERDUE_16_30', rotulo: '16 a 30 dias', classe: 'bg-dinheiro-atrasado-suave text-dinheiro-atrasado' },
  { key: 'OVERDUE_31_PLUS', rotulo: 'Mais de 31 dias', classe: 'bg-dinheiro-atrasado-suave text-dinheiro-atrasado' },
];

/**
 * Quem deve, quanto, e ha quanto tempo.
 *
 * O painel ja dizia "faturas vencidas: R$ 308". Esse numero nao responde a
 * unica pergunta que leva alguem a agir — de QUEM, e ha QUANTOS DIAS. Uma
 * empresa devendo ha 42 dias e um problema de cobranca; outra ha 3 dias e o
 * fluxo normal, e as duas somavam no mesmo numero cinza.
 */
export function ReceivablesAging({ token }: { token: string }) {
  const money = useMoney();

  const agingQuery = useQuery({
    queryKey: ['admin', 'financial', 'receivables-aging'],
    queryFn: () => adminFinancialApi.receivablesAging(token),
  });

  const relatorio = agingQuery.data;

  /**
   * Ordenado pelo atraso MAIOR primeiro, e nao pelo valor.
   *
   * Dívida velha é o que vira perda; dívida grande e nova é operação normal.
   * Ordenar por valor colocaria o cliente bom no topo e esconderia o problema.
   */
  const empresas = [...(relatorio?.companies ?? [])].sort(
    (a, b) => b.maxOverdueDays - a.maxOverdueDays || b.totalReceivable - a.totalReceivable,
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Quem deve, e há quanto tempo</CardTitle>
        <p className="text-sm font-normal text-muted-foreground">
          A mesma dívida separada por idade. Ordenada pelo atraso maior, não pelo valor.
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        {agingQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando o envelhecimento...</p>
        ) : agingQuery.isError || !relatorio ? (
          <p className="text-sm text-destructive">Não foi possível carregar o envelhecimento.</p>
        ) : (
          <>
            <div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-6">
              {FAIXAS.map((faixa) => {
                const dados = relatorio.buckets.find((b) => b.key === faixa.key);
                const valor = dados?.value ?? 0;
                // Faixa zerada fica neutra: pintar de vermelho um zero ensina o
                // admin a ignorar o vermelho.
                const classe = valor === 0 ? 'bg-dinheiro-retido-suave text-muted-foreground' : faixa.classe;
                return (
                  <div key={faixa.key} className={`rounded-lg p-3 ${classe}`}>
                    <p className="text-xs">{faixa.rotulo}</p>
                    <p className="font-mono text-lg font-semibold tabular-nums">{money(valor)}</p>
                    <p className="text-xs opacity-80">
                      {formatarNumero(dados?.count ?? 0)} pedido(s)
                    </p>
                  </div>
                );
              })}
            </div>

            {empresas.length === 0 ? (
              <p className="rounded-xl bg-dinheiro-retido-suave p-6 text-center text-sm text-muted-foreground">
                Nenhuma empresa com valor a receber. Nada a cobrar agora.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-border text-left text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 font-medium">Empresa</th>
                      <th className="px-3 py-2 font-medium">Atraso</th>
                      <th className="px-3 py-2 font-medium">Vencido</th>
                      <th className="px-3 py-2 font-medium">No prazo</th>
                      <th className="px-3 py-2 font-medium">Sem fatura</th>
                      <th className="px-3 py-2 font-medium">Total</th>
                      <th className="px-3 py-2 text-right font-medium">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {empresas.map((empresa) => (
                      <LinhaDaEmpresa key={empresa.companyId} empresa={empresa} money={money} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              Posição de {formatarData(relatorio.asOf)} · {formatarNumero(relatorio.totalCompanies)}{' '}
              empresa(s) · total {money(relatorio.totalReceivable)}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function LinhaDaEmpresa({
  empresa,
  money,
}: {
  empresa: ReceivablesCompanyItem;
  money: (valor: number | null | undefined) => string;
}) {
  const atrasada = empresa.maxOverdueDays > 0;

  return (
    <tr className="border-b border-border last:border-0">
      <td className="px-3 py-2 font-medium">{empresa.companyName}</td>
      <td className="px-3 py-2">
        {atrasada ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-dinheiro-atrasado-suave px-2.5 py-0.5 text-xs font-semibold text-dinheiro-atrasado">
            <AlertTriangle aria-hidden className="size-3" />
            {formatarNumero(empresa.maxOverdueDays)} dia(s)
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">em dia</span>
        )}
      </td>
      <td className="px-3 py-2 font-mono tabular-nums">
        <span className={empresa.overdueInvoiceValue > 0 ? 'text-dinheiro-atrasado' : ''}>
          {money(empresa.overdueInvoiceValue)}
        </span>
      </td>
      <td className="px-3 py-2 font-mono text-muted-foreground tabular-nums">
        {money(empresa.notDueInvoiceValue)}
      </td>
      <td className="px-3 py-2 font-mono text-muted-foreground tabular-nums">
        {money(empresa.unbilledValue)}
      </td>
      <td className="px-3 py-2 font-mono font-semibold tabular-nums">
        {money(empresa.totalReceivable)}
      </td>
      <td className="px-3 py-2 text-right">
        {/*
          Leva para o cliente, e nao para uma lista filtrada de faturas: quem
          olha atraso quer o telefone e o historico da empresa para cobrar.
        */}
        <Link
          href={`/clientes/${empresa.companyId}`}
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-input bg-background px-3 text-xs font-medium shadow-sm transition-colors hover:bg-accent"
        >
          Abrir
          <ArrowUpRight aria-hidden className="size-3.5" />
        </Link>
      </td>
    </tr>
  );
}
