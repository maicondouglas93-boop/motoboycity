'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BarChart3,
  ClipboardList,
  FileText,
  Headset,
  Plug,
  PlusCircle,
  Receipt,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { mockUser } from '@/lib/mock-data';

const NAV_ITEMS = [
  { href: '/', label: 'Lançar Pedidos', icon: PlusCircle },
  { href: '/indicadores', label: 'Indicadores', icon: BarChart3 },
  { href: '/pedidos', label: 'Pedidos', icon: ClipboardList },
  { href: '/relatorios', label: 'Relatórios', icon: FileText },
  { href: '/integracoes', label: 'Integrações', icon: Plug },
  { href: '/faturas', label: 'Faturas', icon: Receipt },
];

export function TopNav() {
  const pathname = usePathname();

  return (
    <header className="flex items-center justify-between border-b bg-background px-4 py-2">
      <nav className="flex items-center gap-1">
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
        <span className="flex flex-col items-center gap-1 px-3 py-1.5 text-xs text-muted-foreground">
          <Headset className="size-4" />
          Suporte
        </span>
      </nav>

      <DropdownMenu>
        <DropdownMenuTrigger className="flex items-center gap-2 text-sm">
          <Avatar className="size-7">
            <AvatarFallback>{mockUser.name.charAt(0)}</AvatarFallback>
          </Avatar>
          {mockUser.name}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem>Perfil</DropdownMenuItem>
          <DropdownMenuItem>Sair</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
