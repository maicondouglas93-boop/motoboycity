'use client';

import { useState, type SubmitEvent } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@motoboycity/api-client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { adminPlatformSettingsApi, adminPricingTablesApi, adminServiceTypesApi } from '@/lib/api-client';
import { session } from '@/lib/session';

function formatCurrency(value: number | null): string {
  if (value === null) return '—';
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export default function PricingTablesPage() {
  const token = session.getToken();
  const queryClient = useQueryClient();

  const [commissionInput, setCommissionInput] = useState('');
  const [commissionError, setCommissionError] = useState<string | null>(null);

  const [serviceTypeId, setServiceTypeId] = useState('');
  const [baseFee, setBaseFee] = useState('');
  const [perKmFee, setPerKmFee] = useState('');
  const [minimumFee, setMinimumFee] = useState('');
  const [returnFee, setReturnFee] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const settingsQuery = useQuery({
    queryKey: ['admin', 'platform-settings'],
    queryFn: () => adminPlatformSettingsApi.get(token as string),
    enabled: Boolean(token),
  });

  const serviceTypesQuery = useQuery({
    queryKey: ['admin', 'service-types', { active: true }],
    queryFn: () => adminServiceTypesApi.list(token as string, { active: true }),
    enabled: Boolean(token),
  });

  const pricingTablesQuery = useQuery({
    queryKey: ['admin', 'pricing-tables'],
    queryFn: () => adminPricingTablesApi.list(token as string),
    enabled: Boolean(token),
  });

  const commissionMutation = useMutation({
    mutationFn: (driverCommissionPercentage: number) =>
      adminPlatformSettingsApi.update(token as string, { driverCommissionPercentage }),
    onSuccess: () => {
      setCommissionError(null);
      void queryClient.invalidateQueries({ queryKey: ['admin', 'platform-settings'] });
    },
    onError: (error) => {
      setCommissionError(error instanceof ApiError ? error.message : 'Não foi possível salvar.');
    },
  });

  const createMutation = useMutation({
    mutationFn: (payload: {
      serviceTypeId: string;
      baseFee: number;
      perKmFee: number;
      minimumFee?: number;
      returnFee?: number;
    }) => adminPricingTablesApi.create(token as string, payload),
    onSuccess: () => {
      setFormError(null);
      setBaseFee('');
      setPerKmFee('');
      setMinimumFee('');
      setReturnFee('');
      void queryClient.invalidateQueries({ queryKey: ['admin', 'pricing-tables'] });
    },
    onError: (error) => {
      setFormError(error instanceof ApiError ? error.message : 'Não foi possível criar.');
    },
  });

  const deactivateMutation = useMutation({
    mutationFn: (id: string) => adminPricingTablesApi.deactivate(token as string, id),
    onSuccess: () => {
      setActionError(null);
      void queryClient.invalidateQueries({ queryKey: ['admin', 'pricing-tables'] });
    },
    onError: (error) => {
      setActionError(error instanceof ApiError ? error.message : 'Não foi possível desativar.');
    },
  });

  if (!token) {
    return (
      <p className="text-sm text-muted-foreground">
        Faça login como administrador para ver a tabela de preços.
      </p>
    );
  }

  const settings = settingsQuery.data;
  const serviceTypes = serviceTypesQuery.data ?? [];
  const pricingTables = pricingTablesQuery.data ?? [];

  function handleSaveCommission(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setCommissionError(null);

    const parsed = Number(commissionInput.replace(',', '.'));
    if (Number.isNaN(parsed) || parsed < 0 || parsed > 100) {
      setCommissionError('Informe um percentual entre 0 e 100.');
      return;
    }
    commissionMutation.mutate(parsed);
  }

  function handleCreatePricingTable(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    if (!serviceTypeId) {
      setFormError('Selecione um tipo de serviço.');
      return;
    }
    const base = Number(baseFee.replace(',', '.'));
    const perKm = Number(perKmFee.replace(',', '.'));
    if (Number.isNaN(base) || Number.isNaN(perKm)) {
      setFormError('Valor base e valor por km são obrigatórios.');
      return;
    }

    createMutation.mutate({
      serviceTypeId,
      baseFee: base,
      perKmFee: perKm,
      ...(minimumFee.trim() && { minimumFee: Number(minimumFee.replace(',', '.')) }),
      ...(returnFee.trim() && { returnFee: Number(returnFee.replace(',', '.')) }),
    });
  }

  return (
    <div className="space-y-6">
      <Link href="/configuracoes" className="text-sm text-muted-foreground hover:underline">
        ← Configurações
      </Link>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Divisão entregador/plataforma</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {settingsQuery.isSuccess && (
            <p className="text-sm text-muted-foreground">
              {settings?.driverCommissionPercentage === null
                ? 'Ainda não configurado — nenhum pedido pode ser precificado até isso ser definido.'
                : `Atual: ${settings?.driverCommissionPercentage}% para o entregador${
                    settings?.updatedBy ? ` · última alteração por ${settings.updatedBy.name}` : ''
                  }`}
            </p>
          )}
          <form className="flex flex-wrap items-end gap-3" onSubmit={handleSaveCommission}>
            <div className="space-y-1.5">
              <Label htmlFor="commission">Percentual do entregador (%)</Label>
              <Input
                id="commission"
                placeholder="80"
                value={commissionInput}
                onChange={(event) => setCommissionInput(event.target.value)}
                className="w-40"
              />
            </div>
            <Button type="submit" disabled={commissionMutation.isPending}>
              {commissionMutation.isPending ? 'Salvando...' : 'Salvar'}
            </Button>
          </form>
          {commissionError && <p className="text-sm text-destructive">{commissionError}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Nova tabela de preços</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {serviceTypes.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Nenhum tipo de serviço ativo. Crie um em{' '}
              <Link href="/configuracoes/tipos-de-servico" className="underline">
                Tipos de Serviços
              </Link>{' '}
              antes de configurar preços.
            </p>
          )}
          {serviceTypes.length > 0 && (
            <form className="flex flex-wrap items-end gap-3" onSubmit={handleCreatePricingTable}>
              <div className="space-y-1.5">
                <Label>Tipo de serviço</Label>
                <Select value={serviceTypeId} onValueChange={(value) => setServiceTypeId(value ?? '')}>
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {serviceTypes.map((serviceType) => (
                      <SelectItem key={serviceType.id} value={serviceType.id}>
                        {serviceType.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="baseFee">Valor base (R$)</Label>
                <Input
                  id="baseFee"
                  placeholder="5,00"
                  value={baseFee}
                  onChange={(event) => setBaseFee(event.target.value)}
                  className="w-28"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="perKmFee">Valor por km (R$)</Label>
                <Input
                  id="perKmFee"
                  placeholder="1,50"
                  value={perKmFee}
                  onChange={(event) => setPerKmFee(event.target.value)}
                  className="w-28"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="minimumFee">Valor mínimo (R$, opcional)</Label>
                <Input
                  id="minimumFee"
                  placeholder="8,00"
                  value={minimumFee}
                  onChange={(event) => setMinimumFee(event.target.value)}
                  className="w-32"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="returnFee">Valor de retorno (R$, opcional)</Label>
                <Input
                  id="returnFee"
                  placeholder="3,00"
                  value={returnFee}
                  onChange={(event) => setReturnFee(event.target.value)}
                  className="w-32"
                />
              </div>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? 'Criando...' : 'Criar'}
              </Button>
            </form>
          )}
          {formError && <p className="text-sm text-destructive">{formError}</p>}
          <p className="text-xs text-muted-foreground">
            Criar uma nova tabela para o mesmo tipo de serviço desativa automaticamente a anterior —
            valores já usados em pedidos ficam congelados, o preço nunca é editado em lugar.
          </p>
        </CardContent>
      </Card>

      {actionError && <p className="text-sm text-destructive">{actionError}</p>}

      {pricingTablesQuery.isLoading && (
        <p className="text-sm text-muted-foreground">Carregando tabelas de preço...</p>
      )}
      {pricingTablesQuery.isSuccess && pricingTables.length === 0 && (
        <p className="text-sm text-muted-foreground">Nenhuma tabela de preços cadastrada ainda.</p>
      )}

      {pricingTables.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Serviço</TableHead>
              <TableHead>Base</TableHead>
              <TableHead>Por km</TableHead>
              <TableHead>Mínimo</TableHead>
              <TableHead>Retorno</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pricingTables.map((pricingTable) => (
              <TableRow key={pricingTable.id}>
                <TableCell>{pricingTable.serviceTypeName}</TableCell>
                <TableCell>{formatCurrency(pricingTable.baseFee)}</TableCell>
                <TableCell>{formatCurrency(pricingTable.perKmFee)}</TableCell>
                <TableCell>{formatCurrency(pricingTable.minimumFee)}</TableCell>
                <TableCell>{formatCurrency(pricingTable.returnFee)}</TableCell>
                <TableCell>
                  <Badge variant={pricingTable.active ? 'default' : 'outline'}>
                    {pricingTable.active ? 'Ativa' : 'Inativa'}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  {pricingTable.active && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={deactivateMutation.isPending}
                      onClick={() => deactivateMutation.mutate(pricingTable.id)}
                    >
                      Desativar
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
