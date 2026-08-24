'use client';

import { useEffect, useState } from 'react';
import { Activity, ChevronDown } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { formatRelativeTime } from '@/lib/format';
import { useAdminActivityFeed } from '@/lib/use-admin-activity-feed';

/**
 * Painel flutuante de atividade.
 *
 * Agora recolhe: antes era `fixed` e permanente, cobrindo o canto inferior
 * direito de todas as telas sem nenhuma forma de sair do caminho — atrapalhava
 * justamente as tabelas e listas, que crescem para a direita.
 *
 * O ponto de conexão usa a cor de conclusão da paleta, não um verde avulso, e
 * o âmbar continua reservado para movimento.
 */
export function LiveActivityWidget() {
  const { events, connected } = useAdminActivityFeed();
  const [open, setOpen] = useState(false);

  // Força um re-render periódico só pra manter "há Xs"/"há X min" atualizado
  // sem precisar de nenhum novo evento chegando.
  const [, forceTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => forceTick((tick) => tick + 1), 15_000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="fixed right-4 bottom-4 z-30 w-72 sm:w-80">
      <Card
        className={cn(
          'gap-0 overflow-hidden border-primary/20 py-0 shadow-[0_18px_44px_-20px_rgba(10,53,64,0.7)]',
          !open && 'border-primary/15',
        )}
      >
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          className="flex w-full items-center gap-2 bg-[linear-gradient(110deg,#0a3540,#0f6b70)] px-3 py-2.5 text-left text-white transition-[filter,box-shadow] hover:brightness-110 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset focus-visible:outline-none"
        >
          <Activity className="size-4 text-[#8ed9d4]" aria-hidden="true" />
          <span className="text-sm font-medium">Atividade ao vivo</span>
          <span
            className={cn(
              'ml-auto size-2 shrink-0 rounded-full',
              connected ? 'bg-status-entregue' : 'bg-white/30',
            )}
            title={connected ? 'Conectado' : 'Desconectado'}
          />
          <ChevronDown
            className={cn(
              'size-4 shrink-0 text-white/70 transition-transform',
              open && 'rotate-180',
            )}
            aria-hidden="true"
          />
        </button>

        {open && (
          <CardContent className="max-h-56 space-y-2 overflow-y-auto p-3 text-xs">
            {events.length === 0 ? (
              <p className="text-muted-foreground">Nenhuma atividade ainda.</p>
            ) : (
              events.map((event) => (
                <div
                  key={event.id}
                  className="flex items-start justify-between gap-2 border-t pt-2 first:border-t-0 first:pt-0"
                >
                  <span className="min-w-0 break-words">{event.message}</span>
                  <span className="shrink-0 text-muted-foreground">
                    {formatRelativeTime(event.at)}
                  </span>
                </div>
              ))
            )}
          </CardContent>
        )}
      </Card>
    </div>
  );
}
