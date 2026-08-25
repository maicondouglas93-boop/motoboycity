'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AdminCompanyListItem, RegisterCompanyResult } from '@motoboycity/types';
import { ApiError } from '@motoboycity/api-client';
import { Building2, Check, Copy, PackagePlus } from 'lucide-react';
import { CreateCompanyDialog } from '@/components/companies/create-company-dialog';
import { CreateCompanyDeliveryDialog } from '@/components/deliveries/create-company-delivery-dialog';
import { ConfirmActionDialog } from '@/components/admin/confirm-action-dialog';
import { AdminPageHeader } from '@/components/layout/admin-page-header';
import { ActionFeedback } from '@/components/ui/action-feedback';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { QueryState } from '@/components/ui/query-state';
import { StatCard } from '@/components/stat-card';
import { adminCompaniesApi } from '@/lib/api-client';
import { session } from '@/lib/session';

const statusLabel: Record<AdminCompanyListItem['status'], string> = {
  PENDING_APPROVAL: 'Pendente',
  ACTIVE: 'Ativa',
  SUSPENDED: 'Suspensa',
};

const statusVariant: Record<AdminCompanyListItem['status'], 'outline' | 'default' | 'destructive'> =
  {
    PENDING_APPROVAL: 'outline',
    ACTIVE: 'default',
    SUSPENDED: 'destructive',
  };

const statusCardClass: Record<AdminCompanyListItem['status'], string> = {
  PENDING_APPROVAL:
    'border-status-rota/25 bg-gradient-to-br from-card to-dinheiro-nao-cobrado-suave/65',
  ACTIVE: 'border-status-entregue/20 bg-gradient-to-br from-card to-dinheiro-recebido-suave/55',
  SUSPENDED: 'border-status-cancelado/20 bg-gradient-to-br from-card to-dinheiro-atrasado-suave/55',
};

const COMPANY_LOGIN_URL = 'https://motoboycity-company-web.vercel.app/login';

