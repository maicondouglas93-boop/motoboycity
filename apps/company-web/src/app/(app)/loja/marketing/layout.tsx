'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * Marketing da loja: o que faz o cliente comprar mais. Uma aba por ferramenta,
 * e só existem as que já funcionam — a aba de uma ferramenta que ainda não
 * existe seria um clique que não leva a lugar nenhum.
 */
const ABAS = [
  { href: '/loja/marketing', label: 'Visão geral', exata: true },
  { href: '/loja/marketing/promocoes', label: 'Promoções', exata: false },
];

export default function MarketingLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="space-y-5">
      <nav aria-label="Ferramentas de marketing" className="flex gap-1 border-b">
        {ABAS.map(({ href, label, exata }) => {
          const ativa = exata ? pathname === href : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={ativa ? 'page' : undefined}
              className={`-mb-px border-b-2 px-3 py-2 text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:py-3 ${
                ativa
                  ? 'border-primary font-semibold text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {label}
            </Link>
          );
        })}
      </nav>
      {children}
    </div>
  );
}
