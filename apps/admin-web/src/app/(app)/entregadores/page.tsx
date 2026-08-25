'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AdminDriverListItem, RegisterDriverResult } from '@motoboycity/types';
import { ApiError } from '@motoboycity/api-client';
import { ChevronRight, MapPin, UserPlus } from 'lucide-react';
import { CreateDriverDialog } from '@/components/drivers/create-driver-dialog';
import { ConfirmActionDialog } from '@/components/admin/confirm-action-dialog';
import { AdminPageHeader } from '@/components/layout/admin-page-header';
import { ActionFeedback } from '@/components/ui/action-feedback';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { QueryState } from '@/components/ui/query-state';
import { StatCard } from '@/components/stat-card';
import { adminDriversApi, adminServiceTypesApi } from '@/lib/api-client';
import { session } from '@/lib/session';

const approvalStatusLabel: Record<AdminDriverListItem['approvalStatus'], string> = {
  PENDING: 'Pendente',
  APPROVED: 'Aprovado',
  REJECTED: 'Rejeitado',
};

const approvalStatusVariant: Record<
  AdminDriverListItem['approvalStatus'],
  'outline' | 'default' | 'destructive'
> = {
  PENDING: 'outline',
  APPROVED: 'default',
  REJECTED: 'destructive',
};

const accountStatusLabel: Record<AdminDriverListItem['accountStatus'], string> = {
  ACTIVE: 'Ativo',
  SUSPENDED: 'Suspenso',
  BLOCKED: 'Bloqueado',
};

const driverCardClass: Record<AdminDriverListItem['accountStatus'], string> = {
  ACTIVE: 'border-status-entregue/20 bg-gradient-to-br from-card to-dinheiro-recebido-suave/50',
  SUSPENDED: 'border-status-rota/25 bg-gradient-to-br from-card to-dinheiro-nao-cobrado-suave/60',
  BLOCKED: 'border-status-cancelado/20 bg-gradient-to-br from-card to-dinheiro-atrasado-suave/55',
};

type DriverAction = 'approve' | 'reject' | 'suspend' | 'block' | 'reactivate';

