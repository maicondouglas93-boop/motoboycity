'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { BarChart3, ClipboardList, FileText, Wallet } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Wordmark } from '@/components/brand/wordmark';
import { CallDriverDialog } from '@/components/operations/call-driver-dialog';
import { session } from '@/lib/session';

/**
 * "Chamar entregador" saiu daqui de propósito: é a ação principal do produto,
 * não um destino de navegação como os outros. Ela vira botão à direita, em
 * âmbar — a mesma cor que, na lista, significa entrega em movimento.
 */
const NAV_ITEMS = [
  { href: '/pedidos', label: 'Pedidos', icon: ClipboardList },
  { href: '/indicadores', label: 'Indicadores', icon: BarChart3 },
  { href: '/relatorios', label: 'Relatórios', icon: FileText },
  { href: '/financeiro', label: 'Financeiro', icon: Wallet },
];

export function TopNav() {
  const pathname = usePathname();
  const router = useRouter();

  function handleLogout() {
    session.clearToken();
    router.replace('/login');
  }

  return (
    <header className="company-topbar sticky top-0 z-40 border-b border-white/10 text-white">
      {/* No celular a navegação cai para uma segunda linha inteira, em vez de
          espremer contra o botão e desaparecer. No desktop volta a ser inline. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2 lg:h-16 lg:flex-nowrap lg:gap-6 lg:px-7 lg:py-0">
        <Link
          href="/"
          className="shrink-0 rounded-lg focus-visible:ring-2 focus-visible:ring-colete focus-visible:outline-none"
          aria-label="MOTOboyCity — início"
        >
          <Wordmark />
        </Link>

        <nav className="order-last flex w-full items-center gap-1 overflow-x-auto pb-1 lg:order-none lg:w-auto lg:min-w-0 lg:flex-1 lg:pb-0">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const isActive = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link
                key={href}
                href={href}
                aria-current={isActive ? 'page' : undefined}
                className={`flex shrink-0 items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-all ${
                  isActive
                    ? 'border-white/12 bg-white/12 font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]'
                    : 'border-transparent text-white/62 hover:border-white/8 hover:bg-white/[0.07] hover:text-white'
                }`}
              >
                <Icon className="size-4" aria-hidden="true" />
                {label}
              </Link>
            );
          })}
        </nav>

        {/* Nunca escondido: é a ação principal do produto. No celular só o
            rótulo encolhe — some daqui e o lojista não consegue pedir motoboy. */}
        {/*
          Abre o caminho curto — coleta salva, destino por GPS — em vez de
          navegar para o formulario completo. Quem ja sabe o endereco continua
          usando "Novo pedido" na central.
        */}
        <CallDriverDialog>
          <button
            type="button"
            className="inline-flex shrink-0 items-center rounded-xl border border-white/15 bg-colete px-3 py-2 text-sm font-bold whitespace-nowrap text-asfalto shadow-[0_10px_26px_-12px_rgba(253,160,46,0.95),inset_0_1px_0_rgba(255,255,255,0.45)] transition-all hover:-translate-y-0.5 hover:bg-[#ffad45] hover:shadow-[0_14px_30px_-12px_rgba(253,160,46,0.95)] focus-visible:ring-2 focus-visible:ring-colete focus-visible:ring-offset-2 focus-visible:ring-offset-asfalto focus-visible:outline-none sm:px-4"
          >
            Chamar<span className="hidden sm:inline">&nbsp;entregador</span>
          </button>
        </CallDriverDialog>

        <DropdownMenu>
          <DropdownMenuTrigger className="ml-auto flex shrink-0 items-center gap-2 rounded-full text-sm text-white/70 transition-colors hover:text-white focus-visible:ring-2 focus-visible:ring-colete focus-visible:outline-none lg:ml-0">
            <Avatar className="size-9 shadow-[0_6px_18px_-8px_rgba(0,0,0,0.8)] ring-1 ring-white/25">
              <AvatarFallback className="bg-gradient-to-br from-white/18 to-white/7 text-xs font-bold text-white">
                E
              </AvatarFallback>
            </Avatar>
            <span className="sr-only">Abrir menu da conta</span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={handleLogout}>Sair</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
