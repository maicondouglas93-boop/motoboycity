'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { OperationsReportDriverItem } from '@motoboycity/types';
import { ArrowDown, ArrowUp } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useMoney } from '@/lib/money';

/**
 * Colunas ordenáveis, e NENHUMA nota única de desempenho.
 *
 * Um número só de "performance" embutiria uma escolha de incentivo: ranquear
 * por volume faz o motoboy correr e recusar corrida ruim; por tempo, idem.
 * Mostrar as medidas lado a lado devolve a escolha para quem opera — e deixa à
 * vista o que está sendo medido, que é o que permite discordar do número.
 */
type SortKey =
  | 'completedCount'
  | 'completionRate'
  | 'acceptanceRate'
  | 'averageMinutesToComplete'
  | 'driverValue';

const COLUNAS: Array<{ key: SortKey; label: string; hint: string }> = [
  { key: 'completedCount', label: 'Concluídas', hint: 'Volume de entregas finalizadas' },
  {
    key: 'completionRate',
    label: 'Conclusão',
    hint: 'Das corridas que ele assumiu e encerraram, quantas terminaram entregues',
  },
  {
    key: 'acceptanceRate',
    label: 'Aceite',
    hint: 'Das ofertas recebidas, quantas ele aceitou',
  },
  {
    key: 'averageMinutesToComplete',
    label: 'Tempo médio',
    hint: 'Do aceite até a conclusão',
  },
  { key: 'driverValue', label: 'Repasse', hint: 'Total a receber no período' },
];

/**
 * Nulo vira travessão, nunca zero.
 *
 * Zero por cento diria que o entregador falhou em tudo; o travessão diz que não
 * houve o que medir, que é diferente — e a diferença importa para quem vai
 * cobrar alguém por esse número.
 */
function percentual(value: number | null): string {
  return value === null ? '—' : `${value.toLocaleString('pt-BR')}%`;
}

function minutos(value: number | null, samples: number): string {
  if (value === null) return '—';
  return `${value.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} min (${samples})`;
}

export function DriverRanking({ drivers }: { drivers: OperationsReportDriverItem[] }) {
  const money = useMoney();
  const [sortKey, setSortKey] = useState<SortKey>('completedCount');

  const ordenados = [...drivers].sort((left, right) => {
    const a = left[sortKey];
    const b = right[sortKey];
    // Nulo vai para o fim em qualquer ordenação: quem não tem medida não
    // disputa o topo nem o fundo do ranking.
    if (a === null && b === null) return left.driverName.localeCompare(right.driverName);
    if (a === null) return 1;
    if (b === null) return -1;
    // Tempo menor é melhor; nas outras colunas, maior é melhor.
    const desempate = sortKey === 'averageMinutesToComplete' ? a - b : b - a;
    return desempate || left.driverName.localeCompare(right.driverName);
  });

  if (drivers.length === 0) {
    return (
      <p className="p-6 text-center text-sm text-muted-foreground">
        Nenhum entregador com atividade no período.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Entregador</TableHead>
            {COLUNAS.map((coluna) => (
              <TableHead
                key={coluna.key}
                aria-sort={
                  sortKey === coluna.key
                    ? coluna.key === 'averageMinutesToComplete'
                      ? 'ascending'
                      : 'descending'
                    : 'none'
                }
              >
                <button
                  type="button"
                  title={coluna.hint}
                  aria-label={`Ordenar por ${coluna.label}. ${coluna.hint}`}
                  onClick={() => setSortKey(coluna.key)}
                  className={`inline-flex items-center gap-1 whitespace-nowrap ${
                    sortKey === coluna.key ? 'font-semibold text-foreground' : ''
                  }`}
                >
                  {coluna.label}
                  {sortKey === coluna.key &&
                    (coluna.key === 'averageMinutesToComplete' ? (
                      <ArrowUp className="size-3" aria-hidden="true" />
                    ) : (
                      <ArrowDown className="size-3" aria-hidden="true" />
                    ))}
                </button>
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {ordenados.map((driver) => (
            <TableRow key={driver.driverId}>
              <TableCell>
                <Link
                  className="font-medium text-primary underline-offset-4 hover:underline"
                  href={`/entregadores/${driver.driverId}`}
                >
                  {driver.driverName}
                  <span className="block text-xs text-muted-foreground">{driver.driverEmail}</span>
                </Link>
              </TableCell>
              <TableCell className="tabular-nums">{driver.completedCount}</TableCell>
              <TableCell className="tabular-nums">
                {percentual(driver.completionRate)}
                {(driver.failedCount > 0 || driver.cancelledAfterAcceptCount > 0) && (
                  <span className="block text-xs text-muted-foreground">
                    {driver.failedCount > 0 && `${driver.failedCount} não entregue`}
                    {driver.failedCount > 0 && driver.cancelledAfterAcceptCount > 0 && ' · '}
                    {driver.cancelledAfterAcceptCount > 0 &&
                      `${driver.cancelledAfterAcceptCount} cancelada`}
                  </span>
                )}
              </TableCell>
              <TableCell className="tabular-nums">
                {percentual(driver.acceptanceRate)}
                {driver.offersReceived > 0 && (
                  <span className="block text-xs text-muted-foreground">
                    {driver.offersAccepted} de {driver.offersReceived}
                  </span>
                )}
              </TableCell>
              <TableCell className="tabular-nums">
                {minutos(driver.averageMinutesToComplete, driver.timedSamples)}
              </TableCell>
              <TableCell className="tabular-nums">{money(driver.driverValue)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <p className="px-4 py-3 text-xs text-muted-foreground">
        Clique num título para reordenar. Não há nota única de desempenho de propósito: cada coluna
        mede uma coisa, e qual delas importa é decisão de quem opera. O número entre parênteses no
        tempo médio é quantas entregas entraram na média.
      </p>
    </div>
  );
}
