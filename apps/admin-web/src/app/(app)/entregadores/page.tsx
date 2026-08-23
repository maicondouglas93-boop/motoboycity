'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AdminDriverListItem } from '@motoboycity/types';
import { ApiError } from '@motoboycity/api-client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
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

type DriverAction = 'approve' | 'reject' | 'suspend' | 'block' | 'reactivate';

export default function DriversPage() {
  const [search, setSearch] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
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
      void queryClient.invalidateQueries({ queryKey: ['admin', 'drivers'] });
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
      void queryClient.invalidateQueries({ queryKey: ['admin', 'drivers'] });
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

  function isPending(driverId: string, action: DriverAction) {
    return (
      actionMutation.isPending &&
      actionMutation.variables?.driverId === driverId &&
      actionMutation.variables?.action === action
    );
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
      <div className="grid grid-cols-2 gap-4">
        <StatCard label="Total de Entregadores" value={drivers.length} />
        <StatCard label="Entregadores Pendentes" value={pendingCount} />
      </div>

      <Input
        placeholder="Buscar entregador..."
        className="max-w-xs"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />

      {actionError && <p className="text-sm text-destructive">{actionError}</p>}

      {driversQuery.isLoading && (
        <p className="text-sm text-muted-foreground">Carregando entregadores...</p>
      )}

      {driversQuery.isError && (
        <p className="text-sm text-destructive">Não foi possível carregar os entregadores.</p>
      )}

      {driversQuery.isSuccess && filteredDrivers.length === 0 && (
        <p className="text-sm text-muted-foreground">Nenhum entregador encontrado.</p>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filteredDrivers.map((driver) => (
          <Card key={driver.id}>
            <CardContent className="space-y-3 py-4">
              <div className="flex items-start justify-between gap-2">
                <p className="font-medium">{driver.name}</p>
                <div className="flex flex-wrap justify-end gap-1">
                  <Badge variant={approvalStatusVariant[driver.approvalStatus]}>
                    {approvalStatusLabel[driver.approvalStatus]}
                  </Badge>
                  {driver.approvalStatus === 'APPROVED' && driver.accountStatus !== 'ACTIVE' && (
                    <Badge variant="destructive">{accountStatusLabel[driver.accountStatus]}</Badge>
                  )}
                </div>
              </div>
              <div className="space-y-0.5">
                <p className="text-sm text-muted-foreground">{driver.email}</p>
                <p className="text-sm text-muted-foreground">{driver.phone}</p>
                <p className="text-xs text-muted-foreground">CPF: {driver.cpf}</p>
              </div>
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
                  <Button
                    className="flex-1"
                    onClick={() =>
                      actionMutation.mutate({ action: 'approve', driverId: driver.id })
                    }
                    disabled={actionMutation.isPending}
                  >
                    {isPending(driver.id, 'approve') ? 'Aprovando...' : 'Aprovar'}
                  </Button>
                  <Button
                    className="flex-1"
                    variant="outline"
                    onClick={() => actionMutation.mutate({ action: 'reject', driverId: driver.id })}
                    disabled={actionMutation.isPending}
                  >
                    {isPending(driver.id, 'reject') ? 'Rejeitando...' : 'Rejeitar'}
                  </Button>
                </div>
              )}

              {driver.approvalStatus === 'APPROVED' && driver.accountStatus === 'ACTIVE' && (
                <div className="flex gap-2">
                  <Button
                    className="flex-1"
                    variant="outline"
                    onClick={() =>
                      actionMutation.mutate({ action: 'suspend', driverId: driver.id })
                    }
                    disabled={actionMutation.isPending}
                  >
                    {isPending(driver.id, 'suspend') ? 'Suspendendo...' : 'Suspender'}
                  </Button>
                  <Button
                    className="flex-1"
                    variant="destructive"
                    onClick={() => actionMutation.mutate({ action: 'block', driverId: driver.id })}
                    disabled={actionMutation.isPending}
                  >
                    {isPending(driver.id, 'block') ? 'Bloqueando...' : 'Bloquear'}
                  </Button>
                </div>
              )}

              {driver.approvalStatus === 'APPROVED' && driver.accountStatus === 'SUSPENDED' && (
                <div className="flex gap-2">
                  <Button
                    className="flex-1"
                    onClick={() =>
                      actionMutation.mutate({ action: 'reactivate', driverId: driver.id })
                    }
                    disabled={actionMutation.isPending}
                  >
                    {isPending(driver.id, 'reactivate') ? 'Reativando...' : 'Reativar'}
                  </Button>
                  <Button
                    className="flex-1"
                    variant="destructive"
                    onClick={() => actionMutation.mutate({ action: 'block', driverId: driver.id })}
                    disabled={actionMutation.isPending}
                  >
                    {isPending(driver.id, 'block') ? 'Bloqueando...' : 'Bloquear'}
                  </Button>
                </div>
              )}

              {driver.approvalStatus === 'APPROVED' && driver.accountStatus === 'BLOCKED' && (
                <Button
                  className="w-full"
                  onClick={() =>
                    actionMutation.mutate({ action: 'reactivate', driverId: driver.id })
                  }
                  disabled={actionMutation.isPending}
                >
                  {isPending(driver.id, 'reactivate') ? 'Reativando...' : 'Reativar'}
                </Button>
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
