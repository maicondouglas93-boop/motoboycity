'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  DollarSign,
  Eye,
  EyeOff,
  FileText,
  LayoutDashboard,
  ListOrdered,
  Settings,
  Truck,
  Users,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useMoneyVisibility } from '@/lib/money';
import { Wordmark } from '@/components/brand/wordmark';
import { session } from '@/lib/session';

const NAV_ITEMS = [
  { href: '/', label: 'Visão geral', icon: LayoutDashboard },
  { href: '/clientes', label: 'Clientes', icon: Users },
  { href: '/entregadores', label: 'Entregadores', icon: Truck },
  { href: '/pedidos', label: 'Pedidos', icon: ListOrdered },
  { href: '/financeiro', label: 'Financeiro', icon: DollarSign },
  { href: '/relatorios', label: 'Relatórios', icon: FileText },
  { href: '/configuracoes', label: 'Configurações', icon: Settings },
];

/**
 * Sem botão de ação em âmbar aqui, ao contrário do painel da empresa: o admin
 * fiscaliza a operação, não põe motoboy na rua. A cor continua significando
 * movimento, e aqui ela só aparece nos status.
 *
 * A etiqueta "Admin" ao lado da marca existe porque os dois painéis passaram a
 * dividir o mesmo wordmark — quem estiver com as duas abas abertas precisa
 * saber em qual está antes de clicar em algo.
 */
export function TopNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { hidden: moneyHidden, toggle: toggleMoney } = useMoneyVisibility();

  function handleLogout() {
    session.clearToken();
    router.replace('/login');
  }

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-asfalto text-white">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2 xl:h-14 xl:flex-nowrap xl:gap-6 xl:px-6 xl:py-0">
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2"
          aria-label="MOTOboyCity — Administração"
        >
          <Wordmark />
          <span className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[10px] tracking-widest text-white/70 uppercase">
            Admin
          </span>
        </Link>

        <nav className="order-last flex w-full items-center gap-1 overflow-x-auto pb-1 xl:order-none xl:w-auto xl:min-w-0 xl:flex-1 xl:pb-0">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const isActive = href === '/' ? pathname === '/' : pathname.startsWith(href);
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

        {/* Ao lado da conta e sempre visivel: quem precisa esconder valores
            costuma precisar disso NA HORA, com alguem ja olhando a tela. */}
        <button
          type="button"
          onClick={toggleMoney}
          aria-pressed={moneyHidden}
          title={moneyHidden ? 'Mostrar valores' : 'Ocultar valores'}
          className="ml-auto flex shrink-0 items-center gap-2 rounded-md px-2 py-2 text-sm text-white/60 transition-colors hover:bg-white/5 hover:text-white focus-visible:ring-2 focus-visible:ring-colete focus-visible:outline-none xl:ml-0"
        >
          {moneyHidden ? (
            <EyeOff className="size-4" aria-hidden="true" />
          ) : (
            <Eye className="size-4" aria-hidden="true" />
          )}
          <span className="sr-only">
            {moneyHidden ? 'Mostrar valores em dinheiro' : 'Ocultar valores em dinheiro'}
          </span>
        </button>

        <DropdownMenu>
          <DropdownMenuTrigger className="flex shrink-0 items-center gap-2 rounded-md text-sm text-white/70 transition-colors hover:text-white focus-visible:ring-2 focus-visible:ring-colete focus-visible:outline-none xl:ml-0">
            <Avatar className="size-8">
              <AvatarFallback className="bg-white/10 text-xs text-white">A</AvatarFallback>
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
