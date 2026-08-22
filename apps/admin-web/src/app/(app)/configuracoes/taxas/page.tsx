'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@motoboycity/api-client';
import type { SurchargeItem } from '@motoboycity/types';
import type { UpsertSurchargePayload } from '@motoboycity/validation';
import { Plus, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { adminSurchargesApi } from '@/lib/api-client';
import { session } from '@/lib/session';

const WEEKDAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

interface ScheduleDraft {
  key: string;
  weekday: string;
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
}

function emptySchedule(): ScheduleDraft {
  return {
    key: crypto.randomUUID(),
    weekday: '',
    startDate: '',
    endDate: '',
    startTime: '18:00',
    endTime: '23:00',
  };
}

/** "18:30" vira 1110 minutos desde a meia-noite. */
function toMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return (hours ?? 0) * 60 + (minutes ?? 0);
}

function toTime(minutes: number): string {
  return `${String(Math.floor(minutes / 60) % 24).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

function describeSchedule(schedule: SurchargeItem['schedules'][number]): string {
  const dia = schedule.weekday === null ? 'Todo dia' : WEEKDAYS[schedule.weekday];
  const faixa = `${toTime(schedule.startMinute)} às ${toTime(schedule.endMinute)}`;
  const virada = schedule.endMinute <= schedule.startMinute ? ' (vira o dia)' : '';
  const periodo =
    schedule.startDate || schedule.endDate
      ? ` · ${schedule.startDate ?? '…'} a ${schedule.endDate ?? '…'}`
      : '';
  return `${dia}, ${faixa}${virada}${periodo}`;
}

export default function SurchargesPage() {
  const token = session.getToken();
  const queryClient = useQueryClient();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [type, setType] = useState<'PERCENTAGE' | 'FIXED'>('PERCENTAGE');
  const [value, setValue] = useState('');
  const [driverShare, setDriverShare] = useState('100');
  const [schedules, setSchedules] = useState<ScheduleDraft[]>([]);
  const [error, setError] = useState<string | null>(null);

  const listQuery = useQuery({
    queryKey: ['admin', 'surcharges'],
    queryFn: () => adminSurchargesApi.list(token as string),
    enabled: Boolean(token),
    /**
     * A tela mostra "valendo agora", que muda sozinha quando uma janela abre ou
     * fecha. Sem recarregar, o admin veria um estado congelado de minutos atrás
     * e concluiria que a taxa não está funcionando.
     */
    refetchInterval: 30_000,
  });

  function resetForm() {
    setEditingId(null);
    setName('');
    setType('PERCENTAGE');
    setValue('');
    setDriverShare('100');
    setSchedules([]);
    setError(null);
  }

  function startEditing(surcharge: SurchargeItem) {
    setEditingId(surcharge.id);
    setName(surcharge.name);
    setType(surcharge.type);
    setValue(String(surcharge.value).replace('.', ','));
    setDriverShare(String(surcharge.driverSharePercentage));
    setSchedules(
      surcharge.schedules.map((schedule) => ({
        key: schedule.id,
        weekday: schedule.weekday === null ? '' : String(schedule.weekday),
        startDate: schedule.startDate ?? '',
        endDate: schedule.endDate ?? '',
        startTime: toTime(schedule.startMinute),
        endTime: toTime(schedule.endMinute),
      })),
    );
    setError(null);
  }

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['admin', 'surcharges'] });
  const reportError = (mutationError: unknown, fallback: string) =>
    setError(mutationError instanceof ApiError ? mutationError.message : fallback);

  const saveMutation = useMutation({
    mutationFn: (payload: UpsertSurchargePayload) =>
      editingId
        ? adminSurchargesApi.update(token as string, editingId, payload)
        : adminSurchargesApi.create(token as string, payload),
    onSuccess: () => {
      resetForm();
      void invalidate();
    },
    onError: (mutationError) => reportError(mutationError, 'Não foi possível salvar a taxa.'),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ surcharge, on }: { surcharge: SurchargeItem; on: boolean }) =>
      on
        ? adminSurchargesApi.turnOn(token as string, surcharge.id)
        : adminSurchargesApi.turnOff(token as string, surcharge.id),
    onSuccess: invalidate,
    onError: (mutationError) => reportError(mutationError, 'Não foi possível mudar o interruptor.'),
  });

  const activeMutation = useMutation({
    mutationFn: ({ surcharge, on }: { surcharge: SurchargeItem; on: boolean }) =>
      on
        ? adminSurchargesApi.activate(token as string, surcharge.id)
        : adminSurchargesApi.deactivate(token as string, surcharge.id),
    onSuccess: invalidate,
    onError: (mutationError) => reportError(mutationError, 'Não foi possível mudar a taxa.'),
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => adminSurchargesApi.remove(token as string, id),
    onSuccess: () => {
      resetForm();
      void invalidate();
    },
    onError: (mutationError) => reportError(mutationError, 'Não foi possível excluir a taxa.'),
  });

  if (!token) {
    return <p className="text-sm text-muted-foreground">Faça login como administrador.</p>;
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const parsedValue = Number(value.replace(',', '.'));
    if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
      return setError('Informe um valor maior que zero.');
    }

    saveMutation.mutate({
      name: name.trim(),
      type,
      value: parsedValue,
      driverSharePercentage: Number(driverShare.replace(',', '.')) || 0,
      schedules: schedules.map((schedule) => ({
        weekday: schedule.weekday === '' ? null : Number(schedule.weekday),
        startDate: schedule.startDate || null,
        endDate: schedule.endDate || null,
        startMinute: toMinutes(schedule.startTime),
        endMinute: toMinutes(schedule.endTime),
      })),
    });
  }

  const surcharges = listQuery.data ?? [];

  return (
    <div className="space-y-6">
      <div>
        <Link href="/configuracoes" className="text-sm text-muted-foreground underline">
          ← Configurações
        </Link>
        <h1 className="mt-2 text-xl font-semibold">Taxas adicionais</h1>
        <p className="text-sm text-muted-foreground">
          Acréscimos para chuva, feriado, madrugada — o nome e a regra são seus. Cada taxa vale pelo
          interruptor manual ou por uma janela agendada, e basta uma das duas.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{editingId ? 'Editando taxa' : 'Nova taxa'}</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={submit}>
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="surcharge-name">Nome</Label>
                <Input
                  id="surcharge-name"
                  placeholder="Taxa de chuva"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  className="w-52"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="surcharge-type">Tipo</Label>
                <select
                  id="surcharge-type"
                  className="h-9 rounded-md border bg-background px-3 text-sm"
                  value={type}
                  onChange={(event) => setType(event.target.value as 'PERCENTAGE' | 'FIXED')}
                >
                  <option value="PERCENTAGE">Percentual</option>
                  <option value="FIXED">Valor fixo</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="surcharge-value">{type === 'PERCENTAGE' ? '%' : 'R$'}</Label>
                <Input
                  id="surcharge-value"
                  placeholder={type === 'PERCENTAGE' ? '20' : '3,00'}
                  value={value}
                  onChange={(event) => setValue(event.target.value)}
                  className="w-24"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="surcharge-share">Repasse ao entregador (%)</Label>
                <Input
                  id="surcharge-share"
                  placeholder="100"
                  value={driverShare}
                  onChange={(event) => setDriverShare(event.target.value)}
                  className="w-28"
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Janelas automáticas</Label>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setSchedules((current) => [...current, emptySchedule()])}
                >
                  <Plus className="mr-1.5 size-3.5" aria-hidden="true" />
                  Adicionar janela
                </Button>
              </div>
              {schedules.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Sem janela, a taxa só vale quando você ligar o interruptor.
                </p>
              ) : (
                <ul className="space-y-2">
                  {schedules.map((schedule, index) => (
                    <li
                      key={schedule.key}
                      className="flex flex-wrap items-end gap-2 rounded-lg border p-3"
                    >
                      <div className="space-y-1">
                        <Label className="text-xs">Dia</Label>
                        <select
                          className="h-9 rounded-md border bg-background px-2 text-sm"
                          value={schedule.weekday}
                          onChange={(event) =>
                            setSchedules((current) =>
                              current.map((item, itemIndex) =>
                                itemIndex === index
                                  ? { ...item, weekday: event.target.value }
                                  : item,
                              ),
                            )
                          }
                        >
                          <option value="">Todo dia</option>
                          {WEEKDAYS.map((label, weekday) => (
                            <option key={label} value={weekday}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </div>
                      {(
                        [
                          ['startTime', 'Das'],
                          ['endTime', 'Até'],
                        ] as const
                      ).map(([field, label]) => (
                        <div key={field} className="space-y-1">
                          <Label className="text-xs">{label}</Label>
                          <Input
                            type="time"
                            value={schedule[field]}
                            onChange={(event) =>
                              setSchedules((current) =>
                                current.map((item, itemIndex) =>
                                  itemIndex === index
                                    ? { ...item, [field]: event.target.value }
                                    : item,
                                ),
                              )
                            }
                            className="w-28"
                          />
                        </div>
                      ))}
                      {(
                        [
                          ['startDate', 'A partir de'],
                          ['endDate', 'Até o dia'],
                        ] as const
                      ).map(([field, label]) => (
                        <div key={field} className="space-y-1">
                          <Label className="text-xs">{label}</Label>
                          <Input
                            type="date"
                            value={schedule[field]}
                            onChange={(event) =>
                              setSchedules((current) =>
                                current.map((item, itemIndex) =>
                                  itemIndex === index
                                    ? { ...item, [field]: event.target.value }
                                    : item,
                                ),
                              )
                            }
                            className="w-40"
                          />
                        </div>
                      ))}
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        aria-label="Remover janela"
                        onClick={() =>
                          setSchedules((current) =>
                            current.filter((_, itemIndex) => itemIndex !== index),
                          )
                        }
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-xs text-muted-foreground">
                Fim antes do início atravessa a meia-noite — é assim que se configura madrugada. O
                horário é o de Brasília.
              </p>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="flex gap-2">
              <Button type="submit" disabled={saveMutation.isPending}>
                {saveMutation.isPending ? 'Salvando...' : editingId ? 'Salvar' : 'Criar taxa'}
              </Button>
              {editingId && (
                <Button type="button" variant="outline" onClick={resetForm}>
                  Cancelar
                </Button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      <section className="space-y-2">
        <h2 className="font-semibold">Taxas cadastradas</h2>
        {surcharges.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma taxa criada.</p>
        ) : (
          <ul className="space-y-2">
            {surcharges.map((surcharge) => (
              <li key={surcharge.id} className="rounded-lg border bg-card p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <strong>{surcharge.name}</strong>
                    <span className="text-sm text-muted-foreground">
                      {surcharge.type === 'PERCENTAGE'
                        ? `${surcharge.value}%`
                        : surcharge.value.toLocaleString('pt-BR', {
                            style: 'currency',
                            currency: 'BRL',
                          })}{' '}
                      · {surcharge.driverSharePercentage}% ao entregador
                    </span>
                    {/*
                      "Valendo agora" e o unico estado que importa na operacao, e
                      vem resolvido do servidor — o painel nao reavalia janela no
                      fuso, ou duas copias da regra divergiriam.
                    */}
                    {surcharge.activeNow && (
                      <Badge className="bg-colete text-asfalto">Valendo agora</Badge>
                    )}
                    {!surcharge.active && <Badge variant="secondary">Desativada</Badge>}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {surcharge.active && (
                      <Button
                        size="sm"
                        variant={surcharge.manuallyActive ? 'default' : 'outline'}
                        onClick={() =>
                          toggleMutation.mutate({ surcharge, on: !surcharge.manuallyActive })
                        }
                      >
                        {surcharge.manuallyActive ? 'Desligar agora' : 'Ligar agora'}
                      </Button>
                    )}
                    <Button size="sm" variant="outline" onClick={() => startEditing(surcharge)}>
                      Editar
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => activeMutation.mutate({ surcharge, on: !surcharge.active })}
                    >
                      {surcharge.active ? 'Desativar' : 'Reativar'}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-destructive hover:text-destructive"
                      onClick={() => removeMutation.mutate(surcharge.id)}
                    >
                      Excluir
                    </Button>
                  </div>
                </div>

                {surcharge.schedules.length > 0 && (
                  <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                    {surcharge.schedules.map((schedule) => (
                      <li key={schedule.id}>{describeSchedule(schedule)}</li>
                    ))}
                  </ul>
                )}
                {surcharge.manuallyActive && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Interruptor manual ligado — vale até você desligar.
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
