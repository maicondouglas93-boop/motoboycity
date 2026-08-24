'use client';

import { useState, type SubmitEvent } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@motoboycity/api-client';
import { Building2, Check, Globe2 } from 'lucide-react';
import { CabecalhoDeConfiguracao } from '@/components/settings/estado-da-configuracao';
import { Tag } from 'lucide-react';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  adminCompaniesApi,
  adminPlatformSettingsApi,
  adminPricingTablesApi,
  adminServiceTypesApi,
} from '@/lib/api-client';
import { session } from '@/lib/session';
import { useMoney } from '@/lib/money';

const GENERAL_PRICING_SCOPE = 'GENERAL';
const CUSTOM_PRICING_SCOPE = 'CUSTOM';

/**
 * Zero vira travessão, e não "0 km": sem bandeirada a cobrança começa no metro
 * zero, e escrever um número ali sugeriria uma faixa que não existe.
 */
function formatDistance(value: number): string {
  if (!value) return '—';
  return `${value.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} km`;
}

export default function PricingTablesPage() {
  const money = useMoney();
  const token = session.getToken();
  const queryClient = useQueryClient();

  const [commissionInput, setCommissionInput] = useState('');
  const [commissionError, setCommissionError] = useState<string | null>(null);

  const [pricingScope, setPricingScope] = useState(GENERAL_PRICING_SCOPE);
  const [serviceTypeId, setServiceTypeId] = useState('');
  const [baseFee, setBaseFee] = useState('');
  const [includedDistanceKm, setIncludedDistanceKm] = useState('');
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

  const companiesQuery = useQuery({
    queryKey: ['admin', 'companies', 'pricing-scope'],
    queryFn: () => adminCompaniesApi.list(token as string),
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
      companyId?: string;
      baseFee: number;
      includedDistanceKm?: number;
      perKmFee: number;
      minimumFee?: number;
      returnFee?: number;
    }) => adminPricingTablesApi.create(token as string, payload),
    onSuccess: () => {
      setFormError(null);
      setBaseFee('');
      setIncludedDistanceKm('');
      setPerKmFee('');
      setMinimumFee('');
      setReturnFee('');
      void queryClient.invalidateQueries({ queryKey: ['admin', 'pricing-tables'] });
    },
    onError: (error) => {
      setFormError(error instanceof ApiError ? error.message : 'Não foi possível criar.');
    },
  });

  /**
   * Reativar recusa com 409 se ja houver outra ativa no mesmo escopo — e a
   * mensagem do servidor diz qual. Mostrar essa mensagem crua e melhor do que
   * traduzir para "erro ao ativar": ela nomeia o que precisa ser desativado.
   */
  const reactivateMutation = useMutation({
    mutationFn: (id: string) => adminPricingTablesApi.reactivate(token as string, id),
    onSuccess: () => {
      setFormError(null);
      void queryClient.invalidateQueries({ queryKey: ['admin', 'pricing-tables'] });
    },
    onError: (error) =>
      setFormError(
        error instanceof ApiError ? error.message : 'Não foi possível ativar a tabela.',
      ),
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
  const companies = companiesQuery.data ?? [];
  const pricingTables = pricingTablesQuery.data ?? [];
  /** `null` enquanto carrega: melhor nada do que "nenhuma tabela" por um instante. */
  const tabelasAtivas = pricingTablesQuery.data
    ? pricingTablesQuery.data.filter((tabela) => tabela.active).length
    : null;
  const isCustomPricing = pricingScope !== GENERAL_PRICING_SCOPE;
  const selectedCompanyId =
    pricingScope === GENERAL_PRICING_SCOPE || pricingScope === CUSTOM_PRICING_SCOPE
      ? null
      : pricingScope;
  const selectedCompany = companies.find((company) => company.id === selectedCompanyId) ?? null;
  const canConfigurePrices = !isCustomPricing || Boolean(selectedCompanyId);
  const scopedPricingTables = canConfigurePrices
    ? pricingTables.filter((pricingTable) => pricingTable.companyId === selectedCompanyId)
    : [];

  function handlePricingScopeChange(scope: string) {
    setPricingScope(scope);
    setFormError(null);
    setActionError(null);
  }

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
      ...(selectedCompanyId && { companyId: selectedCompanyId }),
      baseFee: base,
      ...(includedDistanceKm.trim() && {
        includedDistanceKm: Number(includedDistanceKm.replace(',', '.')),
      }),
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

      <CabecalhoDeConfiguracao
        icon={Tag}
        tom="precos"
        titulo="Tabelas de preços"
        descricao="Os valores congelados na criação de cada pedido. Sem nenhuma tabela ativa, um pedido novo não tem como ser cotado."
        situacao={
          tabelasAtivas === null
            ? null
            : tabelasAtivas === 0
              ? { estado: 'faltando', texto: 'Nenhuma tabela ativa' }
              : {
                  estado: 'definido',
                  texto: `${tabelasAtivas} tabela${tabelasAtivas === 1 ? '' : 's'} ativa${tabelasAtivas === 1 ? '' : 's'}`,
                }
        }
      />

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

      <Card className="overflow-hidden border-primary/15 bg-gradient-to-br from-card via-card to-admin-soft/45 shadow-sm">
        <CardHeader className="border-b border-border/70 bg-card/70">
          <CardTitle className="text-base">Configurar preços</CardTitle>
          <p className="text-sm text-muted-foreground">
            Escolha se os valores serão o padrão da operação ou exclusivos para uma empresa.
          </p>
        </CardHeader>
        <CardContent className="space-y-5 p-5 sm:p-6">
          <div className="grid gap-3 md:grid-cols-2">
            <button
              type="button"
              aria-pressed={!isCustomPricing}
              onClick={() => handlePricingScopeChange(GENERAL_PRICING_SCOPE)}
              className={`group relative flex min-h-28 items-start gap-4 rounded-2xl border p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-md ${
                !isCustomPricing
                  ? 'border-primary bg-primary/7 shadow-sm ring-1 ring-primary/15'
                  : 'border-border bg-card hover:border-primary/35'
              }`}
            >
              <span
                className={`flex size-11 shrink-0 items-center justify-center rounded-xl ${
                  !isCustomPricing
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary'
                }`}
              >
                <Globe2 className="size-5" />
              </span>
              <span className="min-w-0 pt-0.5">
                <span className="block font-semibold text-foreground">Tabela geral</span>
                <span className="mt-1 block text-sm leading-relaxed text-muted-foreground">
                  Valores padrão para empresas que não possuem uma configuração própria.
                </span>
              </span>
              {!isCustomPricing && (
                <span className="absolute right-4 top-4 flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <Check className="size-3.5" strokeWidth={3} />
                </span>
              )}
            </button>

            <button
              type="button"
              aria-pressed={isCustomPricing}
              onClick={() =>
                handlePricingScopeChange(isCustomPricing ? pricingScope : CUSTOM_PRICING_SCOPE)
              }
              className={`group relative flex min-h-28 items-start gap-4 rounded-2xl border p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-md ${
                isCustomPricing
                  ? 'border-primary bg-primary/7 shadow-sm ring-1 ring-primary/15'
                  : 'border-border bg-card hover:border-primary/35'
              }`}
            >
              <span
                className={`flex size-11 shrink-0 items-center justify-center rounded-xl ${
                  isCustomPricing
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary'
                }`}
              >
                <Building2 className="size-5" />
              </span>
              <span className="min-w-0 pt-0.5">
                <span className="block font-semibold text-foreground">
                  Criar preços personalizados
                </span>
                <span className="mt-1 block text-sm leading-relaxed text-muted-foreground">
                  Defina valores exclusivos para uma empresa, modalidade por modalidade.
                </span>
              </span>
              {isCustomPricing && (
                <span className="absolute right-4 top-4 flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <Check className="size-3.5" strokeWidth={3} />
                </span>
              )}
            </button>
          </div>

          {isCustomPricing && (
            <div className="rounded-2xl border border-primary/15 bg-card/85 p-4 shadow-sm sm:p-5">
              <div className="grid gap-4 lg:grid-cols-[minmax(280px,440px)_1fr] lg:items-end">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="flex size-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                      1
                    </span>
                    <Label htmlFor="pricing-company" className="text-sm font-semibold">
                      Selecione a empresa
                    </Label>
                  </div>
                  <Select
                    items={Object.fromEntries(
                      companies.map((company) => [company.id, company.tradeName]),
                    )}
                    value={selectedCompanyId ?? ''}
                    onValueChange={(value) =>
                      handlePricingScopeChange(value ?? CUSTOM_PRICING_SCOPE)
                    }
                  >
                    <SelectTrigger id="pricing-company" className="h-11 w-full bg-background">
                      <SelectValue placeholder="Escolha uma empresa" />
                    </SelectTrigger>
                    <SelectContent>
                      {companies.map((company) => (
                        <SelectItem key={company.id} value={company.id}>
                          {company.tradeName} · {company.document}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {companiesQuery.isLoading && (
                    <p className="text-xs text-muted-foreground">Carregando empresas...</p>
                  )}
                  {companiesQuery.isError && (
                    <p className="text-xs text-destructive">
                      Não foi possível carregar as empresas. Tente novamente em instantes.
                    </p>
                  )}
                </div>

                <div
                  className={`rounded-xl border px-4 py-3 text-sm ${
                    selectedCompany
                      ? 'border-primary/20 bg-primary/5'
                      : 'border-dashed border-border bg-muted/35'
                  }`}
                >
                  <p className="font-medium text-foreground">
                    {selectedCompany
                      ? `${selectedCompany.tradeName} selecionada`
                      : 'Os campos de preço abrem após a seleção'}
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    {selectedCompany
                      ? 'A empresa usará estes valores nas modalidades configuradas e continuará usando a tabela geral nas demais.'
                      : 'Escolha a empresa ao lado para preencher e salvar os valores personalizados.'}
                  </p>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {canConfigurePrices && (
        <Card className="overflow-hidden border-primary/15 shadow-sm">
          <CardHeader className="border-b border-border/70 bg-muted/20">
            <div className="flex items-center gap-3">
              <span className="flex size-8 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                {isCustomPricing ? '2' : '1'}
              </span>
              <div>
                <CardTitle className="text-base">
                  {selectedCompany
                    ? `Preços personalizados · ${selectedCompany.tradeName}`
                    : 'Configurar tabela geral'}
                </CardTitle>
                <p className="mt-1 text-xs text-muted-foreground">
                  Preencha os valores da modalidade e salve a nova tabela.
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-5 p-5 sm:p-6">
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
              <form className="space-y-5" onSubmit={handleCreatePricingTable}>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  <div className="space-y-1.5 md:col-span-2 xl:col-span-1">
                    <Label>Tipo de serviço</Label>
                    <Select
                      items={Object.fromEntries(serviceTypes.map((item) => [item.id, item.name]))}
                      value={serviceTypeId}
                      onValueChange={(value) => setServiceTypeId(value ?? '')}
                    >
                      <SelectTrigger className="h-11 w-full">
                        <SelectValue placeholder="Selecione a modalidade" />
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
                      className="h-11"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="includedDistanceKm">Base cobre até (km)</Label>
                    <Input
                      id="includedDistanceKm"
                      placeholder="3"
                      value={includedDistanceKm}
                      onChange={(event) => setIncludedDistanceKm(event.target.value)}
                      className="h-11"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="perKmFee">Valor por km adicional (R$)</Label>
                    <Input
                      id="perKmFee"
                      placeholder="1,50"
                      value={perKmFee}
                      onChange={(event) => setPerKmFee(event.target.value)}
                      className="h-11"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="minimumFee">Valor mínimo (R$, opcional)</Label>
                    <Input
                      id="minimumFee"
                      placeholder="8,00"
                      value={minimumFee}
                      onChange={(event) => setMinimumFee(event.target.value)}
                      className="h-11"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="returnFee">Valor de retorno (R$, opcional)</Label>
                    <Input
                      id="returnFee"
                      placeholder="3,00"
                      value={returnFee}
                      onChange={(event) => setReturnFee(event.target.value)}
                      className="h-11"
                    />
                  </div>
                </div>

                {formError && <p className="text-sm text-destructive">{formError}</p>}

                <div className="flex flex-col gap-3 border-t border-border/70 pt-4 sm:flex-row sm:items-center sm:justify-between">
                  <p className="max-w-2xl text-xs leading-relaxed text-muted-foreground">
                    Uma nova tabela para a mesma modalidade substitui a anterior. Valores já usados
                    em pedidos permanecem congelados.
                  </p>
                  <Button type="submit" className="min-w-52" disabled={createMutation.isPending}>
                    {createMutation.isPending
                      ? 'Salvando...'
                      : selectedCompany
                        ? 'Salvar preços personalizados'
                        : 'Salvar tabela geral'}
                  </Button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>
      )}

      {actionError && <p className="text-sm text-destructive">{actionError}</p>}

      {canConfigurePrices && pricingTablesQuery.isLoading && (
        <p className="text-sm text-muted-foreground">Carregando tabelas de preço...</p>
      )}
      {canConfigurePrices && pricingTablesQuery.isSuccess && scopedPricingTables.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            {selectedCompany
              ? `${selectedCompany.tradeName} ainda não possui preços personalizados e usa a tabela geral.`
              : 'Nenhuma tabela geral de preços cadastrada ainda.'}
          </CardContent>
        </Card>
      )}

      {canConfigurePrices && scopedPricingTables.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Serviço</TableHead>
              <TableHead>Aplicação</TableHead>
              <TableHead>Base</TableHead>
              <TableHead>Cobre até</TableHead>
              <TableHead>Por km</TableHead>
              <TableHead>Mínimo</TableHead>
              <TableHead>Retorno</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {scopedPricingTables.map((pricingTable) => (
              <TableRow key={pricingTable.id}>
                <TableCell>{pricingTable.serviceTypeName}</TableCell>
                <TableCell>{pricingTable.companyName ?? 'Tabela geral'}</TableCell>
                <TableCell>{money(pricingTable.baseFee)}</TableCell>
                <TableCell>{formatDistance(pricingTable.includedDistanceKm)}</TableCell>
                <TableCell>{money(pricingTable.perKmFee)}</TableCell>
                <TableCell>{money(pricingTable.minimumFee)}</TableCell>
                <TableCell>{money(pricingTable.returnFee)}</TableCell>
                <TableCell>
                  <Badge variant={pricingTable.active ? 'default' : 'outline'}>
                    {pricingTable.active ? 'Ativa' : 'Inativa'}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  {/*
                    Desativar era caminho sem volta: a rota de reativar nem
                    existia. Quem desativasse sem criar uma substituta deixava a
                    regiao SEM tabela — e pedido sem tabela nao e cotado.
                  */}
                  {pricingTable.active ? (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={deactivateMutation.isPending}
                      onClick={() => deactivateMutation.mutate(pricingTable.id)}
                    >
                      Desativar
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      disabled={reactivateMutation.isPending}
                      onClick={() => reactivateMutation.mutate(pricingTable.id)}
                    >
                      {reactivateMutation.isPending &&
                      reactivateMutation.variables === pricingTable.id
                        ? 'Ativando...'
                        : 'Ativar'}
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