export default function DriversPage() {
  const [search, setSearch] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [createdNotice, setCreatedNotice] = useState<string | null>(null);
  const [pendingServiceTypeIds, setPendingServiceTypeIds] = useState<Record<string, string[]>>({});
  const queryClient = useQueryClient();

  const token = session.getToken();

  const driversQuery = useQuery({
    queryKey: ['admin', 'drivers'],
    queryFn: () => adminDriversApi.list(token as string),
    enabled: Boolean(token),
  });

  const serviceTypesQuery = useQuery({
    queryKey: ['admin', 'service-types', 'active'],
    queryFn: () => adminServiceTypesApi.list(token as string, { active: true }),
    enabled: Boolean(token),
  });

  const actionFn: Record<
    DriverAction,
    (accessToken: string, driverId: string) => Promise<unknown>
  > = {
    approve: adminDriversApi.approve,
    reject: adminDriversApi.reject,
    suspend: adminDriversApi.suspend,
    block: adminDriversApi.block,
    reactivate: adminDriversApi.reactivate,
  };

  const actionMutation = useMutation({
    mutationFn: ({ action, driverId }: { action: DriverAction; driverId: string }) =>
      actionFn[action](token as string, driverId),
    onSuccess: () => {
      setActionError(null);
      void queryClient.invalidateQueries({ queryKey: ['admin', 'drivers'], exact: true });
    },
    onError: (error) => {
      setActionError(
        error instanceof ApiError ? error.message : 'Não foi possível concluir a ação.',
      );
    },
  });

  const serviceTypesMutation = useMutation({
    mutationFn: ({ driverId, serviceTypeIds }: { driverId: string; serviceTypeIds: string[] }) =>
      adminDriversApi.replaceServiceTypes(token as string, driverId, { serviceTypeIds }),
    onSuccess: (_, variables) => {
      setActionError(null);
      setPendingServiceTypeIds((current) => {
        const remaining = { ...current };
        delete remaining[variables.driverId];
        return remaining;
      });
      void queryClient.invalidateQueries({ queryKey: ['admin', 'drivers'], exact: true });
    },
    onError: (error) => {
      setActionError(
        error instanceof ApiError ? error.message : 'Não foi possível salvar as modalidades.',
      );
    },
  });

  if (!token) {
    return (
      <p className="text-sm text-muted-foreground">
        Faça login como administrador para ver os entregadores.
      </p>
    );
  }

  const drivers = driversQuery.data ?? [];
  const pendingCount = drivers.filter((d) => d.approvalStatus === 'PENDING').length;
  const blockedCount = drivers.filter((d) => d.accountStatus !== 'ACTIVE').length;
  const filteredDrivers = drivers.filter((driver) =>
    `${driver.name} ${driver.email} ${driver.cpf}`.toLowerCase().includes(search.toLowerCase()),
  );

  function handleDriverCreated(result: RegisterDriverResult) {
    setCreatedNotice(
      `Entregador cadastrado com sucesso. O perfil está ${
        result.approvalStatus === 'PENDING' ? 'pendente de aprovação' : 'criado'
      }.`,
    );
    setActionError(null);
  }

  function selectedServiceTypeIds(driver: AdminDriverListItem): string[] {
    return (
      pendingServiceTypeIds[driver.id] ?? driver.serviceTypes.map((serviceType) => serviceType.id)
    );
  }

  function toggleServiceType(driver: AdminDriverListItem, serviceTypeId: string) {
    setPendingServiceTypeIds((current) => {
      const selected =
        current[driver.id] ?? driver.serviceTypes.map((serviceType) => serviceType.id);
      const next = selected.includes(serviceTypeId)
        ? selected.filter((id) => id !== serviceTypeId)
        : [...selected, serviceTypeId];
      return { ...current, [driver.id]: next };
    });
  }

  function isSavingServiceTypes(driverId: string) {
    return serviceTypesMutation.isPending && serviceTypesMutation.variables?.driverId === driverId;
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        icon={UserPlus}
        eyebrow="Equipe de campo"
        title="Entregadores"
        description="Cadastre, qualifique e acompanhe quem atende as entregas da plataforma."
        tone="operation"
        actions={
          <CreateDriverDialog
            accessToken={token}
            serviceTypes={serviceTypesQuery.data ?? []}
            serviceTypesLoading={serviceTypesQuery.isLoading}
            serviceTypesError={serviceTypesQuery.isError}
            onRetryServiceTypes={() => void serviceTypesQuery.refetch()}
            onCreated={handleDriverCreated}
          >
            <Button className="gap-2 shadow-lg shadow-primary/15">
              <UserPlus className="size-4" />
              Cadastrar entregador
            </Button>
          </CreateDriverDialog>
        }
      />

      {createdNotice && (
        <ActionFeedback
          tone="success"
          title="Entregador cadastrado"
          onDismiss={() => setCreatedNotice(null)}
        >
          {createdNotice}
        </ActionFeedback>
      )}

      {driversQuery.isSuccess && (
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard label="Total de Entregadores" value={drivers.length} />
          <StatCard label="Entregadores Pendentes" value={pendingCount} />
          <StatCard label="Fora de operação" value={blockedCount} />
        </div>
      )}

      <Input
        placeholder="Buscar entregador..."
        className="max-w-xs"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />

      {actionError && (
        <ActionFeedback tone="error" title="Não foi possível concluir a ação">
          {actionError}
        </ActionFeedback>
      )}

      {driversQuery.isLoading && (
        <QueryState
          kind="loading"
          title="Carregando entregadores"
          description="Consultando aprovações, modalidades e situação das contas."
        />
      )}

      {driversQuery.isError && (
        <QueryState
          kind="error"
          title="Não foi possível carregar os entregadores"
          description="Os indicadores ficam ocultos para não confundir uma falha com zero entregadores."
          onAction={() => void driversQuery.refetch()}
        />
      )}

      {driversQuery.isSuccess && filteredDrivers.length === 0 && (
        <QueryState
          kind="empty"
          title="Nenhum entregador encontrado"
          description="Revise o nome, e-mail ou CPF informado na busca."
        />
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filteredDrivers.map((driver) => (
          <Card key={driver.id} className={`entity-card ${driverCardClass[driver.accountStatus]}`}>
            <CardContent className="space-y-3 py-4">
              {/*
                A IDENTIDADE do entregador leva à ficha dele. Nao o cartao
                inteiro: daqui para baixo ele e so controle — caixas de
                modalidade, salvar, aprovar, bloquear — e um link por cima disso
                faria cada clique numa caixa navegar junto.

                A regiao clicavel e justamente a que nao tem nada clicavel
                dentro, entao as duas coisas nunca disputam o mesmo clique.
              */}
              <Link
                href={`/entregadores/${driver.id}`}
                className="group block rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="flex min-w-0 items-center gap-1 font-medium transition-colors group-hover:text-primary">
                    <span className="truncate">{driver.name}</span>
                    {/* O sinal de que da para clicar. Sem ele, ninguem descobre. */}
                    <ChevronRight
                      aria-hidden="true"
                      className="size-4 shrink-0 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5 group-hover:text-primary"
                    />
                  </p>
                  <div className="flex flex-wrap justify-end gap-1">
                    <Badge variant={approvalStatusVariant[driver.approvalStatus]}>
                      {approvalStatusLabel[driver.approvalStatus]}
                    </Badge>
                    {driver.approvalStatus === 'APPROVED' && driver.accountStatus !== 'ACTIVE' && (
                      <Badge variant="destructive">
                        {accountStatusLabel[driver.accountStatus]}
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="mt-3 space-y-0.5">
                  <p className="text-sm text-muted-foreground">{driver.email}</p>
                  <p className="text-sm text-muted-foreground">{driver.phone}</p>
                  <p className="text-xs text-muted-foreground">CPF: {driver.cpf}</p>
                  <p className="flex items-center gap-1 text-xs text-muted-foreground">
                    <MapPin className="size-3 text-primary" />
                    {driver.region?.name ?? 'Região não informada'}
                  </p>
                </div>
              </Link>
              {driver.reviewedBy && (
                <p className="text-xs text-muted-foreground">
                  Revisado por {driver.reviewedBy.name}
                </p>
              )}
              {/*
                So aparece quando ha devolucao. Um "0 devolucoes" fixo em toda
                ficha vira ruido e some no meio do resto — o numero precisa
                chamar atencao justamente quando nao e zero.

                E numero para OLHAR, nao gatilho de bloqueio: numa operacao de
                cinco motoboys, bloquear um automaticamente e perder 20% da
                frota por uma semana ruim.
              */}
              {driver.returnsLast7Days > 0 && (
                <p className="text-xs text-alerta">
                  Devolveu {driver.returnsLast7Days}{' '}
                  {driver.returnsLast7Days === 1 ? 'pedido' : 'pedidos'} à fila nos últimos 7 dias
                </p>
              )}

              <div className="space-y-2 rounded-md border p-3">
                <div>
                  <p className="text-sm font-medium">Modalidades</p>
                  {driver.serviceTypes.length === 0 && (
                    <p className="text-xs text-alerta">
                      Sem modalidade: este entregador não receberá ofertas.
                    </p>
                  )}
                </div>
                {serviceTypesQuery.isLoading && (
                  <p className="text-xs text-muted-foreground">Carregando modalidades...</p>
                )}
                {serviceTypesQuery.isError && (
                  <p className="text-xs text-destructive">
                    Não foi possível carregar as modalidades.
                  </p>
                )}
                {serviceTypesQuery.data?.map((serviceType) => {
                  const selected = selectedServiceTypeIds(driver).includes(serviceType.id);
                  return (
                    <label
                      key={serviceType.id}
                      className="flex cursor-pointer items-center gap-2 text-sm"
                    >
                      <Checkbox
                        checked={selected}
                        onCheckedChange={() => toggleServiceType(driver, serviceType.id)}
                        aria-label={`Modalidade ${serviceType.name}`}
                      />
                      <span>{serviceType.name}</span>
                      <span className="text-xs text-muted-foreground">({serviceType.code})</span>
                    </label>
                  );
                })}
                {serviceTypesQuery.isSuccess && serviceTypesQuery.data.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    Cadastre e ative uma modalidade antes de qualificar entregadores.
                  </p>
                )}
                <Button
                  className="w-full"
                  variant="secondary"
                  onClick={() =>
                    serviceTypesMutation.mutate({
                      driverId: driver.id,
                      serviceTypeIds: selectedServiceTypeIds(driver),
                    })
                  }
                  disabled={
                    serviceTypesMutation.isPending ||
                    serviceTypesQuery.isLoading ||
                    selectedServiceTypeIds(driver).length === 0
                  }
                >
                  {isSavingServiceTypes(driver.id) ? 'Salvando...' : 'Salvar modalidades'}
                </Button>
              </div>

              {driver.approvalStatus === 'PENDING' && (
                <div className="flex gap-2">
                  <ConfirmActionDialog
                    title={`Aprovar ${driver.name}?`}
                    description="Confirme a liberação deste entregador."
                    consequence="O entregador poderá ficar online, receber ofertas e assumir pedidos nas modalidades atribuídas."
                    confirmLabel="Aprovar entregador"
                    pendingLabel="Aprovando..."
                    onConfirm={() =>
                      actionMutation.mutateAsync({ action: 'approve', driverId: driver.id })
                    }
                  >
                    <Button className="flex-1" disabled={actionMutation.isPending}>
                      Aprovar
                    </Button>
                  </ConfirmActionDialog>
                  <ConfirmActionDialog
                    title={`Rejeitar o cadastro de ${driver.name}?`}
                    description="Confirme a rejeição deste cadastro."
                    consequence="O entregador continuará sem acesso à operação. A decisão ficará registrada no histórico administrativo."
                    confirmLabel="Rejeitar cadastro"
                    pendingLabel="Rejeitando..."
                    variant="destructive"
                    onConfirm={() =>
                      actionMutation.mutateAsync({ action: 'reject', driverId: driver.id })
                    }
                  >
                    <Button
                      className="flex-1"
                      variant="outline"
                      disabled={actionMutation.isPending}
                    >
                      Rejeitar
                    </Button>
                  </ConfirmActionDialog>
                </div>
              )}

              {driver.approvalStatus === 'APPROVED' && driver.accountStatus === 'ACTIVE' && (
                <div className="flex gap-2">
                  <ConfirmActionDialog
                    title={`Suspender ${driver.name}?`}
                    description="Confirme a suspensão temporária deste entregador."
                    consequence="Ele não poderá ficar online nem receber novos pedidos até ser reativado pelo administrador."
                    confirmLabel="Suspender entregador"
                    pendingLabel="Suspendendo..."
                    onConfirm={() =>
                      actionMutation.mutateAsync({ action: 'suspend', driverId: driver.id })
                    }
                  >
                    <Button
                      className="flex-1"
                      variant="outline"
                      disabled={actionMutation.isPending}
                    >
                      Suspender
                    </Button>
                  </ConfirmActionDialog>
                  <ConfirmActionDialog
                    title={`Bloquear ${driver.name}?`}
                    description="Confirme o bloqueio deste entregador."
                    consequence="O acesso operacional será interrompido até uma reativação manual do administrador."
                    confirmLabel="Bloquear entregador"
                    pendingLabel="Bloqueando..."
                    variant="destructive"
                    onConfirm={() =>
                      actionMutation.mutateAsync({ action: 'block', driverId: driver.id })
                    }
                  >
                    <Button
                      className="flex-1"
                      variant="destructive"
                      disabled={actionMutation.isPending}
                    >
                      Bloquear
                    </Button>
                  </ConfirmActionDialog>
                </div>
              )}

              {driver.approvalStatus === 'APPROVED' && driver.accountStatus === 'SUSPENDED' && (
                <div className="flex gap-2">
                  <ConfirmActionDialog
                    title={`Reativar ${driver.name}?`}
                    description="Confirme a volta deste entregador à operação."
                    consequence="Ele poderá ficar online e voltar a receber novas ofertas imediatamente."
                    confirmLabel="Reativar entregador"
                    pendingLabel="Reativando..."
                    onConfirm={() =>
                      actionMutation.mutateAsync({ action: 'reactivate', driverId: driver.id })
                    }
                  >
                    <Button className="flex-1" disabled={actionMutation.isPending}>
                      Reativar
                    </Button>
                  </ConfirmActionDialog>
                  <ConfirmActionDialog
                    title={`Bloquear ${driver.name}?`}
                    description="Confirme o bloqueio deste entregador."
                    consequence="A suspensão será convertida em bloqueio e o acesso seguirá interrompido até reativação manual."
                    confirmLabel="Bloquear entregador"
                    pendingLabel="Bloqueando..."
                    variant="destructive"
                    onConfirm={() =>
                      actionMutation.mutateAsync({ action: 'block', driverId: driver.id })
                    }
                  >
                    <Button
                      className="flex-1"
                      variant="destructive"
                      disabled={actionMutation.isPending}
                    >
                      Bloquear
                    </Button>
                  </ConfirmActionDialog>
                </div>
              )}

              {driver.approvalStatus === 'APPROVED' && driver.accountStatus === 'BLOCKED' && (
                <ConfirmActionDialog
                  title={`Reativar ${driver.name}?`}
                  description="Confirme a remoção do bloqueio deste entregador."
                  consequence="Ele recuperará o acesso operacional e poderá voltar a receber ofertas."
                  confirmLabel="Reativar entregador"
                  pendingLabel="Reativando..."
                  onConfirm={() =>
                    actionMutation.mutateAsync({ action: 'reactivate', driverId: driver.id })
                  }
                >
                  <Button className="w-full" disabled={actionMutation.isPending}>
                    Reativar
                  </Button>
                </ConfirmActionDialog>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {blockedCount > 0 && (
        <p className="text-xs text-muted-foreground">
          {blockedCount} entregador(es) suspenso(s) ou bloqueado(s) na lista acima.
        </p>
      )}
    </div>
  );
}
