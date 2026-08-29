'use client';

import { useState, type ReactNode, type SubmitEvent } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@motoboycity/api-client';
import type { UpdatePlatformSettingsInput } from '@motoboycity/types';
import {
  AlertCircle,
  ArrowLeft,
  BellRing,
  CheckCircle2,
  Clock3,
  ArrowRight,
  Crosshair,
  LoaderCircle,
  PowerOff,
  RotateCcw,
  Save,
  SlidersHorizontal,
  Truck,
  type LucideIcon,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { adminPlatformSettingsApi } from '@/lib/api-client';
import { session } from '@/lib/session';
import {
  ESTILO_DO_ESTADO,
  PilulaDeEstado,
  TONS,
  type EstadoDaConfiguracao,
  type Tom,
} from '@/components/settings/estado-da-configuracao';

// Os limites espelham `updatePlatformSettingsSchema`; validar aqui evita uma
// ida ao servidor só para receber o mesmo erro de volta.
const TIMEOUT_MIN_SECONDS = 10;
const TIMEOUT_MAX_SECONDS = 600;
const RADIUS_MIN_METERS = 10;
const RADIUS_MAX_METERS = 2000;
// Zero é permitido e vale "sem restrição" — escrito por quem decidiu que não
// quer trava, em vez de deixado em branco por esquecimento.
const MIN_MINUTES_MIN = 0;
const MIN_MINUTES_MAX = 240;
// Piso de 2: abaixo disso o aviso dispararia no intervalo normal entre dois
// pings e acusaria silêncio onde não há nenhum.
const SILENCE_MIN_MINUTES = 2;
const SILENCE_MAX_MINUTES = 120;
// Precisam ficar ACIMA da média da operação, ou a fila fica vermelha o tempo
// todo e a cor perde o sentido.
const SLA_MIN_MINUTES = 1;
const SLA_MAX_MINUTES = 480;
// Piso de 1 nos dois: zero desligaria o despacho inteiro, e um erro de digitação
// não pode ter esse poder. O lote mantém o teto do próprio formato; o limite
// simultâneo é mais alto para não bloquear operações sem teto prático.
const CONCURRENT_MIN = 1;
const CONCURRENT_MAX = 200;
const BATCH_MAX = 50;
// Piso de 50 m: abaixo disso o erro do próprio GPS urbano já passa do raio, e a
// regra recusaria entrega que realmente aconteceu.
/**
 * Precisao exigida quando a posicao do motoboy VIRA o destino.
 *
 * Sem valor salvo, o servidor usa 100 m — e a tela diz isso, em vez de mostrar
 * um campo vazio que pareceria "sem regra".
 */
const DEFERRED_ACCURACY_MIN = 10;
const DEFERRED_ACCURACY_MAX = 1000;
const DEFERRED_ACCURACY_PADRAO = 100;
const DELIVERY_RADIUS_MIN = 50;
const DELIVERY_RADIUS_MAX = 5000;

const NAO_CONFIGURADO = 'não configurado';
const DESLIGADO = 'desligado';

/**
 * As regras que podem ser DESLIGADAS pelo painel.
 *
 * Sao exatamente aquelas cujo nulo ja e um estado valido do dominio. Ficam de
 * fora o tempo de resposta da oferta e a comissao: ali o nulo nao desliga uma
 * regra, congela o despacho e impede precificar.
 */
type CampoDesligavel =
  | 'collectionProximityRadiusMeters'
  | 'deliveryProximityRadiusMeters'
  | 'returnProximityRadiusMeters'
  | 'pickupAssignmentTimeoutMinutes'
  | 'maxConcurrentDeliveriesPerDriver';

type SettingFieldProps = {
  id: string;
  label: string;
  description: ReactNode;
  value: string;
  onValueChange: (value: string) => void;
  placeholder: string;
  currentValue: string;
  unit: string;
  estado?: EstadoDaConfiguracao;
  /**
   * Presente = este campo pode ser DESLIGADO, e nao apenas alterado.
   *
   * So aparece onde o nulo e um estado valido da regra. Onde ele pararia a
   * plataforma — tempo de resposta da oferta, comissao — a opcao nao existe.
   */
  desligar?: {
    marcado: boolean;
    disponivel: boolean;
    onToggle: (marcado: boolean) => void;
  };
};

function SettingField({
  id,
  label,
  description,
  value,
  onValueChange,
  placeholder,
  currentValue,
  unit,
  estado = 'definido',
  desligar,
}: SettingFieldProps) {
  /**
   * Campo preenchido = alteração pendente.
   *
   * O cabeçalho da tela avisa que "campos em branco mantêm o valor atual", mas
   * nada dizia QUAIS foram preenchidos. Com oito campos, quem se distrai no
   * meio do caminho salva sem saber o que está mandando.
   */
  const vaiDesligar = desligar?.marcado === true;
  const vaiMudar = !vaiDesligar && value.trim().length > 0;
  const podeDesligar = desligar?.disponivel === true;

  return (
    <div
      className={`flex min-h-48 flex-col rounded-xl border p-4 transition-colors ${
        vaiDesligar
          ? 'border-alerta/45 bg-alerta/[0.05] ring-1 ring-inset ring-alerta/20'
          : vaiMudar
            ? 'border-primary/45 bg-primary/[0.04] ring-1 ring-inset ring-primary/15'
            : 'border-border/70 bg-muted/20 focus-within:border-primary/40 focus-within:bg-primary/[0.025]'
      }`}
    >
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <Label htmlFor={id} className="max-w-[70%] leading-5 text-admin-deep">
          {label}
        </Label>
        <PilulaDeEstado estado={estado}>{currentValue}</PilulaDeEstado>
      </div>

      <div className="relative">
        <Input
          id={id}
          inputMode="numeric"
          autoComplete="off"
          aria-describedby={`${id}-description`}
          placeholder={placeholder}
          value={vaiDesligar ? '' : value}
          disabled={vaiDesligar}
          onChange={(event) => onValueChange(event.target.value)}
          className="h-10 bg-background pr-24 text-base"
        />
        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs font-medium text-muted-foreground">
          {unit}
        </span>
      </div>

      {vaiDesligar ? (
        <p className="mt-3 flex items-center gap-1.5 text-xs font-medium text-alerta">
          <PowerOff className="size-3.5 shrink-0" aria-hidden="true" />
          Vai DESLIGAR esta regra — valor atual: {currentValue}
        </p>
      ) : vaiMudar ? (
        <p className="mt-3 flex items-center gap-1.5 text-xs font-medium text-primary">
          <ArrowRight className="size-3.5 shrink-0" aria-hidden="true" />
          Vai passar de {currentValue} para {value.trim()} {unit}
        </p>
      ) : (
        <p id={`${id}-description`} className="mt-3 text-xs leading-5 text-muted-foreground">
          {description}
        </p>
      )}

      {podeDesligar && (
        <button
          type="button"
          onClick={() => desligar?.onToggle(!vaiDesligar)}
          className={`mt-2 self-start text-xs font-semibold underline underline-offset-2 transition-colors ${
            vaiDesligar
              ? 'text-muted-foreground hover:text-admin-deep'
              : 'text-alerta/90 hover:text-alerta'
          }`}
        >
          {vaiDesligar ? 'Manter ligada' : 'Desligar esta regra'}
        </button>
      )}
    </div>
  );
}

function SettingsSection({
  icon: Icon,
  title,
  description,
  tom,
  children,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  tom: Tom;
  children: ReactNode;
}) {
  const cores = TONS[tom];
  return (
    <Card className="relative overflow-hidden">
      {/* Trilho colorido: separa as quatro secoes de relance, sem pesar a tela. */}
      <span aria-hidden="true" className={`absolute inset-y-0 left-0 w-1 ${cores.trilho}`} />
      <CardHeader className="border-b border-border/70 pb-4 pl-6">
        <div className="flex gap-3">
          <span
            className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${cores.icone}`}
          >
            <Icon className="size-5" aria-hidden="true" />
          </span>
          <div className="space-y-1">
            <CardTitle>{title}</CardTitle>
            <CardDescription className="leading-5">{description}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pl-6">
        <div className="grid gap-4 md:grid-cols-2">{children}</div>
      </CardContent>
    </Card>
  );
}

function CurrentValueRow({
  label,
  value,
  estado = 'definido',
  pendente,
}: {
  label: string;
  value: string;
  estado?: EstadoDaConfiguracao;
  /** Novo valor digitado no formulário, se houver. */
  pendente?: string;
}) {
  const estilo = ESTILO_DO_ESTADO[estado];

  return (
    <div className="flex items-start justify-between gap-4 border-b border-border/60 py-3 first:pt-0 last:border-0 last:pb-0">
      <dt className="text-xs leading-5 text-muted-foreground">{label}</dt>
      <dd className="max-w-[58%] text-right text-xs leading-5">
        {pendente ? (
          /*
            O resumo vira um "de -> para" enquanto ha alteracao pendente. Era a
            unica lista da tela que dizia o que esta valendo, e ela ficava
            imovel enquanto o admin digitava — entao nao dava para conferir o
            que ia ser salvo sem rolar de volta campo por campo.
          */
          <span className="inline-flex flex-wrap items-center justify-end gap-1">
            <span className="text-muted-foreground line-through">{value}</span>
            <ArrowRight className="size-3 shrink-0 text-primary" aria-hidden="true" />
            <span className="font-semibold text-primary">{pendente}</span>
          </span>
        ) : (
          <span className={`font-semibold ${estilo.texto}`}>{value}</span>
        )}
      </dd>
    </div>
  );
}

export default function OperationSettingsPage() {
  const token = session.getToken();
  const queryClient = useQueryClient();

  const [timeoutInput, setTimeoutInput] = useState('');
  const [pickupTimeoutInput, setPickupTimeoutInput] = useState('');
  const [aiqfomeDelayInput, setAiqfomeDelayInput] = useState('');
  const [collectionRadiusInput, setCollectionRadiusInput] = useState('');
  const [radiusInput, setRadiusInput] = useState('');
  const [minCollectInput, setMinCollectInput] = useState('');
  const [minDeliverInput, setMinDeliverInput] = useState('');
  const [silenceInput, setSilenceInput] = useState('');
  const [slaAcceptInput, setSlaAcceptInput] = useState('');
  const [slaCollectInput, setSlaCollectInput] = useState('');
  const [slaDeliverInput, setSlaDeliverInput] = useState('');
  const [concurrentInput, setConcurrentInput] = useState('');
  const [batchSizeInput, setBatchSizeInput] = useState('');
  const [deliveryRadiusInput, setDeliveryRadiusInput] = useState('');
  const [deferredAccuracyInput, setDeferredAccuracyInput] = useState('');
  /**
   * Regras marcadas para DESLIGAR neste salvamento.
   *
   * Fica separado dos inputs de texto porque "desligar" nao e um valor: campo
   * vazio sempre significou "mantenha como esta", e continuar assim e o que
   * impede desligar uma regra por distracao. O conjunto e a intencao explicita.
   */
  const [aDesligar, setADesligar] = useState<Set<CampoDesligavel>>(new Set());
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);

  const settingsQuery = useQuery({
    queryKey: ['admin', 'platform-settings'],
    queryFn: () => adminPlatformSettingsApi.get(token as string),
    enabled: Boolean(token),
  });

  function alternarDesligar(campo: CampoDesligavel, marcado: boolean) {
    setADesligar((atual) => {
      const proximo = new Set(atual);
      if (marcado) proximo.add(campo);
      else proximo.delete(campo);
      return proximo;
    });
  }

  /** Monta as props do botao de desligar de um campo. */
  function controleDeDesligar(campo: CampoDesligavel, disponivel: boolean) {
    return {
      marcado: aDesligar.has(campo),
      disponivel,
      onToggle: (marcado: boolean) => alternarDesligar(campo, marcado),
    };
  }

  function valorParaValidar(campo: CampoDesligavel, valor: string) {
    return aDesligar.has(campo) ? '' : valor;
  }

  function resetInputs() {
    setADesligar(new Set());
    setTimeoutInput('');
    setPickupTimeoutInput('');
    setAiqfomeDelayInput('');
    setCollectionRadiusInput('');
    setRadiusInput('');
    setMinCollectInput('');
    setMinDeliverInput('');
    setSilenceInput('');
    setSlaAcceptInput('');
    setSlaCollectInput('');
    setSlaDeliverInput('');
    setConcurrentInput('');
    setBatchSizeInput('');
    setDeliveryRadiusInput('');
    setDeferredAccuracyInput('');
  }

  const updateMutation = useMutation({
    mutationFn: (payload: UpdatePlatformSettingsInput) =>
      adminPlatformSettingsApi.update(token as string, payload),
    onSuccess: () => {
      setFormError(null);
      setFormSuccess('Configurações atualizadas com sucesso.');
      resetInputs();
      void queryClient.invalidateQueries({ queryKey: ['admin', 'platform-settings'] });
    },
    onError: (error) => {
      setFormSuccess(null);
      setFormError(error instanceof ApiError ? error.message : 'Não foi possível salvar.');
    },
  });

  const settings = settingsQuery.data;
  const hasChanges =
    [
      timeoutInput,
      pickupTimeoutInput,
      aiqfomeDelayInput,
      collectionRadiusInput,
      radiusInput,
      minCollectInput,
      minDeliverInput,
      silenceInput,
      slaAcceptInput,
      slaCollectInput,
      slaDeliverInput,
      concurrentInput,
      batchSizeInput,
      deliveryRadiusInput,
    ].some((value) => value.trim().length > 0) || aDesligar.size > 0;

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
    setFormSuccess(null);

    const timeout = parseField(
      timeoutInput,
      'O tempo de resposta',
      TIMEOUT_MIN_SECONDS,
      TIMEOUT_MAX_SECONDS,
    );
    const pickupTimeout = parseField(
      valorParaValidar('pickupAssignmentTimeoutMinutes', pickupTimeoutInput),
      'O prazo para coletar',
      SLA_MIN_MINUTES,
      SLA_MAX_MINUTES,
    );
    const aiqfomeDelay = parseField(
      aiqfomeDelayInput,
      'O preparo padrão do aiqfome',
      SLA_MIN_MINUTES,
      SLA_MAX_MINUTES,
    );
    const radius = parseField(
      valorParaValidar('returnProximityRadiusMeters', radiusInput),
      'O raio de retorno',
      RADIUS_MIN_METERS,
      RADIUS_MAX_METERS,
    );
    const collectionRadius = parseField(
      valorParaValidar('collectionProximityRadiusMeters', collectionRadiusInput),
      'O raio para marcar a coleta',
      DELIVERY_RADIUS_MIN,
      DELIVERY_RADIUS_MAX,
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
    const silence = parseField(
      silenceInput,
      'O tempo sem posição',
      SILENCE_MIN_MINUTES,
      SILENCE_MAX_MINUTES,
    );
    const slaAccept = parseField(
      slaAcceptInput,
      'O limite de aceite',
      SLA_MIN_MINUTES,
      SLA_MAX_MINUTES,
    );
    const slaCollect = parseField(
      slaCollectInput,
      'O limite de coleta',
      SLA_MIN_MINUTES,
      SLA_MAX_MINUTES,
    );
    const slaDeliver = parseField(
      slaDeliverInput,
      'O limite de entrega',
      SLA_MIN_MINUTES,
      SLA_MAX_MINUTES,
    );
    const concurrent = parseField(
      valorParaValidar('maxConcurrentDeliveriesPerDriver', concurrentInput),
      'O limite de entregas simultâneas',
      CONCURRENT_MIN,
      CONCURRENT_MAX,
    );
    const batchSize = parseField(
      batchSizeInput,
      'O tamanho máximo do lote',
      CONCURRENT_MIN,
      BATCH_MAX,
    );
    const deferredAccuracy = parseField(
      deferredAccuracyInput,
      'A precisão exigida no destino por GPS',
      DEFERRED_ACCURACY_MIN,
      DEFERRED_ACCURACY_MAX,
    );
    const deliveryRadius = parseField(
      valorParaValidar('deliveryProximityRadiusMeters', deliveryRadiusInput),
      'O raio para concluir a entrega',
      DELIVERY_RADIUS_MIN,
      DELIVERY_RADIUS_MAX,
    );

    const error =
      timeout.error ??
      pickupTimeout.error ??
      aiqfomeDelay.error ??
      collectionRadius.error ??
      radius.error ??
      minCollect.error ??
      minDeliver.error ??
      silence.error ??
      slaAccept.error ??
      slaCollect.error ??
      slaDeliver.error ??
      concurrent.error ??
      batchSize.error ??
      deliveryRadius.error ??
      deferredAccuracy.error;
    if (error) {
      setFormError(error);
      return;
    }

    if (
      timeout.value === undefined &&
      pickupTimeout.value === undefined &&
      aiqfomeDelay.value === undefined &&
      collectionRadius.value === undefined &&
      radius.value === undefined &&
      minCollect.value === undefined &&
      minDeliver.value === undefined &&
      silence.value === undefined &&
      slaAccept.value === undefined &&
      slaCollect.value === undefined &&
      slaDeliver.value === undefined &&
      concurrent.value === undefined &&
      batchSize.value === undefined &&
      deliveryRadius.value === undefined &&
      aDesligar.size === 0
    ) {
      setFormError('Preencha ao menos um dos campos para salvar.');
      return;
    }

    /**
     * O desligamento vem POR ULTIMO no objeto, de proposito.
     *
     * Se alguem marcar "desligar" e ainda deixar um numero digitado no mesmo
     * campo, a intencao explicita vence o texto esquecido — e nao o contrario.
     */
    const desligamentos = Object.fromEntries(
      [...aDesligar].map((campo) => [campo, null]),
    ) as Partial<Record<CampoDesligavel, null>>;

    updateMutation.mutate({
      ...(timeout.value !== undefined && { dispatchOfferTimeoutSeconds: timeout.value }),
      ...(pickupTimeout.value !== undefined && {
        pickupAssignmentTimeoutMinutes: pickupTimeout.value,
      }),
      ...(aiqfomeDelay.value !== undefined && {
        aiqfomeDispatchDelayMinutes: aiqfomeDelay.value,
      }),
      ...(collectionRadius.value !== undefined && {
        collectionProximityRadiusMeters: collectionRadius.value,
      }),
      ...(radius.value !== undefined && { returnProximityRadiusMeters: radius.value }),
      ...(minCollect.value !== undefined && { minMinutesBeforeCollect: minCollect.value }),
      ...(minDeliver.value !== undefined && { minMinutesBeforeDeliver: minDeliver.value }),
      ...(silence.value !== undefined && { locationSilenceAlertMinutes: silence.value }),
      ...(slaAccept.value !== undefined && { slaAlertMinutesToAccept: slaAccept.value }),
      ...(slaCollect.value !== undefined && { slaAlertMinutesToCollect: slaCollect.value }),
      ...(slaDeliver.value !== undefined && { slaAlertMinutesToDeliver: slaDeliver.value }),
      ...(concurrent.value !== undefined && {
        maxConcurrentDeliveriesPerDriver: concurrent.value,
      }),
      ...(batchSize.value !== undefined && { maxDeliveriesPerBatch: batchSize.value }),
      ...(deliveryRadius.value !== undefined && {
        deliveryProximityRadiusMeters: deliveryRadius.value,
      }),
      ...(deferredAccuracy.value !== undefined && {
        deferredDestinationMaxAccuracyMeters: deferredAccuracy.value,
      }),
      ...desligamentos,
    });
  }

  function clearChanges() {
    resetInputs();
    setFormError(null);
    setFormSuccess(null);
    updateMutation.reset();
  }

  if (!token) {
    return (
      <Card className="mx-auto max-w-xl">
        <CardContent className="flex items-start gap-3 py-2">
          <AlertCircle className="mt-0.5 size-5 shrink-0 text-destructive" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">
            Faça login como administrador para ver as configurações de operação.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1440px] space-y-6 pb-10">
      <header className="space-y-3">
        <Link
          href="/configuracoes"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Configurações
        </Link>
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-heading text-2xl font-semibold tracking-tight text-admin-deep">
              Operação do despacho
            </h1>
            <Badge variant="outline">Configuração global</Badge>
          </div>
          <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
            Ajuste os limites usados no despacho, no acompanhamento e na conclusão dos pedidos.
            Campos em branco mantêm o valor atual; para remover uma trava, use “Desligar esta
            regra”.
          </p>
        </div>
      </header>

      {settingsQuery.isPending && (
        <Card>
          <CardContent className="flex min-h-48 items-center justify-center gap-3 text-muted-foreground">
            <LoaderCircle className="size-5 animate-spin" aria-hidden="true" />
            Carregando configurações da operação...
          </CardContent>
        </Card>
      )}

      {settingsQuery.isError && (
        <Card className="border-destructive/30">
          <CardContent className="flex min-h-48 flex-col items-center justify-center gap-4 text-center">
            <AlertCircle className="size-8 text-destructive" aria-hidden="true" />
            <div className="space-y-1">
              <p className="font-semibold text-admin-deep">Não foi possível carregar os valores</p>
              <p className="text-sm text-muted-foreground">
                Verifique a conexão com a API e tente novamente.
              </p>
            </div>
            <Button type="button" variant="outline" onClick={() => void settingsQuery.refetch()}>
              Tentar novamente
            </Button>
          </CardContent>
        </Card>
      )}

      {settings && (
        <form onSubmit={handleSubmit}>
          <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
            <div className="space-y-5">
              <SettingsSection
                icon={Clock3}
                tom="despacho"
                title="Despacho e retorno"
                description="Defina o tempo da oferta e a proximidade necessária para fechar cada etapa."
              >
                <SettingField
                  id="dispatch-timeout"
                  label="Tempo para aceitar a oferta"
                  placeholder={`${TIMEOUT_MIN_SECONDS} a ${TIMEOUT_MAX_SECONDS}`}
                  unit="segundos"
                  value={timeoutInput}
                  onValueChange={setTimeoutInput}
                  currentValue={
                    settings.dispatchOfferTimeoutSeconds === null
                      ? NAO_CONFIGURADO
                      : `${settings.dispatchOfferTimeoutSeconds}s`
                  }
                  estado={settings.dispatchOfferTimeoutSeconds === null ? 'faltando' : 'definido'}
                  description="Depois desse prazo, a oferta pode seguir para o próximo motoboy da fila."
                />
                <SettingField
                  id="pickup-timeout"
                  desligar={controleDeDesligar(
                    'pickupAssignmentTimeoutMinutes',
                    settings.pickupAssignmentTimeoutMinutes !== null,
                  )}
                  label="Tempo para coletar depois do aceite"
                  placeholder={`${SLA_MIN_MINUTES} a ${SLA_MAX_MINUTES}`}
                  unit="minutos"
                  value={pickupTimeoutInput}
                  onValueChange={setPickupTimeoutInput}
                  currentValue={
                    settings.pickupAssignmentTimeoutMinutes === null
                      ? DESLIGADO
                      : `${settings.pickupAssignmentTimeoutMinutes} min`
                  }
                  estado={
                    settings.pickupAssignmentTimeoutMinutes === null ? 'desligado' : 'definido'
                  }
                  description="Ao zerar antes da coleta, o pedido volta para a fila e toca para outro motoboy."
                />
                <SettingField
                  id="aiqfome-delay"
                  label="Preparo padrão dos pedidos aiqfome"
                  placeholder={`${SLA_MIN_MINUTES} a ${SLA_MAX_MINUTES}`}
                  unit="minutos"
                  value={aiqfomeDelayInput}
                  onValueChange={setAiqfomeDelayInput}
                  currentValue={
                    settings.aiqfomeDispatchDelayMinutes === null
                      ? 'nao configurado'
                      : `${settings.aiqfomeDispatchDelayMinutes} min`
                  }
                  estado={settings.aiqfomeDispatchDelayMinutes === null ? 'faltando' : 'definido'}
                  description="Pedidos importados ficam agendados por este tempo antes de chamar um motoboy. A empresa pode sobrescrever o valor."
                />
                <SettingField
                  id="collection-radius"
                  desligar={controleDeDesligar(
                    'collectionProximityRadiusMeters',
                    settings.collectionProximityRadiusMeters !== null,
                  )}
                  label="Raio para marcar como coletado"
                  placeholder={`${DELIVERY_RADIUS_MIN} a ${DELIVERY_RADIUS_MAX}`}
                  unit="metros"
                  value={collectionRadiusInput}
                  onValueChange={setCollectionRadiusInput}
                  currentValue={
                    settings.collectionProximityRadiusMeters === null
                      ? DESLIGADO
                      : `${settings.collectionProximityRadiusMeters}m`
                  }
                  estado={
                    settings.collectionProximityRadiusMeters === null ? 'desligado' : 'definido'
                  }
                  description="Quando o endereço principal tem coordenadas, exige GPS válido e proximidade para registrar a coleta. Sem coordenadas, a coleta é aceita sem essa validação e o ADM é avisado."
                />
                <SettingField
                  id="return-radius"
                  desligar={controleDeDesligar(
                    'returnProximityRadiusMeters',
                    settings.returnProximityRadiusMeters !== null,
                  )}
                  label="Raio para concluir o retorno"
                  placeholder={`${RADIUS_MIN_METERS} a ${RADIUS_MAX_METERS}`}
                  unit="metros"
                  value={radiusInput}
                  onValueChange={setRadiusInput}
                  currentValue={
                    settings.returnProximityRadiusMeters === null
                      ? DESLIGADO
                      : `${settings.returnProximityRadiusMeters}m`
                  }
                  estado={settings.returnProximityRadiusMeters === null ? 'desligado' : 'definido'}
                  description="Quando o endereço principal tem coordenadas, exige GPS válido e proximidade para concluir o retorno. Sem coordenadas, o retorno é aceito sem essa validação e o ADM é avisado."
                />
                <SettingField
                  id="delivery-radius"
                  desligar={controleDeDesligar(
                    'deliveryProximityRadiusMeters',
                    settings.deliveryProximityRadiusMeters !== null,
                  )}
                  label="Raio para concluir a entrega"
                  placeholder={`${DELIVERY_RADIUS_MIN} a ${DELIVERY_RADIUS_MAX}`}
                  unit="metros"
                  value={deliveryRadiusInput}
                  onValueChange={setDeliveryRadiusInput}
                  currentValue={
                    settings.deliveryProximityRadiusMeters === null
                      ? DESLIGADO
                      : `${settings.deliveryProximityRadiusMeters}m`
                  }
                  estado={
                    settings.deliveryProximityRadiusMeters === null ? 'desligado' : 'definido'
                  }
                  description="Em pedidos com destino conhecido e coordenadas cadastradas, exige GPS válido e proximidade. Sem coordenadas, a conclusão é aceita sem essa validação e o ADM é avisado."
                />
                <SettingField
                  id="deferred-accuracy"
                  label="Precisão exigida quando a posição vira o destino"
                  placeholder={`${DEFERRED_ACCURACY_MIN} a ${DEFERRED_ACCURACY_MAX}`}
                  unit="metros"
                  value={deferredAccuracyInput}
                  onValueChange={setDeferredAccuracyInput}
                  currentValue={
                    settings.deferredDestinationMaxAccuracyMeters === null
                      ? `${DEFERRED_ACCURACY_PADRAO}m (padrão)`
                      : `${settings.deferredDestinationMaxAccuracyMeters}m`
                  }
                  estado="definido"
                  description="Vale só no pedido criado sem destino: ali a posição do motoboy vira o endereço E o valor da corrida, então o limite é mais rígido que os raios acima. Não pode ser desligado — sem ele, o preço poderia sair de uma posição a quilômetros do cliente."
                />
              </SettingsSection>

              <SettingsSection
                icon={Crosshair}
                tom="horarios"
                title="Validação de horários"
                description="Evite que etapas retroativas sejam registradas em intervalos incompatíveis com a entrega."
              >
                <SettingField
                  id="min-collect"
                  label="Tempo mínimo até a coleta"
                  placeholder={`${MIN_MINUTES_MIN} a ${MIN_MINUTES_MAX}`}
                  unit="minutos"
                  value={minCollectInput}
                  onValueChange={setMinCollectInput}
                  currentValue={`${settings.minMinutesBeforeCollect ?? 0} min`}
                  estado={(settings.minMinutesBeforeCollect ?? 0) === 0 ? 'desligado' : 'definido'}
                  description="Aplicado quando o motoboy informa depois o horário em que realizou a coleta."
                />
                <SettingField
                  id="min-deliver"
                  label="Tempo mínimo até a entrega"
                  placeholder={`${MIN_MINUTES_MIN} a ${MIN_MINUTES_MAX}`}
                  unit="minutos"
                  value={minDeliverInput}
                  onValueChange={setMinDeliverInput}
                  currentValue={`${settings.minMinutesBeforeDeliver ?? 0} min`}
                  estado={(settings.minMinutesBeforeDeliver ?? 0) === 0 ? 'desligado' : 'definido'}
                  description="Impede registrar coleta e entrega retroativas no mesmo minuto."
                />
              </SettingsSection>

              <SettingsSection
                icon={BellRing}
                tom="alertas"
                title="Alertas operacionais"
                description="Escolha quando a equipe deve ser avisada sobre atrasos ou ausência de localização."
              >
                <SettingField
                  id="silence-minutes"
                  label="Motoboy sem posição"
                  placeholder={`${SILENCE_MIN_MINUTES} a ${SILENCE_MAX_MINUTES}`}
                  unit="minutos"
                  value={silenceInput}
                  onValueChange={setSilenceInput}
                  currentValue={
                    settings.locationSilenceAlertMinutes === null
                      ? 'desligado'
                      : `${settings.locationSilenceAlertMinutes} min`
                  }
                  estado={settings.locationSilenceAlertMinutes === null ? 'desligado' : 'definido'}
                  description="Avisa quando um motoboy com pedido em andamento para de enviar sua localização."
                />
                <SettingField
                  id="sla-accept"
                  label="Pedido sem aceite"
                  placeholder={`${SLA_MIN_MINUTES} a ${SLA_MAX_MINUTES}`}
                  unit="minutos"
                  value={slaAcceptInput}
                  onValueChange={setSlaAcceptInput}
                  currentValue={
                    settings.slaAlertMinutesToAccept === null
                      ? 'desligado'
                      : `${settings.slaAlertMinutesToAccept} min`
                  }
                  estado={settings.slaAlertMinutesToAccept === null ? 'desligado' : 'definido'}
                  description="Destaca na fila pedidos que aguardam um motoboy além desse tempo."
                />
                <SettingField
                  id="sla-collect"
                  label="Pedido sem coleta"
                  placeholder={`${SLA_MIN_MINUTES} a ${SLA_MAX_MINUTES}`}
                  unit="minutos"
                  value={slaCollectInput}
                  onValueChange={setSlaCollectInput}
                  currentValue={
                    settings.slaAlertMinutesToCollect === null
                      ? 'desligado'
                      : `${settings.slaAlertMinutesToCollect} min`
                  }
                  estado={settings.slaAlertMinutesToCollect === null ? 'desligado' : 'definido'}
                  description="Contado desde o aceite. Use um limite acima do tempo médio de coleta."
                />
                <SettingField
                  id="sla-deliver"
                  label="Pedido sem entrega"
                  placeholder={`${SLA_MIN_MINUTES} a ${SLA_MAX_MINUTES}`}
                  unit="minutos"
                  value={slaDeliverInput}
                  onValueChange={setSlaDeliverInput}
                  currentValue={
                    settings.slaAlertMinutesToDeliver === null
                      ? 'desligado'
                      : `${settings.slaAlertMinutesToDeliver} min`
                  }
                  estado={settings.slaAlertMinutesToDeliver === null ? 'desligado' : 'definido'}
                  description="Contado desde a coleta. Use um limite acima do tempo médio de entrega."
                />
              </SettingsSection>

              <SettingsSection
                icon={Truck}
                tom="capacidade"
                title="Capacidade da operação"
                description="Controle quantos pedidos podem ser agrupados por motoboy e por lançamento."
              >
                <SettingField
                  id="max-concurrent"
                  desligar={controleDeDesligar(
                    'maxConcurrentDeliveriesPerDriver',
                    settings.maxConcurrentDeliveriesPerDriver !== null,
                  )}
                  label="Entregas simultâneas por motoboy"
                  placeholder={`${CONCURRENT_MIN} a ${CONCURRENT_MAX}`}
                  unit="pedidos"
                  value={concurrentInput}
                  onValueChange={setConcurrentInput}
                  currentValue={
                    settings.maxConcurrentDeliveriesPerDriver === null
                      ? 'sem limite'
                      : String(settings.maxConcurrentDeliveriesPerDriver)
                  }
                  estado={
                    settings.maxConcurrentDeliveriesPerDriver === null ? 'desligado' : 'definido'
                  }
                  description="Limita quantas entregas um motoboy pode manter em andamento ao mesmo tempo."
                />
                <SettingField
                  id="max-batch"
                  label="Pedidos por lote"
                  placeholder={`${CONCURRENT_MIN} a ${BATCH_MAX}`}
                  unit="pedidos"
                  value={batchSizeInput}
                  onValueChange={setBatchSizeInput}
                  currentValue={
                    settings.maxDeliveriesPerBatch === null
                      ? 'sem limite'
                      : String(settings.maxDeliveriesPerBatch)
                  }
                  estado={settings.maxDeliveriesPerBatch === null ? 'desligado' : 'definido'}
                  description={
                    <>
                      Limita o lançamento da loja. <strong>O valor 1 desliga o lote.</strong>
                    </>
                  }
                />
              </SettingsSection>
            </div>

            <aside className="space-y-4 xl:sticky xl:top-20">
              <Card>
                <CardHeader className="border-b border-border/70 pb-4">
                  <div className="flex items-center gap-3">
                    <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <SlidersHorizontal className="size-4" aria-hidden="true" />
                    </span>
                    <div>
                      <CardTitle className="text-sm">Configuração atual</CardTitle>
                      <CardDescription className="text-xs">
                        Valores ativos e alterações pendentes
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <dl>
                    <CurrentValueRow
                      label="Resposta da oferta"
                      value={
                        settings.dispatchOfferTimeoutSeconds === null
                          ? 'Não configurado'
                          : `${settings.dispatchOfferTimeoutSeconds} segundos`
                      }
                      estado={
                        settings.dispatchOfferTimeoutSeconds === null ? 'faltando' : 'definido'
                      }
                      pendente={timeoutInput.trim() ? `${timeoutInput.trim()} segundos` : undefined}
                    />
                    <CurrentValueRow
                      label="Prazo para coletar"
                      value={
                        settings.pickupAssignmentTimeoutMinutes === null
                          ? 'Desligado'
                          : `${settings.pickupAssignmentTimeoutMinutes} min`
                      }
                      estado={
                        settings.pickupAssignmentTimeoutMinutes === null ? 'desligado' : 'definido'
                      }
                      pendente={
                        aDesligar.has('pickupAssignmentTimeoutMinutes')
                          ? 'Desligado'
                          : pickupTimeoutInput.trim()
                            ? `${pickupTimeoutInput.trim()} min`
                            : undefined
                      }
                    />
                    <CurrentValueRow
                      label="Preparo aiqfome"
                      value={
                        settings.aiqfomeDispatchDelayMinutes === null
                          ? 'Não configurado'
                          : `${settings.aiqfomeDispatchDelayMinutes} min`
                      }
                      estado={
                        settings.aiqfomeDispatchDelayMinutes === null ? 'faltando' : 'definido'
                      }
                      pendente={
                        aiqfomeDelayInput.trim() ? `${aiqfomeDelayInput.trim()} min` : undefined
                      }
                    />
                    <CurrentValueRow
                      label="Raio de coleta"
                      value={
                        settings.collectionProximityRadiusMeters === null
                          ? 'Desligado'
                          : `${settings.collectionProximityRadiusMeters} metros`
                      }
                      estado={
                        settings.collectionProximityRadiusMeters === null ? 'desligado' : 'definido'
                      }
                      pendente={
                        aDesligar.has('collectionProximityRadiusMeters')
                          ? 'Desligado'
                          : collectionRadiusInput.trim()
                            ? `${collectionRadiusInput.trim()} metros`
                            : undefined
                      }
                    />
                    <CurrentValueRow
                      label="Raio de retorno"
                      value={
                        settings.returnProximityRadiusMeters === null
                          ? 'Desligado'
                          : `${settings.returnProximityRadiusMeters} metros`
                      }
                      estado={
                        settings.returnProximityRadiusMeters === null ? 'desligado' : 'definido'
                      }
                      pendente={
                        aDesligar.has('returnProximityRadiusMeters')
                          ? 'Desligado'
                          : radiusInput.trim()
                            ? `${radiusInput.trim()} metros`
                            : undefined
                      }
                    />
                    <CurrentValueRow
                      label="Raio de entrega"
                      value={
                        settings.deliveryProximityRadiusMeters === null
                          ? 'Desligado'
                          : `${settings.deliveryProximityRadiusMeters} metros`
                      }
                      estado={
                        settings.deliveryProximityRadiusMeters === null ? 'desligado' : 'definido'
                      }
                      pendente={
                        aDesligar.has('deliveryProximityRadiusMeters')
                          ? 'Desligado'
                          : deliveryRadiusInput.trim()
                            ? `${deliveryRadiusInput.trim()} metros`
                            : undefined
                      }
                    />
                    <CurrentValueRow
                      label="Mínimo coleta / entrega"
                      value={`${settings.minMinutesBeforeCollect ?? 0} / ${
                        settings.minMinutesBeforeDeliver ?? 0
                      } min`}
                      estado={
                        (settings.minMinutesBeforeCollect ?? 0) === 0 &&
                        (settings.minMinutesBeforeDeliver ?? 0) === 0
                          ? 'desligado'
                          : 'definido'
                      }
                    />
                    <CurrentValueRow
                      label="Sem posição"
                      value={
                        settings.locationSilenceAlertMinutes === null
                          ? 'Desligado'
                          : `${settings.locationSilenceAlertMinutes} min`
                      }
                      estado={
                        settings.locationSilenceAlertMinutes === null ? 'desligado' : 'definido'
                      }
                      pendente={silenceInput.trim() ? `${silenceInput.trim()} min` : undefined}
                    />
                    <CurrentValueRow
                      label="Alertas: aceite / coleta / entrega"
                      value={
                        settings.slaAlertMinutesToAccept === null &&
                        settings.slaAlertMinutesToCollect === null &&
                        settings.slaAlertMinutesToDeliver === null
                          ? 'Sem sinalização'
                          : [
                              settings.slaAlertMinutesToAccept ?? '—',
                              settings.slaAlertMinutesToCollect ?? '—',
                              settings.slaAlertMinutesToDeliver ?? '—',
                            ].join(' / ') + ' min'
                      }
                      estado={
                        settings.slaAlertMinutesToAccept === null &&
                        settings.slaAlertMinutesToCollect === null &&
                        settings.slaAlertMinutesToDeliver === null
                          ? 'desligado'
                          : 'definido'
                      }
                    />
                    <CurrentValueRow
                      label="Entregas simultâneas"
                      value={
                        settings.maxConcurrentDeliveriesPerDriver === null
                          ? 'Sem limite'
                          : `${settings.maxConcurrentDeliveriesPerDriver} pedidos`
                      }
                      estado={
                        settings.maxConcurrentDeliveriesPerDriver === null
                          ? 'desligado'
                          : 'definido'
                      }
                      pendente={
                        aDesligar.has('maxConcurrentDeliveriesPerDriver')
                          ? 'Sem limite'
                          : concurrentInput.trim()
                            ? `${concurrentInput.trim()} pedidos`
                            : undefined
                      }
                    />
                    <CurrentValueRow
                      label="Pedidos por lote"
                      value={
                        settings.maxDeliveriesPerBatch === null
                          ? 'Sem limite'
                          : `${settings.maxDeliveriesPerBatch} pedidos`
                      }
                      estado={settings.maxDeliveriesPerBatch === null ? 'desligado' : 'definido'}
                      pendente={
                        batchSizeInput.trim() ? `${batchSizeInput.trim()} pedidos` : undefined
                      }
                    />
                  </dl>

                  {settings.updatedBy && (
                    <p className="mt-4 border-t border-border/70 pt-4 text-xs leading-5 text-muted-foreground">
                      Última alteração por{' '}
                      <span className="font-semibold text-admin-deep">
                        {settings.updatedBy.name}
                      </span>
                    </p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Salvar alterações</CardTitle>
                  <CardDescription className="text-xs leading-5">
                    Somente campos preenchidos e regras marcadas para desligar serão atualizados.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {formError && (
                    <div
                      role="alert"
                      className="flex gap-2 rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-xs leading-5 text-destructive"
                    >
                      <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                      {formError}
                    </div>
                  )}
                  {formSuccess && (
                    <div
                      role="status"
                      className="flex gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 text-xs leading-5 text-emerald-700"
                    >
                      <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                      {formSuccess}
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={clearChanges}
                      disabled={!hasChanges || updateMutation.isPending}
                    >
                      <RotateCcw data-icon="inline-start" aria-hidden="true" />
                      Limpar
                    </Button>
                    <Button type="submit" disabled={!hasChanges || updateMutation.isPending}>
                      {updateMutation.isPending ? (
                        <LoaderCircle
                          className="animate-spin"
                          data-icon="inline-start"
                          aria-hidden="true"
                        />
                      ) : (
                        <Save data-icon="inline-start" aria-hidden="true" />
                      )}
                      {updateMutation.isPending ? 'Salvando...' : 'Salvar'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </aside>
          </div>
        </form>
      )}
    </div>
  );
}
