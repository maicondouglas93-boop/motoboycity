'use client';

import { useId, useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@motoboycity/api-client';
import { Ban, Building2, ShieldCheck } from 'lucide-react';
import { adminCompaniesApi, adminDriversApi } from '@/lib/api-client';
import { ActionFeedback } from '@/components/ui/action-feedback';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function DriverCompanyBlocks({ driverId, token }: { driverId: string; token: string }) {
  const queryClient = useQueryClient();
  const companySelectId = useId();
  const reasonInputId = useId();
  const [companyId, setCompanyId] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const blocksQuery = useQuery({
    queryKey: ['admin', 'driver-company-blocks', driverId],
    queryFn: () => adminDriversApi.companyBlocks(token, driverId),
  });
  const companiesQuery = useQuery({
    queryKey: ['admin', 'companies'],
    queryFn: () => adminCompaniesApi.list(token),
  });

  const blockedCompanyIds = useMemo(
    () => new Set((blocksQuery.data ?? []).map((block) => block.company.id)),
    [blocksQuery.data],
  );
  const availableCompanies = (companiesQuery.data ?? []).filter(
    (company) => !blockedCompanyIds.has(company.id),
  );

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ['admin', 'driver-company-blocks', driverId] });

  const blockMutation = useMutation({
    mutationFn: () =>
      adminDriversApi.blockCompany(token, driverId, {
        companyId,
        reason: reason.trim(),
      }),
    onSuccess: async () => {
      setCompanyId('');
      setReason('');
      setError(null);
      await refresh();
    },
    onError: (cause: unknown) =>
      setError(
        cause instanceof ApiError
          ? cause.message
          : 'Nao foi possivel bloquear esta empresa para o motoboy.',
      ),
  });

  const unblockMutation = useMutation({
    mutationFn: (targetCompanyId: string) =>
      adminDriversApi.unblockCompany(token, driverId, targetCompanyId),
    onSuccess: async () => {
      setError(null);
      await refresh();
    },
    onError: (cause: unknown) =>
      setError(
        cause instanceof ApiError
          ? cause.message
          : 'Nao foi possivel liberar esta empresa para o motoboy.',
      ),
  });

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (!companyId) {
      setError('Selecione uma empresa.');
      return;
    }
    if (reason.trim().length < 3) {
      setError('Descreva o motivo do bloqueio.');
      return;
    }
    setError(null);
    blockMutation.mutate();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Ban className="size-4" aria-hidden="true" /> Empresas bloqueadas
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          O motoboy nao recebe, nao ve e nao pode assumir novos pedidos dessas empresas. Pedidos ja
          aceitos continuam normalmente.
        </p>

        <form
          className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
          onSubmit={submit}
        >
          <div className="space-y-1.5">
            <Label htmlFor={companySelectId}>Empresa</Label>
            <select
              id={companySelectId}
              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              value={companyId}
              disabled={companiesQuery.isLoading || blockMutation.isPending}
              onChange={(event) => setCompanyId(event.target.value)}
            >
              <option value="">Selecione a empresa</option>
              {availableCompanies.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.tradeName}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={reasonInputId}>Motivo</Label>
            <Input
              id={reasonInputId}
              value={reason}
              maxLength={300}
              placeholder="Ex.: solicitacao da empresa"
              disabled={blockMutation.isPending}
              onChange={(event) => setReason(event.target.value)}
            />
          </div>
          <Button className="self-end" type="submit" disabled={blockMutation.isPending}>
            <Ban className="size-3.5" />
            {blockMutation.isPending ? 'Bloqueando...' : 'Bloquear empresa'}
          </Button>
        </form>

        {error && <ActionFeedback tone="error">{error}</ActionFeedback>}

        {blocksQuery.isError ? (
          <ActionFeedback tone="error">Nao foi possivel carregar os bloqueios.</ActionFeedback>
        ) : blocksQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando bloqueios...</p>
        ) : (blocksQuery.data?.length ?? 0) === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhuma empresa bloqueada para este motoboy.
          </p>
        ) : (
          <ul className="grid gap-2 lg:grid-cols-2">
            {blocksQuery.data?.map((block) => (
              <li
                key={block.id}
                className="flex items-center justify-between gap-3 rounded-xl border bg-muted/20 px-3 py-2"
              >
                <div className="min-w-0 text-sm">
                  <p className="flex items-center gap-1.5 font-medium">
                    <Building2 className="size-3.5 shrink-0" aria-hidden="true" />
                    <span className="truncate">{block.company.tradeName}</span>
                  </p>
                  <p className="truncate text-xs text-muted-foreground" title={block.reason}>
                    {block.reason}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={unblockMutation.isPending}
                  onClick={() =>
                    window.confirm(`Liberar pedidos da empresa ${block.company.tradeName}?`) &&
                    unblockMutation.mutate(block.company.id)
                  }
                >
                  <ShieldCheck className="size-3.5" /> Liberar
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
