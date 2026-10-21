'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@motoboycity/api-client';
import type { AdminDriverDetail, DriverWorkSchedule } from '@motoboycity/types';
import {
  DIAS_DA_SEMANA,
  MAX_TURNOS_POR_DIA,
  ORDEM_DA_SEMANA,
  driverWorkScheduleSchema,
  escalaVazia,
  textoDoTurno,
  turnoPassaDaMeiaNoite,
  turnosEmOrdem,
} from '@motoboycity/validation';
import { CalendarClock, Plus, Trash2 } from 'lucide-react';
import { adminDriversApi } from '@/lib/api-client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type Turno = { key: string; start: string; end: string };
type Rascunho = Record<number, Turno[]>;

let proximaChave = 0;
function novaChave(): string {
  proximaChave += 1;
  return `turno-${proximaChave}`;
}

function paraRascunho(escala: DriverWorkSchedule | null): Rascunho {
  const base = escala ?? escalaVazia();
  return Object.fromEntries(
    base.days.map((dia) => [
      dia.weekday,
      turnosEmOrdem(dia.shifts).map((turno) => ({ ...turno, key: novaChave() })),
    ]),
  );
}

function paraEscala(rascunho: Rascunho): DriverWorkSchedule {
  return {
    days: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
      weekday,
      shifts: (rascunho[weekday] ?? []).map(({ start, end }) => ({ start, end })),
    })),
  };
}

/**
 * A escala do motoboy: a semana fixa em que ele pode trabalhar.
 *
 * Sem escala ele trabalha a qualquer hora. Com escala, fora dos turnos ele nao
 * consegue ficar Ativo e nao recebe pedido novo; se o turno acaba com ele
 * Ativo, ele termina o que ja pegou. A oferta manual da central continua
 * podendo chegar a ele.
 */
