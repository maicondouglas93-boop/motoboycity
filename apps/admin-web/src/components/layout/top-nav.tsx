'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import {
  DollarSign,
  Eye,
  EyeOff,
  FileText,
  LayoutDashboard,
  ListOrdered,
  Menu,
  Settings,
  Sparkles,
  Truck,
  Users,
  type LucideIcon,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useMoneyVisibility } from '@/lib/money';
import { Wordmark } from '@/components/brand/wordmark';
import { session } from '@/lib/session';

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

type NavGroup = {
  label: string;
  tone: string;
  items: readonly NavItem[];
};

const NAV_GROUPS: readonly NavGroup[] = [
  {
    label: 'Operação',
    tone: 'text-colete-escuro bg-colete/15',
    items: [
      { href: '/', label: 'Visão geral', icon: LayoutDashboard },
      { href: '/pedidos', label: 'Pedidos', icon: ListOrdered },
      { href: '/entregadores', label: 'Entregadores', icon: Truck },
    ],
  },
  {
    label: 'Comercial',
    tone: 'text-status-entregue bg-status-entregue/10',
    items: [
      { href: '/clientes', label: 'Clientes', icon: Users },
      { href: '/financeiro', label: 'Financeiro', icon: DollarSign },
    ],
  },
  {
    label: 'Análise',
    tone: 'text-status-pagamento bg-status-pagamento/10',
    items: [
      { href: '/relatorios', label: 'Relatórios', icon: FileText },
      { href: '/secretaria-virtual', label: 'Secretária IA', icon: Sparkles },
    ],
  },
  {
    label: 'Sistema',
    tone: 'text-primary bg-primary/10',
    items: [{ href: '/configuracoes', label: 'Configurações', icon: Settings }],
  },
];

const NAV_ITEMS = NAV_GROUPS.flatMap((group) => group.items);

function isNavItemActive(pathname: string, href: string): boolean {
  return href === '/' ? pathname === '/' : pathname.startsWith(href);
}

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
  const queryClient = useQueryClient();
  const { hidden: moneyHidden, toggle: toggleMoney } = useMoneyVisibility();
  const currentItem = NAV_ITEMS.find((item) => isNavItemActive(pathname, item.href));

  function handleLogout() {
    session.clearToken();
    queryClient.clear();
    router.replace('/login');
  }

  return (
    <header className="admin-topbar sticky top-0 z-40 border-b border-white/10 text-white">
      <div className="flex min-h-16 items-center gap-2 px-4 py-2.5 xl:h-16 xl:gap-6 xl:px-8 xl:py-0">
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

        <nav className="hidden min-w-0 flex-1 items-center justify-center gap-1 xl:flex">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const isActive = isNavItemActive(pathname, href);
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

        <DropdownMenu>
          <DropdownMenuTrigger className="ml-auto inline-flex h-10 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.06] px-3 text-sm font-semibold text-white transition-colors hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none xl:hidden">
            <Menu className="size-4 text-[#aee8e4]" aria-hidden="true" />
            <span className="hidden sm:inline">{currentItem?.label ?? 'Menu'}</span>
            <span className="sr-only sm:hidden">Abrir navegação</span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-[min(22rem,calc(100vw-2rem))] p-2">
            <div className="px-2 pt-1 pb-2">
              <p className="font-heading text-sm font-semibold text-admin-deep">Navegação</p>
              <p className="text-xs text-muted-foreground">Escolha uma área do painel.</p>
            </div>
            <DropdownMenuSeparator />
            {NAV_GROUPS.map((group, index) => (
              <DropdownMenuGroup key={group.label}>
                <DropdownMenuLabel className="px-2 pt-2 text-[11px] font-bold tracking-[0.12em] uppercase">
                  {group.label}
                </DropdownMenuLabel>
                {group.items.map(({ href, label, icon: Icon }) => {
                  const active = isNavItemActive(pathname, href);
                  return (
                    <DropdownMenuItem
                      key={href}
                      aria-current={active ? 'page' : undefined}
                      onClick={() => router.push(href)}
                      className={`gap-3 px-2.5 py-2.5 ${active ? 'bg-admin-soft font-semibold text-admin-deep' : ''}`}
                    >
                      <span
                        className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${group.tone}`}
                      >
                        <Icon className="size-4" aria-hidden="true" />
                      </span>
                      <span>{label}</span>
                      {active && (
                        <span
                          className="ml-auto size-2 rounded-full bg-primary"
                          aria-hidden="true"
                        />
                      )}
                    </DropdownMenuItem>
                  );
                })}
                {index < NAV_GROUPS.length - 1 && <DropdownMenuSeparator className="my-1.5" />}
              </DropdownMenuGroup>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Ao lado da conta e sempre visivel: quem precisa esconder valores
            costuma precisar disso NA HORA, com alguem ja olhando a tela. */}
        <button
          type="button"
          onClick={toggleMoney}
          aria-pressed={moneyHidden}
          title={moneyHidden ? 'Mostrar valores' : 'Ocultar valores'}
          className="flex shrink-0 items-center gap-2 rounded-xl border border-transparent px-2.5 py-2 text-sm text-white/60 transition-all hover:border-white/10 hover:bg-white/[0.06] hover:text-white focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
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
