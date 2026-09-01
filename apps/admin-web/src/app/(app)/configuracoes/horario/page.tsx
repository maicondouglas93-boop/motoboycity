'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@motoboycity/api-client';
import type { BusinessHoursResult } from '@motoboycity/types';
import { Plus, Trash2 } from 'lucide-react';
import { CabecalhoDeConfiguracao } from '@/components/settings/estado-da-configuracao';
import { CalendarClock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { adminBusinessHoursApi, adminPlatformSettingsApi } from '@/lib/api-client';
import { session } from '@/lib/session';

const WEEKDAYS = [
  'Domingo',
  'Segunda-feira',
  'Terça-feira',
  'Quarta-feira',
  'Quinta-feira',
  'Sexta-feira',
  'Sábado',
];

interface RangeDraft {
  key: string;
  startTime: string;
  endTime: string;
}

function toMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return (hours ?? 0) * 60 + (minutes ?? 0);
}

function toTime(minutes: number): string {
  return `${String(Math.floor(minutes / 60) % 24).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

function seedFromHours(hours: BusinessHoursResult['hours']): RangeDraft[][] {
  const porDia: RangeDraft[][] = Array.from({ length: 7 }, () => []);
  for (const hour of hours) {
    porDia[hour.weekday]?.push({
      key: hour.id,
      startTime: toTime(hour.startMinute),
      endTime: toTime(hour.endMinute),
    });
  }
  return porDia;
}

/** `qualquer` significa um ciclo diário às 00:00, e não liberação imediata. */
const DIAS_DO_SAQUE = [
  { valor: 'qualquer', rotulo: 'Todos os dias, às 00:00' },
  { valor: '0', rotulo: 'Domingo' },
  { valor: '1', rotulo: 'Segunda-feira' },
  { valor: '2', rotulo: 'Terça-feira' },
  { valor: '3', rotulo: 'Quarta-feira' },
  { valor: '4', rotulo: 'Quinta-feira' },
  { valor: '5', rotulo: 'Sexta-feira' },
  { valor: '6', rotulo: 'Sábado' },
] as const;

export default function BusinessHoursPage() {
  const token = session.getToken();
  const queryClient = useQueryClient();
  const [toggleError, setToggleError] = useState<string | null>(null);
  const [withdrawalError, setWithdrawalError] = useState<string | null>(null);

  const settingsQuery = useQuery({
    queryKey: ['admin', 'platform-settings'],
    queryFn: () => adminPlatformSettingsApi.get(token as string),
    enabled: Boolean(token),
  });

  const withdrawalMutation = useMutation({
    mutationFn: (weekday: number | null) =>
      adminPlatformSettingsApi.update(token as string, { withdrawalWeekday: weekday }),
    onSuccess: () => {
      setWithdrawalError(null);
      void queryClient.invalidateQueries({ queryKey: ['admin', 'platform-settings'] });
    },
    onError: (mutationError) =>
      setWithdrawalError(
        mutationError instanceof ApiError
          ? mutationError.message
          : 'Não foi possível mudar o dia da liberação e do saque.',
      ),
  });

  const hoursQuery = useQuery({
    queryKey: ['admin', 'business-hours'],
    queryFn: () => adminBusinessHoursApi.get(token as string),
    enabled: Boolean(token),
    // "Aberto agora" vira sozinho quando a faixa fecha.
    refetchInterval: 60_000,
  });

  const toggleMutation = useMutation({
    mutationFn: (enabled: boolean) =>
      adminPlatformSettingsApi.update(token as string, { businessHoursEnabled: enabled }),
    onSuccess: () => {
      setToggleError(null);
      void queryClient.invalidateQueries({ queryKey: ['admin', 'business-hours'] });
      void queryClient.invalidateQueries({ queryKey: ['admin', 'platform-settings'] });
    },
    onError: (mutationError) =>
      setToggleError(
        mutationError instanceof ApiError
          ? mutationError.message
          : 'Não foi possível mudar o bloqueio.',
      ),
  });

  if (!token) {
    return <p className="text-sm text-muted-foreground">Faça login como administrador.</p>;
  }

  /**
   * Falha de carregamento nao pode virar lista vazia.
   *
   * Horario de funcionamento decide se a loja consegue lancar pedido. Tela em
   * branco aqui parece configuracao ausente.
   */
  if (hoursQuery.isError) {
    return (
      <p className="text-sm text-destructive">
        Não foi possível carregar o horário de funcionamento. Recarregue a página antes de alterar
        qualquer coisa.
      </p>
    );
  }

  const data = hoursQuery.data;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/configuracoes" className="text-sm text-muted-foreground underline">
          ← Configurações
        </Link>
      </div>

      <CabecalhoDeConfiguracao
        icon={CalendarClock}
        tom="horarios"
        titulo="Horário de funcionamento"
        descricao="Fora do horário, a loja não consegue enviar pedido. Um dia sem faixa nenhuma é um dia fechado, e duas faixas no mesmo dia deixam a pausa do almoço no meio."
        situacao={
          !data
            ? null
            : !data.enabled
              ? { estado: 'desligado', texto: 'Sem bloqueio de horário' }
              : data.openNow
                ? { estado: 'definido', texto: 'Aberto agora' }
                : {
                    estado: 'definido',
                    texto: data.nextOpeningLabel
                      ? `Fechado · abre ${data.nextOpeningLabel}`
                      : 'Fechado agora',
                  }
        }
      />

      <Card>
        <CardContent className="space-y-3 pt-6">
          <div>
            <p className="font-medium">Dia da liberação dos repasses e do saque</p>
            <p className="text-sm text-muted-foreground">
              Às 00:00 do dia escolhido, o dinheiro das entregas sai do saldo bloqueado e fica
              disponível. A solicitação de saque é aceita nesse mesmo dia. Em “todos os dias”, a
              liberação acontece diariamente às 00:00.
            </p>
          </div>
          <select
            aria-label="Dia da liberação dos repasses e do saque"
            className="h-9 rounded-md border bg-background px-3 text-sm"
            value={
              settingsQuery.data?.withdrawalWeekday === null ||
              settingsQuery.data?.withdrawalWeekday === undefined
                ? 'qualquer'
                : String(settingsQuery.data.withdrawalWeekday)
            }
            disabled={settingsQuery.isLoading || withdrawalMutation.isPending}
            onChange={(event) =>
              withdrawalMutation.mutate(
                event.target.value === 'qualquer' ? null : Number(event.target.value),
              )
            }
          >
            {DIAS_DO_SAQUE.map((dia) => (
              <option key={dia.valor} value={dia.valor}>
                {dia.rotulo}
              </option>
            ))}
          </select>
          {withdrawalError && <p className="text-sm text-destructive">{withdrawalError}</p>}
          {/*
            O aviso existe porque a regra tambem vive dentro do aplicativo
            instalado. Trocar o dia aqui so chega ao motoboy depois de um APK
            novo — ate la o app mostra o dia antigo, e o servidor recusa no dia
            que o app libera.
          */}
          <p className="rounded-lg border border-primary/20 bg-admin-soft/50 px-3 py-2 text-xs text-muted-foreground">
            O servidor recalcula também os repasses que ainda estão bloqueados. O APK pilot.17
            precisa estar instalado para o texto e o botão de saque acompanharem o dia escolhido.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-6">
          <div>
            <p className="font-medium">
              Bloquear pedidos fora do horário{' '}
              {data?.enabled ? (
                <Badge className="ml-1 bg-colete text-asfalto">Ligado</Badge>
              ) : (
                <Badge variant="secondary" className="ml-1">
                  Desligado
                </Badge>
              )}
            </p>
            {/*
              Desligado por padrao: uma operacao que nunca configurou horario nao
              pode acordar recusando pedidos porque a tabela esta vazia.
            */}
            <p className="text-sm text-muted-foreground">
              Desligado, as faixas abaixo ficam só como referência e nada é recusado.
            </p>
            {data && (
              <p className="mt-1 text-sm">
                Agora: <strong>{data.openNow ? 'aberto' : 'fechado'}</strong>
                {!data.openNow && data.nextOpeningLabel && <> · abre {data.nextOpeningLabel}</>}
              </p>
            )}
          </div>
          <Button
            type="button"
            variant={data?.enabled ? 'default' : 'outline'}
            disabled={!data || toggleMutation.isPending}
            onClick={() => toggleMutation.mutate(!data?.enabled)}
          >
            {data?.enabled ? 'Desligar bloqueio' : 'Ligar bloqueio'}
          </Button>
        </CardContent>
      </Card>

      {toggleError && <p className="text-sm text-destructive">{toggleError}</p>}

      {/*
        O formulario so monta depois que os dados chegam, e semeia o estado uma
        unica vez. Ressincronizar a cada recarga apagaria o que a pessoa esta
        editando — e a consulta recarrega sozinha a cada minuto, para manter o
        "aberto agora" vivo.
      */}
      {data ? (
        <BusinessHoursForm initial={data} token={token} />
      ) : (
        <p className="text-sm text-muted-foreground">Carregando horário...</p>
      )}
    </div>
  );
}

function BusinessHoursForm({ initial, token }: { initial: BusinessHoursResult; token: string }) {
  const queryClient = useQueryClient();
  const [byWeekday, setByWeekday] = useState<RangeDraft[][]>(() => seedFromHours(initial.hours));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const saveMutation = useMutation({
    mutationFn: () =>
      adminBusinessHoursApi.replace(token, {
        hours: byWeekday.flatMap((faixas, weekday) =>
          faixas.map((faixa) => ({
            weekday,
            startMinute: toMinutes(faixa.startTime),
            endMinute: toMinutes(faixa.endTime),
          })),
        ),
      }),
    onSuccess: () => {
      setError(null);
      setSaved(true);
      void queryClient.invalidateQueries({ queryKey: ['admin', 'business-hours'] });
    },
    onError: (mutationError) => {
      setSaved(false);
      setError(
        mutationError instanceof ApiError
          ? mutationError.message
          : 'Não foi possível salvar o horário.',
      );
    },
  });

  function addRange(weekday: number) {
    setSaved(false);
    setByWeekday((current) =>
      current.map((faixas, index) =>
        index === weekday
          ? [...faixas, { key: crypto.randomUUID(), startTime: '08:00', endTime: '18:00' }]
          : faixas,
      ),
    );
  }

  function updateRange(weekday: number, rangeIndex: number, patch: Partial<RangeDraft>) {
    setSaved(false);
    setByWeekday((current) =>
      current.map((faixas, index) =>
        index === weekday
          ? faixas.map((faixa, i) => (i === rangeIndex ? { ...faixa, ...patch } : faixa))
          : faixas,
      ),
    );
  }

  function removeRange(weekday: number, rangeIndex: number) {
    setSaved(false);
    setByWeekday((current) =>
      current.map((faixas, index) =>
        index === weekday ? faixas.filter((_, i) => i !== rangeIndex) : faixas,
      ),
    );
  }

  /** Copia o dia para segunda a sexta — o atalho que evita cinco vezes o mesmo trabalho. */
  function copyToWeekdays(weekday: number) {
    setSaved(false);
    setByWeekday((current) => {
      const modelo = current[weekday] ?? [];
      return current.map((faixas, index) =>
        index >= 1 && index <= 5
          ? modelo.map((faixa) => ({ ...faixa, key: crypto.randomUUID() }))
          : faixas,
      );
    });
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const invalida = byWeekday.some((faixas) =>
      faixas.some((faixa) => toMinutes(faixa.startTime) === toMinutes(faixa.endTime)),
    );
    if (invalida) {
      return setError('Uma faixa não pode abrir e fechar no mesmo horário.');
    }
    saveMutation.mutate();
  }

  return (
    <form className="space-y-3" onSubmit={submit}>
      {WEEKDAYS.map((label, weekday) => {
        const faixas = byWeekday[weekday] ?? [];
        return (
          <Card key={label}>
            <CardContent className="pt-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <strong className="text-sm">{label}</strong>
                  {faixas.length === 0 && (
                    <Badge variant="secondary" className="text-xs">
                      Fechado
                    </Badge>
                  )}
                </div>
                <div className="flex gap-2">
                  {faixas.length > 0 && weekday >= 1 && weekday <= 5 && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => copyToWeekdays(weekday)}
                    >
                      Repetir de seg. a sex.
                    </Button>
                  )}
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => addRange(weekday)}
                  >
                    <Plus className="mr-1.5 size-3.5" aria-hidden="true" />
                    Faixa
                  </Button>
                </div>
              </div>

              {faixas.length > 0 && (
                <ul className="mt-3 space-y-2">
                  {faixas.map((faixa, rangeIndex) => (
                    <li key={faixa.key} className="flex flex-wrap items-end gap-2">
                      <div className="space-y-1">
                        <Label className="text-xs">Abre</Label>
                        <Input
                          type="time"
                          value={faixa.startTime}
                          onChange={(event) =>
                            updateRange(weekday, rangeIndex, { startTime: event.target.value })
                          }
                          className="w-28"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Fecha</Label>
                        <Input
                          type="time"
                          value={faixa.endTime}
                          onChange={(event) =>
                            updateRange(weekday, rangeIndex, { endTime: event.target.value })
                          }
                          className="w-28"
                        />
                      </div>
                      {toMinutes(faixa.endTime) <= toMinutes(faixa.startTime) && (
                        <span className="pb-2 text-xs text-muted-foreground">vira o dia</span>
                      )}
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        aria-label="Remover faixa"
                        onClick={() => removeRange(weekday, rangeIndex)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        );
      })}

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={saveMutation.isPending}>
          {saveMutation.isPending ? 'Salvando...' : 'Salvar horário'}
        </Button>
        {saved && !saveMutation.isPending && (
          <span className="text-sm text-status-entregue">Horário salvo.</span>
        )}
      </div>
    </form>
  );
}
