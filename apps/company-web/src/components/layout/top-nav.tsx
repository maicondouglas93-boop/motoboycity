'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { BarChart3, ClipboardList, FileText, Receipt } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Wordmark } from '@/components/brand/wordmark';
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
  { href: '/faturas', label: 'Faturas', icon: Receipt },
];

export function TopNav() {
  const pathname = usePathname();
  const router = useRouter();

  function handleLogout() {
    session.clearToken();
    router.replace('/login');
  }

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-asfalto text-white">
      {/* No celular a navegação cai para uma segunda linha inteira, em vez de
          espremer contra o botão e desaparecer. No desktop volta a ser inline. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2 lg:h-14 lg:flex-nowrap lg:gap-6 lg:px-6 lg:py-0">
        <Link href="/" className="shrink-0" aria-label="MOTOboyCity — início">
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
                className={`flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors ${
                  isActive
                    ? 'bg-white/10 font-medium text-white'
                    : 'text-white/60 hover:bg-white/5 hover:text-white'
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
        <Link
          href="/"
          className="inline-flex shrink-0 items-center rounded-md bg-colete px-3 py-2 text-sm font-semibold whitespace-nowrap text-asfalto transition-colors hover:brightness-95 focus-visible:ring-2 focus-visible:ring-colete focus-visible:ring-offset-2 focus-visible:ring-offset-asfalto focus-visible:outline-none sm:px-4"
        >
          Chamar<span className="hidden sm:inline">&nbsp;entregador</span>
        </Link>

        <DropdownMenu>
          <DropdownMenuTrigger className="ml-auto flex shrink-0 items-center gap-2 rounded-md text-sm text-white/70 lg:ml-0 transition-colors hover:text-white focus-visible:ring-2 focus-visible:ring-colete focus-visible:outline-none">
            <Avatar className="size-8">
              <AvatarFallback className="bg-white/10 text-xs text-white">E</AvatarFallback>
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