export default function ClientsPage() {
  const [search, setSearch] = useState('');
  const [approveError, setApproveError] = useState<string | null>(null);
  const [createdNotice, setCreatedNotice] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'error'>('idle');
  const queryClient = useQueryClient();

  const token = session.getToken();

  const companiesQuery = useQuery({
    queryKey: ['admin', 'companies'],
    queryFn: () => adminCompaniesApi.list(token as string),
    enabled: Boolean(token),
  });

  const approveMutation = useMutation({
    mutationFn: (companyId: string) => adminCompaniesApi.approve(token as string, companyId),
    onSuccess: () => {
      setApproveError(null);
      void queryClient.invalidateQueries({ queryKey: ['admin', 'companies'] });
    },
    onError: (error) => {
      setApproveError(error instanceof ApiError ? error.message : 'Não foi possível aprovar.');
    },
  });

  if (!token) {
    return (
      <p className="text-sm text-muted-foreground">
        Faça login como administrador para ver os clientes.
      </p>
    );
  }

  const companies = companiesQuery.data ?? [];
  const pendingCount = companies.filter((c) => c.status === 'PENDING_APPROVAL').length;
  const filteredCompanies = companies.filter((company) =>
    `${company.legalName} ${company.tradeName} ${company.document}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );

  function handleCompanyCreated(result: RegisterCompanyResult) {
    setCreatedNotice(
      result.status === 'PENDING_APPROVAL'
        ? 'Empresa cadastrada. Revise os dados e aprove o acesso quando estiver pronta para operar.'
        : 'Empresa cadastrada com sucesso.',
    );
  }

  async function handleCopyCompanyLogin() {
    try {
      await navigator.clipboard.writeText(COMPANY_LOGIN_URL);
      setCopyStatus('copied');
    } catch {
      setCopyStatus('error');
    }
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        icon={Building2}
        eyebrow="Carteira de clientes"
        title="Empresas"
        description="Cadastre, aprove e acompanhe as empresas atendidas pela plataforma."
        tone="customers"
        actions={
          <>
            <CreateCompanyDeliveryDialog accessToken={token} companies={companies}>
              <Button type="button" variant="outline" className="gap-2">
                <PackagePlus className="size-4" /> Lançar pedido
              </Button>
            </CreateCompanyDeliveryDialog>
            <Button
              type="button"
              variant="outline"
              className="gap-2"
              onClick={() => void handleCopyCompanyLogin()}
              title={COMPANY_LOGIN_URL}
            >
              {copyStatus === 'copied' ? <Check className="size-4" /> : <Copy className="size-4" />}
              {copyStatus === 'copied' ? 'Link copiado' : 'Copiar link do painel'}
            </Button>
            <CreateCompanyDialog accessToken={token} onCreated={handleCompanyCreated}>
              <Button className="gap-2 shadow-lg shadow-primary/15">
                <Building2 className="size-4" /> Cadastrar empresa
              </Button>
            </CreateCompanyDialog>
          </>
        }
      />

      {copyStatus === 'error' && (
        <ActionFeedback tone="error" title="Não foi possível copiar o link">
          Verifique a permissão da área de transferência e tente novamente.
        </ActionFeedback>
      )}

      {createdNotice && (
        <ActionFeedback
          tone="success"
          title="Empresa cadastrada"
          onDismiss={() => setCreatedNotice(null)}
        >
          {createdNotice}
        </ActionFeedback>
      )}

      {approveError && (
        <ActionFeedback tone="error" title="Não foi possível aprovar a empresa">
          {approveError}
        </ActionFeedback>
      )}

      {companiesQuery.isLoading && (
        <QueryState
          kind="loading"
          title="Carregando empresas"
          description="Consultando cadastros, aprovações e responsáveis."
        />
      )}

      {companiesQuery.isError && (
        <QueryState
          kind="error"
          title="Não foi possível carregar as empresas"
          description="Os totais não serão exibidos como zero enquanto a consulta estiver indisponível."
          onAction={() => void companiesQuery.refetch()}
        />
      )}

      {companiesQuery.isSuccess && (
        <>
          <div className="grid max-w-xl grid-cols-2 gap-4">
            <StatCard label="Total de Clientes" value={companies.length} />
            <StatCard label="Clientes Pendentes" value={pendingCount} />
          </div>

          <Input
            placeholder="Buscar cliente..."
            className="max-w-xs"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />

          {filteredCompanies.length === 0 && (
            <QueryState
              kind="empty"
              title="Nenhuma empresa encontrada"
              description="Revise o nome, razão social ou documento informado na busca."
            />
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredCompanies.map((company) => (
              <Card key={company.id} className={`entity-card ${statusCardClass[company.status]}`}>
                <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">{company.tradeName}</CardTitle>
                  <Badge variant={statusVariant[company.status]}>
                    {statusLabel[company.status]}
                  </Badge>
                </CardHeader>
                <CardContent className="space-y-3 pt-0">
                  <div>
                    <p className="text-sm text-muted-foreground">{company.legalName}</p>
                    <p className="text-sm text-muted-foreground">{company.document}</p>
                    {company.owner && (
                      <>
                        <p className="text-sm text-muted-foreground">{company.owner.email}</p>
                        <p className="text-sm text-muted-foreground">{company.owner.phone}</p>
                      </>
                    )}
                  </div>
                  {company.status === 'PENDING_APPROVAL' && (
                    <ConfirmActionDialog
                      title={`Aprovar ${company.tradeName}?`}
                      description="Confirme a liberação desta empresa no painel."
                      consequence="A empresa poderá entrar no próprio painel e começar a solicitar entregas imediatamente."
                      confirmLabel="Aprovar empresa"
                      pendingLabel="Aprovando..."
                      onConfirm={() => approveMutation.mutateAsync(company.id)}
                    >
                      <Button className="w-full" disabled={approveMutation.isPending}>
                        Aprovar
                      </Button>
                    </ConfirmActionDialog>
                  )}
                  <Link
                    className="inline-flex h-9 w-full items-center justify-center rounded-lg border border-input bg-card px-3 text-sm font-semibold text-admin-deep shadow-sm transition-all hover:border-primary/25 hover:bg-admin-soft"
                    href={`/clientes/${company.id}`}
                  >
                    Ver detalhes
                  </Link>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
