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
  Sparkles,
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
  { href: '/secretaria-virtual', label: 'Secretária IA', icon: Sparkles },
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
    <header className="admin-topbar sticky top-0 z-40 border-b border-white/10 text-white">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 xl:h-16 xl:flex-nowrap xl:gap-6 xl:px-8 xl:py-0">
        <Link
          href="/"
          className="group flex shrink-0 items-center gap-2 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-primary"
          aria-label="MOTOboyCity — Administração"
        >
          <Wordmark />
          <span className="rounded-md border border-primary/25 bg-primary/15 px-1.5 py-0.5 font-mono text-[10px] tracking-widest text-[#9ce2de] uppercase shadow-inner">
            Admin
          </span>
        </Link>

        <nav className="order-last flex w-full items-center gap-1 overflow-x-auto pb-1 xl:order-none xl:w-auto xl:min-w-0 xl:flex-1 xl:justify-center xl:pb-0">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const isActive = href === '/' ? pathname === '/' : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={isActive ? 'page' : undefined}
                className={`flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-sm transition-all ${
                  isActive
                    ? 'bg-white/12 font-semibold text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08),0_8px_20px_-14px_rgba(53,184,178,0.8)]'
                    : 'text-white/62 hover:bg-white/[0.06] hover:text-white'
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
          className="ml-auto flex shrink-0 items-center gap-2 rounded-xl border border-transparent px-2.5 py-2 text-sm text-white/60 transition-all hover:border-white/10 hover:bg-white/[0.06] hover:text-white focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none xl:ml-0"
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
          <DropdownMenuTrigger className="flex shrink-0 items-center gap-2 rounded-full text-sm text-white/70 transition-all hover:text-white focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-asfalto focus-visible:outline-none xl:ml-0">
            <Avatar className="size-9 border border-white/15 shadow-[0_0_0_3px_rgba(53,184,178,0.08)]">
              <AvatarFallback className="bg-primary/20 text-xs font-semibold text-[#aee8e4]">
                A
              </AvatarFallback>
            </Avatar>
            <span className="sr-only">Abrir menu da conta</span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={handleLogout}>Sair</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
