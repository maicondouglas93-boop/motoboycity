'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import type { LucideIcon } from 'lucide-react';

export type FinanceTab = {
  value: string;
  label: string;
  icon: LucideIcon;
  /**
   * Número mostrado ao lado do rótulo.
   *
   * Só para o que espera decisão de alguém — saque parado, por exemplo. Contar
   * tudo transformaria o distintivo em enfeite, e ele deixaria de puxar o olho
   * para onde há trabalho.
   *
   * `0` não aparece: distintivo zerado é ruído.
   */
  badge?: number;
};

/**
 * Abas da área financeira, com a aba ATIVA NA URL.
 *
 * Estado local seria mais simples e quebraria duas coisas que o admin faz todo
 * dia: mandar o link da fila de saques para alguém, e apertar F5 sem voltar
 * para o começo.
 *
 * Por serem `Link`, funcionam com o meio do mouse, com "abrir em nova aba" e
 * com o botão de voltar do navegador — de graça, sem código.
 */
export function FinanceTabs({
  tabs,
  paramName = 'aba',
}: {
  tabs: ReadonlyArray<FinanceTab>;
  paramName?: string;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const atual = searchParams.get(paramName) ?? tabs[0]?.value;

  return (
    <nav
      aria-label="Seções do financeiro"
      className="flex flex-wrap gap-1 border-b border-border pb-px"
    >
      {tabs.map((tab) => {
        const ativa = tab.value === atual;
        const parametros = new URLSearchParams(searchParams.toString());
        parametros.set(paramName, tab.value);

        return (
          <Link
            key={tab.value}
            href={`${pathname}?${parametros.toString()}`}
            aria-current={ativa ? 'page' : undefined}
            className={[
              'flex items-center gap-2 rounded-t-lg px-4 py-2.5 text-sm transition',
              'outline-none focus-visible:ring-2 focus-visible:ring-ring',
              ativa
                ? 'border border-b-transparent border-border bg-card font-semibold text-admin-deep'
                : 'border border-transparent text-muted-foreground hover:text-foreground',
            ].join(' ')}
          >
            <tab.icon aria-hidden className="size-4" />
            {tab.label}
            {tab.badge !== undefined && tab.badge > 0 && (
              <span
                className="rounded-full bg-dinheiro-atrasado px-2 py-0.5 text-xs font-semibold text-white tabular-nums"
                aria-label={`${tab.badge} aguardando`}
              >
                {tab.badge}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
