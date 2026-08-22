import type { DeliveryPeakHours } from '@motoboycity/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const WEEKDAY_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const WEEKDAY_LONG = [
  'domingo',
  'segunda-feira',
  'terça-feira',
  'quarta-feira',
  'quinta-feira',
  'sexta-feira',
  'sábado',
];

function formatHour(hour: number): string {
  return `${String(hour).padStart(2, '0')}h`;
}

/**
 * Maiuscula so na primeira letra. O `capitalize` do CSS capitaliza cada
 * palavra e transformaria "sexta-feira" em "Sexta-Feira", que esta errado em
 * portugues.
 */
function capitalizeFirst(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function formatAverage(value: number): string {
  return value.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
}

/**
 * Barra de volume.
 *
 * Só o pico usa o laranja da marca. A regra da paleta é que laranja significa
 * "tem motoboy na rua", então gastá-lo nas 24 barras o transformaria em
 * decoração e o olho pararia de encontrar o que importa — que aqui é
 * exatamente uma barra, a mais alta.
 */
function Bar({ ratio, highlighted }: { ratio: number; highlighted: boolean }) {
  // Piso visual para a hora vazia continuar sendo uma posição no eixo, e não
  // um buraco que o olho lê como ausência de dado.
  const height = ratio > 0 ? Math.max(ratio * 100, 4) : 1.5;

  return (
    <div
      className={`w-full rounded-t-sm ${highlighted ? 'bg-colete' : 'bg-asfalto/25'}`}
      style={{ height: `${height}%` }}
    />
  );
}

export function PeakHoursChart({ peakHours }: { peakHours: DeliveryPeakHours }) {
  const { byHour, byWeekday, busiestHour, busiestWeekday, totalConsidered, daysInPeriod } =
    peakHours;

  const maxHourCount = Math.max(...byHour.map((bucket) => bucket.count), 1);
  const maxWeekdayAverage = Math.max(...byWeekday.map((bucket) => bucket.averagePerOccurrence), 1);

  const peakHourBucket = busiestHour === null ? null : byHour[busiestHour];
  const peakWeekdayBucket = busiestWeekday === null ? null : byWeekday[busiestWeekday];
  const peakHourLabel = busiestHour === null ? '—' : formatHour(busiestHour);
  const peakWeekdayLabel =
    busiestWeekday === null ? '—' : capitalizeFirst(WEEKDAY_LONG[busiestWeekday]!);

  return (
    <section className="space-y-3">
      <div>
        <h2 className="font-semibold">Horários de pico</h2>
        <p className="text-sm text-muted-foreground">
          Quando os pedidos entram, no horário de Brasília. Serve para dimensionar quantos
          entregadores precisam estar na rua em cada faixa.
        </p>
      </div>

      {totalConsidered === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            Nenhum pedido criado no período.
          </CardContent>
        </Card>
      ) : (
        <>
          {/*
            A frase carrega os numeros porque o grafico sozinho nao tem eixo
            vertical: ele mostra a forma do dia, e quem monta escala precisa da
            grandeza — 2 pedidos por hora e 20 desenham a mesma barra.
          */}
          <p className="text-sm">
            Movimento maior às <strong>{peakHourLabel}</strong>
            {peakHourBucket && (
              <>
                {' '}
                — {peakHourBucket.count} {peakHourBucket.count === 1 ? 'pedido' : 'pedidos'} no
                período, {formatAverage(peakHourBucket.averagePerDay)} por dia
              </>
            )}
            . <strong>{peakWeekdayLabel}</strong> é o dia mais pesado
            {peakWeekdayBucket && (
              <>, com {formatAverage(peakWeekdayBucket.averagePerOccurrence)} por dia</>
            )}
            . Base: {totalConsidered} {totalConsidered === 1 ? 'pedido' : 'pedidos'} em{' '}
            {daysInPeriod} dias.
          </p>

          <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-normal text-muted-foreground">
                  Pedidos por hora do dia
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex h-40 items-end gap-[3px]" aria-hidden="true">
                  {byHour.map((bucket) => (
                    <div
                      key={bucket.hour}
                      className="flex h-full flex-1 items-end"
                      title={`${formatHour(bucket.hour)}: ${bucket.count} pedidos (${formatAverage(bucket.averagePerDay)}/dia)`}
                    >
                      <Bar
                        ratio={bucket.count / maxHourCount}
                        highlighted={bucket.hour === busiestHour}
                      />
                    </div>
                  ))}
                </div>
                <div
                  className="mt-1.5 flex justify-between font-mono text-[10px] text-muted-foreground"
                  aria-hidden="true"
                >
                  {[0, 6, 12, 18, 23].map((hour) => (
                    <span key={hour}>{formatHour(hour)}</span>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-normal text-muted-foreground">
                  Média por dia da semana
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex h-40 items-end gap-2" aria-hidden="true">
                  {byWeekday.map((bucket) => (
                    <div
                      key={bucket.weekday}
                      className="flex h-full flex-1 items-end"
                      title={`${WEEKDAY_LONG[bucket.weekday]}: ${formatAverage(bucket.averagePerOccurrence)} pedidos por dia, em ${bucket.occurrences} ocorrências`}
                    >
                      <Bar
                        ratio={bucket.averagePerOccurrence / maxWeekdayAverage}
                        highlighted={bucket.weekday === busiestWeekday}
                      />
                    </div>
                  ))}
                </div>
                <div
                  className="mt-1.5 flex gap-2 text-center text-[10px] text-muted-foreground"
                  aria-hidden="true"
                >
                  {byWeekday.map((bucket) => (
                    <span key={bucket.weekday} className="flex-1">
                      {WEEKDAY_SHORT[bucket.weekday]}
                    </span>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/*
            Os graficos sao `aria-hidden` e os numeros vivem aqui. Uma barra nao
            e legivel por leitor de tela nem por quem precisa do valor exato, e
            quem vai montar escala de entregador quer justamente o numero.
          */}
          <details className="rounded-md border bg-card">
            <summary className="cursor-pointer px-4 py-2 text-sm font-medium">
              Ver os números
            </summary>
            <div className="grid gap-6 border-t p-4 md:grid-cols-2">
              <div>
                <h3 className="mb-2 text-sm font-medium">Por hora</h3>
                <ul className="grid grid-cols-2 gap-x-4 font-mono text-xs sm:grid-cols-3">
                  {byHour
                    .filter((bucket) => bucket.count > 0)
                    .map((bucket) => (
                      <li key={bucket.hour} className="flex justify-between gap-2 tabular-nums">
                        <span className="text-muted-foreground">{formatHour(bucket.hour)}</span>
                        <span>{bucket.count}</span>
                      </li>
                    ))}
                </ul>
              </div>
              <div>
                <h3 className="mb-2 text-sm font-medium">Por dia da semana</h3>
                <ul className="font-mono text-xs">
                  {byWeekday.map((bucket) => (
                    <li key={bucket.weekday} className="flex justify-between gap-2 tabular-nums">
                      <span className="text-muted-foreground">
                        {WEEKDAY_SHORT[bucket.weekday]}
                        <span className="ml-1 opacity-60">({bucket.occurrences}x)</span>
                      </span>
                      <span>
                        {bucket.count}
                        <span className="ml-2 opacity-60">
                          {formatAverage(bucket.averagePerOccurrence)}/dia
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </details>
        </>
      )}
    </section>
  );
}
