'use client';

import { useState, type ReactNode, type SubmitEvent } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@motoboycity/api-client';
import type { DriverPunishmentTrigger, UpdatePlatformSettingsInput } from '@motoboycity/types';
import { AlertCircle, ArrowLeft, Gavel, LoaderCircle, RotateCcw, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ActionFeedback } from '@/components/ui/action-feedback';
import { CabecalhoDeConfiguracao } from '@/components/settings/estado-da-configuracao';
import { adminPlatformSettingsApi } from '@/lib/api-client';
import { session } from '@/lib/session';

// Espelham `updatePlatformSettingsSchema`; validar aqui evita uma ida ao
// servidor só para receber o mesmo erro de volta.
const COUNT_MIN = 1;
const COUNT_MAX = 20;
const MINUTES_MIN = 1;
const MINUTES_MAX = 1440;

const GATILHOS: Record<DriverPunishmentTrigger, string> = {
  DECLINED: 'Pedido rejeitado',
  EXPIRED: 'Pedido não aceito (prazo expirou)',
  DECLINED_OR_EXPIRED: 'Pedido rejeitado ou não aceito',
};

/**
 * Recusar e deixar expirar tem o mesmo efeito no pedido, mas não a mesma
 * intenção: quem recusa está com a tela na mão; quem deixa expirar pode estar
 * sem sinal, dirigindo ou com o celular no bolso. Por isso a escolha é da
 * operação, e o padrão é o mais conservador dos três.
 */
const AJUDA_DO_GATILHO: Record<DriverPunishmentTrigger, string> = {
  DECLINED: 'Só a recusa explícita conta. Deixar o prazo acabar não pune ninguém.',
  EXPIRED: 'Só o silêncio conta. Recusar na hora, liberando o pedido mais rápido, não pune.',
  DECLINED_OR_EXPIRED: 'Qualquer oferta que não vire entrega conta para a sequência.',
};

function CampoNumerico({
  id,
  label,
  descricao,
  value,
  onValueChange,
  placeholder,
  unit,
  disabled,
  invalid,
}: {
  id: string;
  label: string;
  descricao: ReactNode;
  value: string;
  onValueChange: (value: string) => void;
  placeholder: string;
  unit: string;
  disabled: boolean;
  invalid: boolean;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id} className="text-admin-deep">
        {label}
      </Label>
      <div className="relative">
        <Input
          id={id}
          inputMode="numeric"
          autoComplete="off"
          aria-describedby={`${id}-descricao`}
          aria-invalid={invalid}
          placeholder={placeholder}
          value={value}
          disabled={disabled}
          onChange={(event) => onValueChange(event.target.value)}
          className="pr-20"
        />
        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">
          {unit}
        </span>
      </div>
      <p id={`${id}-descricao`} className="text-xs leading-5 text-muted-foreground">
        {descricao}
      </p>
    </div>
  );
}

function Opcao({
  id,
  checked,
  onCheckedChange,
  label,
  descricao,
  disabled,
}: {
  id: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: string;
  descricao: string;
  disabled: boolean;
}) {
  return (
    <div className="flex gap-3 rounded-xl border border-border/70 bg-muted/20 p-4">
      <Checkbox
        id={id}
        checked={checked}
        disabled={disabled}
        onCheckedChange={(value) => onCheckedChange(value === true)}
        className="mt-0.5"
      />
      <div className="min-w-0 space-y-1">
        <Label htmlFor={id} className="text-admin-deep">
          {label}
        </Label>
        <p className="text-xs leading-5 text-muted-foreground">{descricao}</p>
      </div>
    </div>
  );
}

