'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { BarChart3, FileText, LineChart, Receipt, Wallet } from 'lucide-react';
import { FinanceTabs, type FinanceTab } from '@/components/finance/finance-tabs';
import { PainelTab } from '@/components/finance/painel-tab';
import { CarteirasTab } from '@/components/finance/carteiras-tab';
import { FaturasTab } from '@/components/finance/faturas-tab';
import { DemonstrativoTab } from '@/components/finance/demonstrativo-tab';
import { RecebimentosTab } from '@/components/finance/recebimentos-tab';
import { adminFinancialApi } from '@/lib/api-client';
import { session } from '@/lib/session';

/**
 * Área financeira: uma página, quatro abas.
 *
 * Antes eram quatro rotas sem ligação entre si — quem estava no caixa não
 * descobria as faturas, e o número na tela não levava a lugar nenhum. Agora
 * tudo que é dinheiro mora sob o mesmo teto, e cada cartão abre a lista que
 * explica o número.
 *
 * A aba ativa fica na URL, e não em estado local. Sem isso o admin não
 * consegue mandar o link da fila de saques para alguém, e o F5 devolve para o
 * começo.
 */
export default function FinancePage() {
  return (
    // `useSearchParams` exige limite de Suspense no App Router: sem ele a
    // rota inteira vira dinâmica e o build reclama.
    <Suspense fallback={<p className="text-sm text-muted-foreground">Carregando financeiro...</p>}>
      <FinanceArea />
    </Suspense>
  );
}

function FinanceArea() {
  const token = session.getToken();
  const searchParams = useSearchParams();
  const aba = searchParams.get('aba') ?? 'painel';

  /**
   * Só a contagem de saques parados alimenta o distintivo.
   *
   * É o único número da área com prazo: enquanto ele não zera, tem gente
   * esperando dinheiro. Contar faturas ou carteiras aqui transformaria o
   * distintivo em enfeite.
   */
  const saquesPendentesQuery = useQuery({
    queryKey: ['admin', 'financial', 'withdrawals', 'pending-count'],
    queryFn: () => adminFinancialApi.listWithdrawals(token as string, { status: 'PENDING' }),
    enabled: Boolean(token),
  });

  if (!token) {
    return (
      <p className="text-sm text-muted-foreground">
        Faça login como administrador para ver o financeiro.
      </p>
    );
  }

  const tabs: FinanceTab[] = [
    { value: 'painel', label: 'Painel', icon: BarChart3 },
    {
      value: 'carteiras',
      label: 'Carteiras',
      icon: Wallet,
      badge: saquesPendentesQuery.data?.length,
    },
    { value: 'faturas', label: 'Faturas', icon: FileText },
    { value: 'recebimentos', label: 'Recebimentos', icon: Receipt },
    { value: 'demonstrativo', label: 'Demonstrativo', icon: LineChart },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Financeiro</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Caixa, carteiras, faturas e recebimentos da operação.
        </p>
      </div>

      <FinanceTabs tabs={tabs} />

      {aba === 'painel' && <PainelTab token={token} />}
      {aba === 'carteiras' && <CarteirasTab token={token} />}
      {aba === 'faturas' && <FaturasTab token={token} />}
      {aba === 'recebimentos' && <RecebimentosTab token={token} />}
      {aba === 'demonstrativo' && <DemonstrativoTab token={token} />}
    </div>
  );
}

