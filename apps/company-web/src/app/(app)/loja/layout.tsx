'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bell, Clock, Package, Settings, ShoppingBag, ShoppingCart, Store } from 'lucide-react';
import { ControleDoStatus } from '@/components/loja/controle-do-status';

/**
 * A Loja é uma ÁREA dentro do painel que a empresa já usa, e não um painel
 * novo ao lado. O cabeçalho de sempre continua no topo; a barra lateral aqui
 * só navega entre as telas da loja.
 *
 * Dashboard e Relatórios do desenho original ficaram de fora: repetiriam o que
 * o painel já tem. Horários, Tipos de pedido e Notificações têm tela própria
 * porque são o que a loja mexe na operação; Configurações guarda o resto — o
 * link, a aparência, o pagamento e a área de entrega.
 *
 * O status da loja fica no alto da barra, em todas as telas: pausar numa noite
 * ruim não pode depender de achar a tela certa primeiro.
 */
const ITENS = [
  { href: '/loja/vendas', label: 'Vendas', icon: ShoppingCart },
  { href: '/loja/produtos', label: 'Produtos', icon: Package },
  { href: '/loja/horarios', label: 'Horários', icon: Clock },
  { href: '/loja/tipos-de-pedido', label: 'Tipos de pedido', icon: ShoppingBag },
  { href: '/loja/notificacoes', label: 'Notificações', icon: Bell },
  { href: '/loja/configuracoes', label: 'Configurações', icon: Settings },
];

export default function LojaLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="grid gap-5 lg:grid-cols-[220px_minmax(0,1fr)]">
      {/* `min-w-0`: sem ele, a fileira do menu no celular alarga a coluna em
          vez de rolar dentro de si, e a página inteira passa a rolar de lado. */}
      <aside className="min-w-0 space-y-3 lg:sticky lg:top-6 lg:self-start">
        <div className="flex items-center gap-2 px-2">
          <Store className="size-4 text-muted-foreground" aria-hidden="true" />
          <span className="text-sm font-semibold">Minha loja</span>
        </div>

        <ControleDoStatus />

        {/* No celular a barra vira uma fileira que rola de lado: seis telas
            não cabem numa linha, e quebrar em duas empurraria o conteúdo. */}
        <nav
          aria-label="Seções da loja"
          className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0 lg:pb-0"
        >
          {ITENS.map(({ href, label, icon: Icon }) => {
            const ativo = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link
                key={href}
                href={href}
                aria-current={ativo ? 'page' : undefined}
                className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm whitespace-nowrap transition-colors ${
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
