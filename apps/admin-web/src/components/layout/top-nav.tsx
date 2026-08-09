'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  DollarSign,
  FileText,
  LayoutDashboard,
  ListOrdered,
  MoreHorizontal,
  PlusCircle,
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
import { mockAdminUser } from '@/lib/mock-data';

const NAV_ITEMS = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/iago', label: 'IAGo', icon: Sparkles },
  { href: '/clientes', label: 'Clientes', icon: Users },
  { href: '/entregadores', label: 'Entregadores', icon: Truck },
  { href: '/pedidos', label: 'Pedidos', icon: ListOrdered },
  { href: '/financeiro', label: 'Financeiro', icon: DollarSign },
  { href: '/relatorios', label: 'Relatórios', icon: FileText },
  { href: '/configuracoes', label: 'Configurações', icon: Settings },
];

export function TopNav() {
  const pathname = usePathname();

  return (
    <header className="flex items-center justify-between border-b bg-background px-4 py-2">
      <nav className="flex flex-wrap items-center gap-1">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const isActive = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={`flex flex-col items-center gap-1 rounded-md px-3 py-1.5 text-xs transition-colors ${
                isActive
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
              }`}
            >
              <Icon className="size-4" />
              {label}
            </Link>
          );
        })}

        <DropdownMenu>
          <DropdownMenuTrigger className="flex flex-col items-center gap-1 rounded-md px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground">
            <MoreHorizontal className="size-4" />
            Ver mais
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem disabled>Sem itens adicionais definidos</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Link
          href="/lancar-pedido"
          className="flex flex-col items-center gap-1 rounded-md px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground"
        >
          <PlusCircle className="size-4" />
          Lançar Pedido
        </Link>
      </nav>

      <DropdownMenu>
        <DropdownMenuTrigger className="flex items-center gap-2 text-sm">
          <Avatar className="size-7">
            <AvatarFallback>{mockAdminUser.name.charAt(0)}</AvatarFallback>
          </Avatar>
          {mockAdminUser.name}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem>Perfil</DropdownMenuItem>
          <DropdownMenuItem>Sair</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