export function DriverScheduleCard({
  driver,
  token,
}: {
  driver: Pick<AdminDriverDetail, 'id' | 'name' | 'workSchedule' | 'workScheduleStatus'>;
  token: string;
}) {
  const queryClient = useQueryClient();
  // A API anterior a escala nao manda o campo: todo motoboy trabalhava livre.
  const escala = driver.workSchedule ?? null;
  const status = driver.workScheduleStatus ?? null;
  const [editando, setEditando] = useState(false);
  const [removendo, setRemovendo] = useState(false);
  const [rascunho, setRascunho] = useState<Rascunho>(() => paraRascunho(escala));

  const salvar = useMutation({
    mutationFn: (proxima: DriverWorkSchedule | null) =>
      adminDriversApi.updateSchedule(token, driver.id, { schedule: proxima }),
    onSuccess: (detalhe) => {
      queryClient.setQueryData(['admin', 'driver', driver.id], detalhe);
      void queryClient.invalidateQueries({ queryKey: ['admin', 'drivers'] });
      setEditando(false);
      setRemovendo(false);
    },
  });

  const conferencia = driverWorkScheduleSchema.safeParse(paraEscala(rascunho));
  const problemas = conferencia.success
    ? []
    : [...new Set(conferencia.error.issues.map((issue) => issue.message))];

  function abrirEdicao() {
    setRascunho(paraRascunho(escala));
    setRemovendo(false);
    salvar.reset();
    setEditando(true);
  }

  function mudarTurno(weekday: number, indice: number, mudanca: Partial<Turno>) {
    setRascunho((atual) => ({
      ...atual,
      [weekday]: (atual[weekday] ?? []).map((turno, i) =>
        i === indice ? { ...turno, ...mudanca } : turno,
      ),
    }));
  }

  function acrescentarTurno(weekday: number) {
    setRascunho((atual) => ({
      ...atual,
      [weekday]: [...(atual[weekday] ?? []), { key: novaChave(), start: '11:00', end: '15:00' }],
    }));
  }

  function removerTurno(weekday: number, indice: number) {
    setRascunho((atual) => ({
      ...atual,
      [weekday]: (atual[weekday] ?? []).filter((_, i) => i !== indice),
    }));
  }

  /** Copia os turnos de um dia para outros: de segunda a sexta, ou para a semana inteira. */
  function repetir(weekday: number, dias: number[]) {
    setRascunho((atual) => {
      const modelo = atual[weekday] ?? [];
      const proximo = { ...atual };
      for (const dia of dias) {
        proximo[dia] = modelo.map((turno) => ({ ...turno, key: novaChave() }));
      }
      return proximo;
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          <CalendarClock className="size-4" aria-hidden="true" /> Escala
          {status && (
            <Badge variant={status.onShift ? 'default' : 'secondary'}>{status.label}</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {!editando && (
          <>
            {escala ? (
              <ul className="space-y-1">
                {ORDEM_DA_SEMANA.map((weekday) => {
                  const turnos = escala.days.find((dia) => dia.weekday === weekday)?.shifts ?? [];
                  return (
                    <li key={weekday} className="flex gap-3">
                      <span className="w-20 shrink-0 font-medium">{DIAS_DA_SEMANA[weekday]}</span>
                      <span className={turnos.length === 0 ? 'text-muted-foreground' : undefined}>
                        {turnos.length === 0
                          ? 'Folga'
                          : turnosEmOrdem(turnos).map(textoDoTurno).join(' e ')}
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-muted-foreground">
                Sem escala: {driver.name} pode ficar Ativo e receber pedidos a qualquer hora.
              </p>
            )}

            {escala && (
              <p className="text-muted-foreground">
                Fora dos turnos ele não consegue ficar Ativo e não recebe pedidos novos. Se o turno
                acaba com ele Ativo, ele termina o que já pegou.
              </p>
            )}

            {!removendo ? (
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" onClick={abrirEdicao}>
                  {escala ? 'Editar escala' : 'Montar escala'}
                </Button>
                {escala && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      salvar.reset();
                      setRemovendo(true);
                    }}
                  >
                    Remover escala
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
                <p>
                  Sem escala, {driver.name} volta a poder ficar Ativo e receber pedidos a qualquer
                  hora.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    disabled={salvar.isPending}
                    onClick={() => salvar.mutate(null)}
                  >
                    {salvar.isPending ? 'Removendo...' : 'Confirmar: remover escala'}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={salvar.isPending}
                    onClick={() => setRemovendo(false)}
                  >
                    Voltar
                  </Button>
                </div>
              </div>
            )}
          </>
        )}

        {editando && (
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              if (conferencia.success) salvar.mutate(conferencia.data);
            }}
          >
            <p className="text-muted-foreground">
              Marque os turnos de cada dia, no horário de Brasília. Dia sem turno é folga. Um turno
              que termina antes de começar passa da meia-noite.
            </p>

            <ul className="divide-y rounded-lg border">
              {ORDEM_DA_SEMANA.map((weekday) => {
                const turnos = rascunho[weekday] ?? [];
                return (
                  <li key={weekday} className="space-y-2 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium">
                        {DIAS_DA_SEMANA[weekday]}
                        {turnos.length === 0 && (
                          <span className="ml-2 font-normal text-muted-foreground">Folga</span>
                        )}
                      </span>
                      <div className="flex flex-wrap gap-2">
                        {turnos.length > 0 && weekday >= 1 && weekday <= 5 && (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => repetir(weekday, [1, 2, 3, 4, 5])}
                          >
                            Repetir de seg. a sex.
                          </Button>
                        )}
                        {turnos.length > 0 && (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => repetir(weekday, [0, 1, 2, 3, 4, 5, 6])}
                          >
                            Repetir em todos os dias
                          </Button>
                        )}
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={turnos.length >= MAX_TURNOS_POR_DIA}
                          onClick={() => acrescentarTurno(weekday)}
                        >
                          <Plus className="mr-1.5 size-3.5" aria-hidden="true" />
                          Turno
                        </Button>
                      </div>
                    </div>

                    {turnos.length > 0 && (
                      <ul className="space-y-2">
                        {turnos.map((turno, indice) => (
                          <li key={turno.key} className="flex flex-wrap items-end gap-2">
                            <div className="space-y-1">
                              <Label className="text-xs" htmlFor={`${turno.key}-inicio`}>
                                Início
                              </Label>
                              <Input
                                id={`${turno.key}-inicio`}
                                type="time"
                                required
                                value={turno.start}
                                onChange={(event) =>
                                  mudarTurno(weekday, indice, { start: event.target.value })
                                }
                                className="w-28"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs" htmlFor={`${turno.key}-fim`}>
                                Fim
                              </Label>
                              <Input
                                id={`${turno.key}-fim`}
                                type="time"
                                required
                                value={turno.end}
                                onChange={(event) =>
                                  mudarTurno(weekday, indice, { end: event.target.value })
                                }
                                className="w-28"
                              />
                            </div>
                            {turno.start !== turno.end &&
                              /^\d{2}:\d{2}$/.test(turno.start) &&
                              /^\d{2}:\d{2}$/.test(turno.end) &&
                              turnoPassaDaMeiaNoite(turno) && (
                                <span className="pb-2 text-xs text-muted-foreground">
                                  termina no dia seguinte
                                </span>
                              )}
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              aria-label={`Remover turno de ${DIAS_DA_SEMANA[weekday]?.toLowerCase()}`}
                              onClick={() => removerTurno(weekday, indice)}
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>

            {problemas.length > 0 && (
              <ul role="alert" className="space-y-1 text-destructive">
                {problemas.map((problema) => (
                  <li key={problema}>{problema}</li>
                ))}
              </ul>
            )}

            <div className="flex flex-wrap gap-2">
              <Button type="submit" size="sm" disabled={!conferencia.success || salvar.isPending}>
                {salvar.isPending ? 'Salvando...' : 'Salvar escala'}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={salvar.isPending}
                onClick={() => setEditando(false)}
              >
                Cancelar
              </Button>
            </div>
          </form>
        )}

        {salvar.isError && (
          <p role="alert" className="text-destructive">
            {salvar.error instanceof ApiError
              ? salvar.error.message
              : 'Não foi possível salvar a escala.'}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
