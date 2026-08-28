'use client';

import { useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Link2,
  LoaderCircle,
  ShieldCheck,
  Store,
  Unplug,
} from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@motoboycity/api-client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { companyIntegrationsApi, serviceTypesApi } from '@/lib/api-client';
import { session } from '@/lib/session';
import { AiqfomeConnectionGuide } from './aiqfome-connection-guide';

export const aiqfomeIntegrationQueryKey = ['company', 'integrations', 'aiqfome'] as const;

interface AiqfomeIntegrationPanelProps {
  callbackStatus?: string;
  callbackReason?: string;
}

export function AiqfomeIntegrationPanel({
  callbackStatus,
  callbackReason,
}: AiqfomeIntegrationPanelProps = {}) {
  const token = session.getToken();
  const queryClient = useQueryClient();
  const [callbackFeedback, setCallbackFeedback] = useState<string | null>(() => {
    if (callbackStatus === 'error') return callbackErrorMessage(callbackReason ?? null);
    return null;
  });
  const [settingsDraft, setSettingsDraft] = useState<{
    serviceTypeId: string;
    delayInput: string;
  } | null>(null);
  const [settingsError, setSettingsError] = useState<string | null>(null);

  const integrationQuery = useQuery({
    queryKey: aiqfomeIntegrationQueryKey,
    queryFn: () => {
      if (!token) throw new Error('Sessão ausente.');
      return companyIntegrationsApi.getAiqfome(token);
    },
    enabled: Boolean(token),
    retry: false,
  });

  const serviceTypesQuery = useQuery({
    queryKey: ['service-types', { active: true }],
    queryFn: () => serviceTypesApi.list(token as string, { active: true }),
    enabled: Boolean(token && integrationQuery.data?.status === 'CONNECTED'),
  });

  const connectMutation = useMutation({
    mutationFn: () => {
      if (!token) throw new Error('Sessão ausente.');
      return companyIntegrationsApi.connectAiqfome(token);
    },
    onSuccess: ({ authorizationUrl }) => window.location.assign(authorizationUrl),
  });

  const disconnectMutation = useMutation({
    mutationFn: () => {
      if (!token) throw new Error('Sessão ausente.');
      return companyIntegrationsApi.disconnectAiqfome(token);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: aiqfomeIntegrationQueryKey });
      setCallbackFeedback('Loja aiqfome desconectada com segurança.');
    },
  });

  const settingsMutation = useMutation({
    mutationFn: () => {
      if (!token) throw new Error('Sessao ausente.');
      const serviceTypeId =
        settingsDraft?.serviceTypeId ?? integrationQuery.data?.serviceTypeId ?? '';
      const delayInput =
        settingsDraft?.delayInput ?? integrationQuery.data?.dispatchDelayMinutes?.toString() ?? '';
      const delay = delayInput.trim() ? Number(delayInput.trim()) : null;
      if (!serviceTypeId) throw new Error('Selecione a modalidade usada nos pedidos importados.');
      if (delay !== null && (!Number.isInteger(delay) || delay < 1 || delay > 480)) {
        throw new Error('O tempo de preparo deve estar entre 1 e 480 minutos.');
      }
      return companyIntegrationsApi.updateAiqfomeSettings(token, {
        serviceTypeId,
        dispatchDelayMinutes: delay,
      });
    },
    onSuccess: async (updated) => {
      setSettingsError(null);
      setCallbackFeedback(
        updated.operationalReady
          ? 'Importação automática do aiqfome ativada com sucesso.'
          : 'Configuração salva. Defina um tempo de preparo aqui ou peça ao ADM para definir o padrão.',
      );
      setSettingsDraft(null);
      await queryClient.invalidateQueries({ queryKey: aiqfomeIntegrationQueryKey });
    },
    onError: (error) => {
      setSettingsError(
        apiErrorMessage(error, error instanceof Error ? error.message : 'Nao foi possivel salvar.'),
      );
    },
  });

  if (!token) {
    return <p className="text-sm text-muted-foreground">Faça login para abrir as integrações.</p>;
  }

  if (integrationQuery.isPending) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
          Carregando integração...
        </CardContent>
      </Card>
    );
  }

  if (integrationQuery.isError) {
    return (
      <Card>
        <CardContent className="space-y-3 py-8">
          <p className="text-sm text-destructive" role="alert">
            {apiErrorMessage(integrationQuery.error, 'Não foi possível carregar a integração.')}
          </p>
          <Button variant="outline" onClick={() => integrationQuery.refetch()}>
            Tentar novamente
          </Button>
        </CardContent>
      </Card>
    );
  }

  const integration = integrationQuery.data;
  const isConnected = integration.status === 'CONNECTED';
  const serviceTypeId = settingsDraft?.serviceTypeId ?? integration.serviceTypeId ?? '';
  const delayInput =
    settingsDraft?.delayInput ?? integration.dispatchDelayMinutes?.toString() ?? '';
  const settingsDirty = settingsDraft !== null;
  const mutationError = connectMutation.error ?? disconnectMutation.error;
  const visibleCallbackFeedback =
    callbackFeedback ??
    (callbackStatus === 'connected' && isConnected
      ? 'Loja aiqfome conectada com segurança.'
      : null);
  const successFeedback =
    visibleCallbackFeedback?.includes('conectada') ||
    visibleCallbackFeedback?.includes('desconectada') ||
    visibleCallbackFeedback?.includes('salva') ||
    visibleCallbackFeedback?.includes('sucesso');

  return (
    <div className="space-y-4">
      {visibleCallbackFeedback && (
        <div
          className={`flex items-start gap-2 rounded-xl border p-3 text-sm ${
            successFeedback
              ? 'border-status-entregue/30 bg-status-entregue/8 text-status-entregue'
              : 'border-destructive/30 bg-destructive/5 text-destructive'
          }`}
          role="status"
        >
          {successFeedback ? (
            <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          ) : (
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          )}
          {visibleCallbackFeedback}
        </div>
      )}

      <AiqfomeConnectionGuide
        isConnected={isConnected}
        operationalReady={integration.operationalReady}
      />

      <Card className="overflow-hidden border-portal/15">
        <div className="h-1 bg-gradient-to-r from-portal via-status-entregue to-colete" />
        <CardHeader className="gap-3">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <span className="rounded-xl bg-portal-soft p-2 text-portal">
                <Store className="size-5" aria-hidden="true" />
              </span>
              <Badge variant={isConnected ? 'default' : 'secondary'}>
                {statusLabel(integration.status)}
              </Badge>
            </div>
            <CardTitle>aiqfome</CardTitle>
            <CardDescription className="mt-1 max-w-2xl">
              Importe pedidos automaticamente, reserve o tempo de preparo e chame os motoboys pela
              mesma fila usada nos pedidos manuais.
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <PolicyItem title="Entrada" value="Novo pedido fica agendado" />
            <PolicyItem title="Pagamento" value="Online sem retorno; na entrega com retorno" />
          </div>

          {isConnected && !integration.operationalReady && (
            <div className="flex gap-2 rounded-xl border border-colete/30 bg-colete/8 p-3 text-sm text-portal-deep">
              <AlertCircle className="mt-0.5 size-4 shrink-0 text-colete-deep" aria-hidden="true" />
              Escolha a modalidade e confirme o tempo de preparo para ativar a importação.
            </div>
          )}

          {isConnected && integration.webhookStatus === 'ERROR' && (
            <div
              className="flex gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
              role="alert"
            >
              <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />O vínculo está
              salvo, mas o recebimento automático não pôde ser ativado. Salve a configuração
              novamente; se persistir, contate o suporte.
            </div>
          )}

          {integration.store && (
            <div className="rounded-xl border border-border/70 bg-muted/30 p-4">
              <p className="text-xs font-medium text-muted-foreground">Loja vinculada</p>
              <p className="mt-1 font-semibold text-portal-deep">{integration.store.name}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                ID {integration.store.id} · {integration.store.status}
              </p>
              {integration.store.address && (
                <p className="mt-2 text-sm text-muted-foreground">
                  {integration.store.address.street}, {integration.store.address.number} ·{' '}
                  {integration.store.address.city}/{integration.store.address.state}
                </p>
              )}
            </div>
          )}

          {isConnected && (
            <div className="space-y-4 rounded-xl border border-border/70 bg-muted/20 p-4">
              <div>
                <p className="font-semibold text-portal-deep">Regras dos pedidos importados</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  O prazo da empresa substitui o padrão do ADM. Deixe vazio para usar o padrão
                  global.
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Modalidade de entrega</Label>
                  <Select
                    items={Object.fromEntries(
                      (serviceTypesQuery.data ?? []).map((item) => [item.id, item.name]),
                    )}
                    value={serviceTypeId || null}
                    onValueChange={(value) => {
                      setSettingsDraft({ serviceTypeId: value ?? '', delayInput });
                    }}
                    disabled={!integration.canManage || serviceTypesQuery.isPending}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Selecione a modalidade" />
                    </SelectTrigger>
                    <SelectContent>
                      {(serviceTypesQuery.data ?? []).map((item) => (
                        <SelectItem key={item.id} value={item.id}>
                          {item.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="aiqfome-delay">Tempo de preparo da empresa</Label>
                  <Input
                    id="aiqfome-delay"
                    inputMode="numeric"
                    placeholder="Usar padrão do ADM"
                    value={delayInput}
                    disabled={!integration.canManage}
                    onChange={(event) => {
                      setSettingsDraft({ serviceTypeId, delayInput: event.target.value });
                    }}
                  />
                  <p className="text-xs text-muted-foreground">
                    Efetivo:{' '}
                    {integration.effectiveDispatchDelayMinutes === null
                      ? 'ainda não configurado'
                      : `${integration.effectiveDispatchDelayMinutes} min (${
                          integration.delaySource === 'COMPANY' ? 'empresa' : 'ADM'
                        })`}
                  </p>
                </div>
              </div>
              {settingsError && (
                <p className="text-sm text-destructive" role="alert">
                  {settingsError}
                </p>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  disabled={!integration.canManage || !settingsDirty || settingsMutation.isPending}
                  onClick={() => settingsMutation.mutate()}
                >
                  {settingsMutation.isPending && (
                    <LoaderCircle className="animate-spin" aria-hidden="true" />
                  )}
                  {settingsMutation.isPending ? 'Ativando...' : 'Salvar e ativar importação'}
                </Button>
                <Badge variant={integration.operationalReady ? 'default' : 'secondary'}>
                  {integration.operationalReady ? 'Importação ativa' : 'Importação inativa'}
                </Badge>
              </div>
            </div>
          )}

          {!integration.configured && (
            <div className="flex gap-2 rounded-xl border border-colete/30 bg-colete/8 p-3 text-sm text-portal-deep">
              <AlertCircle className="mt-0.5 size-4 shrink-0 text-colete-deep" aria-hidden="true" />
              A configuração segura do servidor ainda precisa ser concluída antes de conectar.
            </div>
          )}

          {!integration.canManage && (
            <p className="text-sm text-muted-foreground">
              Somente o responsável principal da empresa pode conectar ou desconectar uma loja.
            </p>
          )}

          {mutationError && (
            <p className="text-sm text-destructive" role="alert">
              {apiErrorMessage(mutationError, 'Não foi possível atualizar a integração.')}
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            {isConnected ? (
              <Button
                variant="outline"
                disabled={!integration.canManage || disconnectMutation.isPending}
                onClick={() => {
                  if (
                    window.confirm(
                      'Desconectar esta loja de teste? O vínculo seguro com o aiqfome será removido.',
                    )
                  ) {
                    disconnectMutation.mutate();
                  }
                }}
              >
                {disconnectMutation.isPending ? (
                  <LoaderCircle className="animate-spin" aria-hidden="true" />
                ) : (
                  <Unplug aria-hidden="true" />
                )}
                Desconectar loja
              </Button>
            ) : (
              <Button
                disabled={
                  !integration.canManage || !integration.configured || connectMutation.isPending
                }
                onClick={() => connectMutation.mutate()}
              >
                {connectMutation.isPending ? (
                  <LoaderCircle className="animate-spin" aria-hidden="true" />
                ) : (
                  <Link2 aria-hidden="true" />
                )}
                Conectar com aiqfome
              </Button>
            )}
          </div>

          <div className="flex items-start gap-2 border-t border-border/60 pt-4 text-xs leading-relaxed text-muted-foreground">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-portal" aria-hidden="true" />A senha
            e os tokens da loja ficam criptografados no servidor e nunca aparecem neste painel.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function PolicyItem({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/70 bg-card p-3">
      <p className="text-xs text-muted-foreground">{title}</p>
      <p className="mt-1 text-sm font-semibold text-portal-deep">{value}</p>
    </div>
  );
}

function statusLabel(status: 'DISCONNECTED' | 'CONNECTED' | 'ERROR'): string {
  if (status === 'CONNECTED') return 'Conectado';
  if (status === 'ERROR') return 'Ação necessária';
  return 'Desconectado';
}

function callbackErrorMessage(reason: string | null): string {
  if (reason === 'AUTHORIZATION_DENIED') return 'A autorização foi cancelada no ID Magalu.';
  if (reason === 'STORE_DOCUMENT_MISMATCH') {
    return 'O CNPJ da loja autorizada não corresponde ao CNPJ desta empresa.';
  }
  if (reason === 'INSUFFICIENT_SCOPE') {
    return 'A aplicação não recebeu todas as permissões de loja e pedidos.';
  }
  if (reason === 'DISCONNECT_BEFORE_CHANGING_STORE') {
    return 'Desconecte a loja atual antes de autorizar outra loja.';
  }
  if (reason === 'STORE_COUNT_INVALID') {
    return 'Autorize somente uma loja por vez no aiqfome e tente novamente.';
  }
  if (reason === 'INVALID_OR_EXPIRED_STATE') {
    return 'O vínculo expirou ou já foi utilizado. Inicie a conexão novamente.';
  }
  return 'Não foi possível concluir o vínculo com o aiqfome. Tente novamente.';
}

function apiErrorMessage(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback;
}
