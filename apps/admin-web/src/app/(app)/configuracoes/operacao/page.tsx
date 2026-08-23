'use client';

import { useState, type SubmitEvent } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@motoboycity/api-client';
import type { UpdatePlatformSettingsInput } from '@motoboycity/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { adminPlatformSettingsApi } from '@/lib/api-client';
import { session } from '@/lib/session';

// Os limites espelham `updatePlatformSettingsSchema`; validar aqui evita uma
// ida ao servidor só para receber o mesmo erro de volta.
const TIMEOUT_MIN_SECONDS = 10;
const TIMEOUT_MAX_SECONDS = 600;
const RADIUS_MIN_METERS = 10;
const RADIUS_MAX_METERS = 2000;
// Zero e permitido e vale "sem restricao" — escrito por quem decidiu que nao
// quer trava, em vez de deixado em branco por esquecimento.
const MIN_MINUTES_MIN = 0;
const MIN_MINUTES_MAX = 240;

export default function OperationSettingsPage() {
  const token = session.getToken();
  const queryClient = useQueryClient();

  const [timeoutInput, setTimeoutInput] = useState('');
  const [radiusInput, setRadiusInput] = useState('');
  const [minCollectInput, setMinCollectInput] = useState('');
  const [minDeliverInput, setMinDeliverInput] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const settingsQuery = useQuery({
    queryKey: ['admin', 'platform-settings'],
    queryFn: () => adminPlatformSettingsApi.get(token as string),
    enabled: Boolean(token),
  });

  const updateMutation = useMutation({
    mutationFn: (payload: UpdatePlatformSettingsInput) =>
      adminPlatformSettingsApi.update(token as string, payload),
    onSuccess: () => {
      setFormError(null);
      setTimeoutInput('');
      setRadiusInput('');
      setMinCollectInput('');
      setMinDeliverInput('');
      void queryClient.invalidateQueries({ queryKey: ['admin', 'platform-settings'] });
    },
    onError: (error) => {
      setFormError(error instanceof ApiError ? error.message : 'Não foi possível salvar.');
    },
  });

  if (!token) {
    return (
      <p className="text-sm text-muted-foreground">
        Faça login como administrador para ver as configurações de operação.
      </p>
    );
  }

  const settings = settingsQuery.data;

  function parseField(
    raw: string,
    label: string,
    min: number,
    max: number,
  ): { value?: number; error?: string } {
    if (!raw.trim()) {
      return {};
    }

    const parsed = Number(raw.trim());
    if (!Number.isInteger(parsed)) {
      return { error: `${label} deve ser um número inteiro.` };
    }
    if (parsed < min || parsed > max) {
      return { error: `${label} deve estar entre ${min} e ${max}.` };
    }
    return { value: parsed };
  }

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const timeout = parseField(
      timeoutInput,
      'O tempo de resposta',
      TIMEOUT_MIN_SECONDS,
      TIMEOUT_MAX_SECONDS,
    );
    const radius = parseField(
      radiusInput,
      'O raio de retorno',
      RADIUS_MIN_METERS,
      RADIUS_MAX_METERS,
    );

    const minCollect = parseField(
      minCollectInput,
      'O tempo mínimo da coleta',
      MIN_MINUTES_MIN,
      MIN_MINUTES_MAX,
    );
    const minDeliver = parseField(
      minDeliverInput,
      'O tempo mínimo da entrega',
      MIN_MINUTES_MIN,
      MIN_MINUTES_MAX,
    );

    const error = timeout.error ?? radius.error ?? minCollect.error ?? minDeliver.error;
    if (error) {
      setFormError(error);
      return;
    }

    if (
      timeout.value === undefined &&
      radius.value === undefined &&
      minCollect.value === undefined &&
      minDeliver.value === undefined
    ) {
      setFormError('Preencha ao menos um dos campos para salvar.');
      return;
    }

    updateMutation.mutate({
      ...(timeout.value !== undefined && { dispatchOfferTimeoutSeconds: timeout.value }),
      ...(radius.value !== undefined && { returnProximityRadiusMeters: radius.value }),
      ...(minCollect.value !== undefined && { minMinutesBeforeCollect: minCollect.value }),
      ...(minDeliver.value !== undefined && { minMinutesBeforeDeliver: minDeliver.value }),
    });
  }

  return (
    <div className="space-y-6">
      <Link href="/configuracoes" className="text-sm text-muted-foreground hover:underline">
        ← Configurações
      </Link>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Operação do despacho e do retorno</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {settingsQuery.isSuccess && (
            <dl className="space-y-1 text-sm">
              <div className="flex flex-wrap gap-x-2">
                <dt className="text-muted-foreground">Tempo de resposta da oferta:</dt>
                <dd>
                  {settings?.dispatchOfferTimeoutSeconds === null ? (
                    <span className="text-destructive">
                      não configurado — nenhum pedido pode ser despachado
                    </span>
                  ) : (
                    `${settings?.dispatchOfferTimeoutSeconds} segundos`
                  )}
                </dd>
              </div>
              <div className="flex flex-wrap gap-x-2">
                <dt className="text-muted-foreground">Raio para concluir retorno:</dt>
                <dd>
                  {settings?.returnProximityRadiusMeters === null ? (
                    <span className="text-destructive">
                      não configurado — nenhum retorno pode ser fechado
                    </span>
                  ) : (
                    `${settings?.returnProximityRadiusMeters} metros`
                  )}
                </dd>
              </div>
              <div className="flex flex-wrap gap-x-2">
                <dt className="text-muted-foreground">
                  Tempo mínimo declarado (coleta / entrega):
                </dt>
                <dd>
                  {/*
                    Nao configurado aqui NAO e erro, ao contrario dos dois campos
                    acima: e a operacao dizendo que nao quer trava. Por isso sai
                    em texto neutro e nao em vermelho.
                  */}
                  {settings?.minMinutesBeforeCollect === null &&
                  settings?.minMinutesBeforeDeliver === null
                    ? 'sem restrição'
                    : `${settings?.minMinutesBeforeCollect ?? 0} / ${
                        settings?.minMinutesBeforeDeliver ?? 0
                      } minuto(s)`}
                </dd>
              </div>
              {settings?.updatedBy && (
                <div className="flex flex-wrap gap-x-2">
                  <dt className="text-muted-foreground">Última alteração por:</dt>
                  <dd>{settings.updatedBy.name}</dd>
                </div>
              )}
            </dl>
          )}

          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="dispatch-timeout">Tempo de resposta da oferta (segundos)</Label>
                <Input
                  id="dispatch-timeout"
                  inputMode="numeric"
                  placeholder={`${TIMEOUT_MIN_SECONDS} a ${TIMEOUT_MAX_SECONDS}`}
                  value={timeoutInput}
                  onChange={(event) => setTimeoutInput(event.target.value)}
                  className="w-48"
                />
                <p className="text-xs text-muted-foreground">
                  Quanto o motoboy tem para aceitar antes da oferta passar para o próximo da fila.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="return-radius">Raio para concluir retorno (metros)</Label>
                <Input
                  id="return-radius"
                  inputMode="numeric"
                  placeholder={`${RADIUS_MIN_METERS} a ${RADIUS_MAX_METERS}`}
                  value={radiusInput}
                  onChange={(event) => setRadiusInput(event.target.value)}
                  className="w-48"
                />
                <p className="text-xs text-muted-foreground">
                  Distância em linha reta até o endereço de coleta aceita como “chegou”.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="min-collect">Tempo mínimo até a coleta (minutos)</Label>
                <Input
                  id="min-collect"
                  inputMode="numeric"
                  placeholder={`${MIN_MINUTES_MIN} a ${MIN_MINUTES_MAX}`}
                  value={minCollectInput}
                  onChange={(event) => setMinCollectInput(event.target.value)}
                  className="w-48"
                />
                <p className="text-xs text-muted-foreground">
                  Só vale quando o motoboy esquece de tocar e informa o horário depois. Impede
                  declarar a coleta no mesmo minuto do aceite.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="min-deliver">Tempo mínimo até a entrega (minutos)</Label>
                <Input
                  id="min-deliver"
                  inputMode="numeric"
                  placeholder={`${MIN_MINUTES_MIN} a ${MIN_MINUTES_MAX}`}
                  value={minDeliverInput}
                  onChange={(event) => setMinDeliverInput(event.target.value)}
                  className="w-48"
                />
                <p className="text-xs text-muted-foreground">
                  Mesma ideia na entrega. É o que impede faturar uma corrida declarando coleta e
                  entrega no mesmo minuto.
                </p>
              </div>
              <Button type="submit" disabled={updateMutation.isPending}>
                {updateMutation.isPending ? 'Salvando...' : 'Salvar'}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Deixe um campo em branco para manter o valor atual.
            </p>
          </form>

          {formError && <p className="text-sm text-destructive">{formError}</p>}
        </CardContent>
      </Card>
    </div>
  );
}
