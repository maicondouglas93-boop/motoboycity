'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Package, Settings, ShoppingCart, Store } from 'lucide-react';

/**
 * A Loja é uma ÁREA dentro do painel que a empresa já usa, e não um painel
 * novo ao lado. O cabeçalho de sempre continua no topo; a barra lateral aqui
 * só navega entre as telas da loja.
 *
 * Dashboard e Relatórios do desenho original ficaram de fora: repetiriam o que
 * o painel já tem. Configurações entrou porque não repete nada — ela guarda o
 * que só existe na loja online: o link, a identidade visual, as formas de
 * pagamento, o recebimento e o tempo de preparo.
 */
const ITENS = [
  { href: '/loja/vendas', label: 'Vendas', icon: ShoppingCart },
  { href: '/loja/produtos', label: 'Produtos', icon: Package },
  { href: '/loja/configuracoes', label: 'Configurações', icon: Settings },
];

export default function LojaLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="grid gap-5 lg:grid-cols-[220px_minmax(0,1fr)]">
      <aside className="lg:sticky lg:top-6 lg:self-start">
        <div className="mb-3 flex items-center gap-2 px-2">
          <Store className="size-4 text-muted-foreground" aria-hidden="true" />
          <span className="text-sm font-semibold">Minha loja</span>
        </div>

        <nav aria-label="Seções da loja" className="flex gap-2 lg:flex-col">
          {ITENS.map(({ href, label, icon: Icon }) => {
            const ativo = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link
                key={href}
                href={href}
                aria-current={ativo ? 'page' : undefined}
                className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
                  ativo
                    ? 'bg-primary/10 font-semibold text-primary'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                <Icon className="size-4 shrink-0" aria-hidden="true" />
                {label}
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className="min-w-0">{children}</div>
    </div>
  );
}
