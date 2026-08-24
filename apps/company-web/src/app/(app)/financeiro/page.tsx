'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { LayoutDashboard, PackageOpen, Receipt } from 'lucide-react';
import { FinanceTabs, type FinanceTab } from '@/components/finance/finance-tabs';
import { FaturasTab } from '@/components/finance/faturas-tab';
import { PedidosTab } from '@/components/finance/pedidos-tab';
import { ResumoTab } from '@/components/finance/resumo-tab';
import { session } from '@/lib/session';

const TABS: ReadonlyArray<FinanceTab> = [
  { value: 'resumo', label: 'Resumo', icon: LayoutDashboard },
  { value: 'faturas', label: 'Faturas', icon: Receipt },
  { value: 'pedidos', label: 'Pedidos sem fatura', icon: PackageOpen },
];

/**
 * Financeiro da loja: uma pagina, tres abas.
 *
 * Antes existia so `/faturas`, que respondia "quais faturas eu tenho". A
 * pergunta que a loja realmente faz e "quanto eu devo hoje, e o que vem na
 * proxima" — e essa nao tinha onde ser respondida.
 */
export default function CompanyFinancePage() {
  return (
    // `useSearchParams` exige limite de Suspense no App Router: sem ele a
    // pagina inteira vira renderizacao dinamica no cliente.
    <Suspense
      fallback={<p className="text-sm text-muted-foreground">Carregando financeiro...</p>}
    >
      <ConteudoFinanceiro />
    </Suspense>
  );
}

function ConteudoFinanceiro() {
  const searchParams = useSearchParams();
  const aba = searchParams.get('aba') ?? 'resumo';
  const token = session.getToken();

  if (!token) {
    return (
      <p className="text-sm text-muted-foreground">
        Faça login para consultar o financeiro da empresa.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold">Financeiro</h1>
        <p className="text-sm text-muted-foreground">
          Sua posição com a plataforma, faturas e o que entra no próximo fechamento.
        </p>
      </div>

      <FinanceTabs tabs={TABS} />

      {aba === 'resumo' && <ResumoTab token={token} />}
      {aba === 'faturas' && <FaturasTab token={token} />}
      {aba === 'pedidos' && <PedidosTab token={token} />}
    </div>
  );
}
