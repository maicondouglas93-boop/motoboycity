'use client';

import { use } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ApiError } from '@motoboycity/api-client';
import { ReceiptText } from 'lucide-react';
import { CompanyInvoiceHistory } from '@/components/companies/company-invoice-history';
import { AdminPageHeader } from '@/components/layout/admin-page-header';
import { QueryState } from '@/components/ui/query-state';
import { adminCompaniesApi } from '@/lib/api-client';
import { session } from '@/lib/session';

export default function ClientInvoicesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: companyId } = use(params);
  const token = session.getToken();
  const companyQuery = useQuery({
    queryKey: ['admin', 'company', companyId],
    queryFn: () => adminCompaniesApi.detail(token as string, companyId),
    enabled: Boolean(token),
  });

  return (
    <div className="space-y-6">
      <AdminPageHeader
        icon={ReceiptText}
        eyebrow="Financeiro do cliente"
        title="Histórico de faturas"
        description={
          companyQuery.data
            ? `${companyQuery.data.tradeName} · ${companyQuery.data.document}`
            : 'Consulte cobranças, pagamentos e detalhes de cada fatura.'
        }
        tone="finance"
        backHref={`/clientes/${companyId}`}
        backLabel="Voltar para o cliente"
      />
      {!token ? (
        <p className="text-sm text-muted-foreground">
          Faça login como administrador para consultar as faturas.
        </p>
      ) : companyQuery.isPending ? (
        <QueryState kind="loading" title="Carregando cliente" />
      ) : companyQuery.isError ? (
        <QueryState
          kind="error"
          title="Não foi possível carregar este cliente"
          description={
            companyQuery.error instanceof ApiError ? companyQuery.error.message : 'Tente novamente.'
          }
          onAction={() => void companyQuery.refetch()}
        />
      ) : (
        <CompanyInvoiceHistory key={companyId} companyId={companyId} token={token} />
      )}
    </div>
  );
}
