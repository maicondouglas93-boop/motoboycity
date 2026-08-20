'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AdminCompanyListItem } from '@motoboycity/types';
import { ApiError } from '@motoboycity/api-client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
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

export default function ClientsPage() {
  const [search, setSearch] = useState('');
  const [approveError, setApproveError] = useState<string | null>(null);
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="grid grid-cols-2 gap-4">
          <StatCard label="Total de Clientes" value={companies.length} />
          <StatCard label="Clientes Pendentes" value={pendingCount} />
        </div>
      </div>

      <Input
        placeholder="Buscar cliente..."
        className="max-w-xs"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />

      {approveError && <p className="text-sm text-destructive">{approveError}</p>}

      {companiesQuery.isLoading && (
        <p className="text-sm text-muted-foreground">Carregando clientes...</p>
      )}

      {companiesQuery.isError && (
        <p className="text-sm text-destructive">Não foi possível carregar os clientes.</p>
      )}

      {companiesQuery.isSuccess && filteredCompanies.length === 0 && (
        <p className="text-sm text-muted-foreground">Nenhum cliente encontrado.</p>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filteredCompanies.map((company) => (
          <Card key={company.id}>
            <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{company.tradeName}</CardTitle>
              <Badge variant={statusVariant[company.status]}>{statusLabel[company.status]}</Badge>
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
                <Button
                  className="w-full"
                  onClick={() => approveMutation.mutate(company.id)}
                  disabled={approveMutation.isPending}
                >
                  {approveMutation.isPending && approveMutation.variables === company.id
                    ? 'Aprovando...'
                    : 'Aprovar'}
                </Button>
              )}
              <Link
                className="inline-flex h-9 w-full items-center justify-center rounded-md border border-input bg-background px-3 text-sm font-medium shadow-sm transition-colors hover:bg-accent"
                href={`/clientes/${company.id}`}
              >
                Ver detalhes
              </Link>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
