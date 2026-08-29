'use client';

import Link from 'next/link';
import { Bell } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import type { NotificationItem, NotificationsResult } from '@motoboycity/types';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

/**
 * Um minuto: o sino existe para a pessoa nao precisar procurar o problema, mas
 * nenhum destes avisos muda de segundo em segundo. Nada aqui e tempo real.
 */
const INTERVALO_DE_ATUALIZACAO_MS = 60_000;

const ESTILO_POR_SEVERIDADE: Record<NotificationItem['severity'], string> = {
  critical: 'border-l-destructive bg-destructive/5',
  warning: 'border-l-amber-500 bg-amber-500/5',
  info: 'border-l-border bg-muted/40',
};

export function NotificationBell({
  token,
  fetchNotifications,
}: {
  token: string | null;
  fetchNotifications: (accessToken: string) => Promise<NotificationsResult>;
}) {
  const { data } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => fetchNotifications(token as string),
    enabled: Boolean(token),
    refetchInterval: INTERVALO_DE_ATUALIZACAO_MS,
    /** Falha do sino nao pode virar tela de erro: ele e acessorio. */
    retry: false,
  });

  const items = data?.items ?? [];
  const criticos = data?.criticalCount ?? 0;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="relative inline-flex size-9 shrink-0 items-center justify-center rounded-lg border border-white/12 text-white/70 transition-colors hover:bg-white/[0.07] hover:text-white focus-visible:ring-2 focus-visible:ring-colete focus-visible:outline-none"
        aria-label={
          items.length === 0
            ? 'Avisos: nada pendente'
            : `Avisos: ${items.length} pendente(s)${criticos > 0 ? `, ${criticos} crítico(s)` : ''}`
        }
      >
        <Bell className="size-4" aria-hidden="true" />
        {items.length > 0 && (
          /*
            O numero e a contagem TOTAL; a cor e que separa critico de aviso.
            Mostrar so os criticos esconderia o resto, e mostrar dois numeros
            transformaria um sino em painel.
          */
          <span
            className={`absolute -top-1 -right-1 inline-flex min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold text-white ${
              criticos > 0 ? 'bg-destructive' : 'bg-amber-500'
            }`}
          >
            {items.length > 9 ? '9+' : items.length}
          </span>
        )}
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-80 max-w-[calc(100vw-2rem)]">
        {/*
          Cabecalho simples em vez de `DropdownMenuLabel`: no Base UI o rotulo
          exige contexto de grupo, e aqui a lista nao e um grupo de itens de
          menu — sao cartoes com acao propria.
        */}
        <p className="px-2 pt-1 pb-2 font-heading text-sm font-semibold">Avisos</p>
        <DropdownMenuSeparator />
        {items.length === 0 ? (
          <p className="px-2 py-6 text-center text-sm text-muted-foreground">
            Nada pendente por aqui.
          </p>
        ) : (
          <ul className="max-h-96 space-y-1 overflow-y-auto py-1">
            {items.map((item) => (
              <li
                key={item.id}
                className={`border-l-2 px-3 py-2 ${ESTILO_POR_SEVERIDADE[item.severity]}`}
              >
                <p className="text-sm font-semibold text-foreground">{item.title}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{item.description}</p>
                {item.href && (
                  <Link
                    href={item.href}
                    className="mt-1.5 inline-flex text-xs font-semibold text-portal hover:underline"
                  >
                    {item.actionLabel ?? 'Abrir'}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