export default function DriverPunishmentSettingsPage() {
  const token = session.getToken();
  const queryClient = useQueryClient();

  const settingsQuery = useQuery({
    queryKey: ['admin', 'platform-settings'],
    queryFn: () => adminPlatformSettingsApi.get(token as string),
    enabled: Boolean(token),
  });
  const settings = settingsQuery.data;

  /**
   * O formulário nasce vazio e é semeado uma única vez, quando os dados chegam.
   * Ressincronizar a cada recarga apagaria o que a pessoa está editando.
   */
  const [semeado, setSemeado] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [trigger, setTrigger] = useState<DriverPunishmentTrigger>('DECLINED');
  const [countInput, setCountInput] = useState('');
  const [minutesInput, setMinutesInput] = useState('');
  const [ignoreWithActive, setIgnoreWithActive] = useState(false);
  const [oncePerDelivery, setOncePerDelivery] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);

  function semear(): void {
    if (!settings) return;
    setEnabled(settings.driverPunishmentEnabled);
    setTrigger(settings.driverPunishmentTrigger);
    setCountInput(
      settings.driverPunishmentOfferCount === null
        ? ''
        : String(settings.driverPunishmentOfferCount),
    );
    setMinutesInput(
      settings.driverPunishmentMinutes === null ? '' : String(settings.driverPunishmentMinutes),
    );
    setIgnoreWithActive(settings.driverPunishmentIgnoreWithActiveDelivery);
    setOncePerDelivery(settings.driverPunishmentOncePerDelivery);
  }

  if (settings && !semeado) {
    semear();
    setSemeado(true);
  }

  const updateMutation = useMutation({
    mutationFn: (payload: UpdatePlatformSettingsInput) =>
      adminPlatformSettingsApi.update(token as string, payload),
    onSuccess: (updated) => {
      queryClient.setQueryData(['admin', 'platform-settings'], updated);
      setFormError(null);
      setFormSuccess(
        updated.driverPunishmentEnabled
          ? `Punição ativa: ${updated.driverPunishmentOfferCount} recusa(s) tiram o motoboy do despacho por ${updated.driverPunishmentMinutes} min.`
          : 'Punição desligada. Nenhuma recusa tira motoboy do despacho.',
      );
    },
    onError: (error: unknown) => {
      setFormSuccess(null);
      setFormError(
        error instanceof ApiError
          ? error.message
          : 'Não foi possível salvar. Verifique a conexão e tente novamente.',
      );
    },
  });

  function numero(texto: string): number | null {
    const limpo = texto.trim();
    if (limpo.length === 0) return null;
    const valor = Number(limpo);
    return Number.isInteger(valor) ? valor : Number.NaN;
  }

  const count = numero(countInput);
  const minutes = numero(minutesInput);
  const countInvalido =
    count !== null && (Number.isNaN(count) || count < COUNT_MIN || count > COUNT_MAX);
  const minutesInvalido =
    minutes !== null && (Number.isNaN(minutes) || minutes < MINUTES_MIN || minutes > MINUTES_MAX);

  function handleSubmit(event: SubmitEvent): void {
    event.preventDefault();
    setFormError(null);
    setFormSuccess(null);

    if (countInvalido) {
      setFormError(`A quantidade de recusas deve ser um número de ${COUNT_MIN} a ${COUNT_MAX}.`);
      return;
    }
    if (minutesInvalido) {
      setFormError(`O tempo de punição deve ser um número de ${MINUTES_MIN} a ${MINUTES_MAX}.`);
      return;
    }
    /**
     * Ligar sem os dois números não pune ninguém: a API registra o aviso e
     * segue. Recusar aqui evita a pior versão disso — a tela dizendo "ativa"
     * enquanto nada acontece no despacho.
     */
    if (enabled && (count === null || minutes === null)) {
      setFormError('Com a punição ativa, informe a quantidade de recusas e o tempo em minutos.');
      return;
    }

    updateMutation.mutate({
      driverPunishmentEnabled: enabled,
      driverPunishmentTrigger: trigger,
      ...(count !== null && { driverPunishmentOfferCount: count }),
      ...(minutes !== null && { driverPunishmentMinutes: minutes }),
      driverPunishmentIgnoreWithActiveDelivery: ignoreWithActive,
      driverPunishmentOncePerDelivery: oncePerDelivery,
    });
  }

  function cancelar(): void {
    semear();
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
            Faça login como administrador para ver a punição de entregadores.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 pb-10">
      <div>
        <Link
          href="/configuracoes"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Configurações
        </Link>
      </div>

      <CabecalhoDeConfiguracao
        icon={Gavel}
        tom="capacidade"
        titulo="Punição de entregadores"
        descricao="Tira do despacho, por um tempo, quem recusa ofertas seguidas. O motoboy continua online e continua tocando o que já aceitou — o que para é a chegada de oferta nova."
        situacao={
          !settings
            ? null
            : !settings.driverPunishmentEnabled
              ? { estado: 'desligado', texto: 'Nenhuma punição automática' }
              : settings.driverPunishmentOfferCount === null ||
                  settings.driverPunishmentMinutes === null
                ? { estado: 'faltando', texto: 'Ativa, mas sem quantidade ou tempo' }
                : {
                    estado: 'definido',
                    texto: `${settings.driverPunishmentOfferCount} recusa(s) · ${settings.driverPunishmentMinutes} min fora do despacho`,
                  }
        }
      />

      {settingsQuery.isPending && (
        <Card>
          <CardContent className="flex min-h-40 items-center justify-center gap-3 text-muted-foreground">
            <LoaderCircle className="size-5 animate-spin" aria-hidden="true" />
            Carregando configuração...
          </CardContent>
        </Card>
      )}

      {settingsQuery.isError && (
        <Card className="border-destructive/30">
          <CardContent className="flex min-h-40 flex-col items-center justify-center gap-4 text-center">
            <AlertCircle className="size-8 text-destructive" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">
              Não foi possível carregar a configuração. Verifique a conexão com a API.
            </p>
            <Button type="button" variant="outline" onClick={() => void settingsQuery.refetch()}>
              Tentar novamente
            </Button>
          </CardContent>
        </Card>
      )}

      {settings && (
        <form onSubmit={handleSubmit} className="space-y-5">
          <Card>
            <CardContent className="space-y-5 pt-6">
              <Opcao
                id="punicao-ativa"
                checked={enabled}
                onCheckedChange={setEnabled}
                disabled={updateMutation.isPending}
                label="Ativar punição de entregadores"
                descricao="Desligada, os campos abaixo ficam só como referência e nenhum motoboy sai do despacho por recusar."
              />

              <div className="space-y-2">
                <Label htmlFor="punicao-gatilho" className="text-admin-deep">
                  Aplicar punição quando
                </Label>
                <Select
                  items={GATILHOS}
                  value={trigger}
                  onValueChange={(value) =>
                    setTrigger((value as DriverPunishmentTrigger | null) ?? 'DECLINED')
                  }
                  disabled={!enabled || updateMutation.isPending}
                >
                  <SelectTrigger id="punicao-gatilho" className="h-10 w-full">
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(GATILHOS) as DriverPunishmentTrigger[]).map((chave) => (
                      <SelectItem key={chave} value={chave}>
                        {GATILHOS[chave]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs leading-5 text-muted-foreground">
                  {AJUDA_DO_GATILHO[trigger]}
                </p>
              </div>

              <div className="grid gap-5 sm:grid-cols-2">
                <CampoNumerico
                  id="punicao-quantidade"
                  label="Recusas seguidas para punir"
                  placeholder={`${COUNT_MIN} a ${COUNT_MAX}`}
                  unit="recusas"
                  value={countInput}
                  onValueChange={setCountInput}
                  disabled={!enabled || updateMutation.isPending}
                  invalid={countInvalido}
                  descricao="Contagem em sequência: qualquer pedido aceito zera. Cumprir a punição também zera, para ele não voltar do castigo a uma recusa de distância da próxima."
                />
                <CampoNumerico
                  id="punicao-minutos"
                  label="Minutos sem receber pedidos"
                  placeholder={`${MINUTES_MIN} a ${MINUTES_MAX}`}
                  unit="minutos"
                  value={minutesInput}
                  onValueChange={setMinutesInput}
                  disabled={!enabled || updateMutation.isPending}
                  invalid={minutesInvalido}
                  descricao="Tempo fora do despacho. Ele também não consegue pegar pedido na lista de disponíveis nesse período, ou a regra não teria efeito nenhum."
                />
              </div>

              <div className="grid gap-3">
                <Opcao
                  id="punicao-ignora-em-andamento"
                  checked={ignoreWithActive}
                  onCheckedChange={setIgnoreWithActive}
                  disabled={!enabled || updateMutation.isPending}
                  label="Ignorar recusa de quem está com pedido em andamento"
                  descricao="Quem já está na rua costuma recusar pela razão certa: tem trabalho em mãos, e recusar na hora devolve o pedido à fila mais rápido do que deixar expirar."
                />
                <Opcao
                  id="punicao-uma-vez-por-pedido"
                  checked={oncePerDelivery}
                  onCheckedChange={setOncePerDelivery}
                  disabled={!enabled || updateMutation.isPending}
                  label="Não punir mais de uma vez pelo mesmo pedido"
                  descricao="Um pedido que ninguém quer volta para a fila e chega de novo ao mesmo motoboy. Sem isto, a mesma recusa o pune outra vez."
                />
              </div>
            </CardContent>
          </Card>

          {formError && (
            <ActionFeedback tone="error" compact>
              {formError}
            </ActionFeedback>
          )}
          {formSuccess && (
            <ActionFeedback tone="success" compact>
              {formSuccess}
            </ActionFeedback>
          )}

          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={updateMutation.isPending}>
              {updateMutation.isPending ? (
                <LoaderCircle className="animate-spin" data-icon="inline-start" aria-hidden="true" />
              ) : (
                <Save data-icon="inline-start" aria-hidden="true" />
              )}
              {updateMutation.isPending ? 'Salvando...' : 'Salvar'}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={cancelar}
              disabled={updateMutation.isPending}
            >
              <RotateCcw data-icon="inline-start" aria-hidden="true" />
              Cancelar
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
