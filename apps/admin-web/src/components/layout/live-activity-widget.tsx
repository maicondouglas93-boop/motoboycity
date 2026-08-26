'use client';

import { useEffect, useMemo, useState } from 'react';
import { Activity, ChevronDown } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { formatRelativeTime } from '@/lib/format';
import { isDriverPresenceActivity, useAdminActivityFeed } from '@/lib/use-admin-activity-feed';

/**
 * Painel flutuante de atividade.
 *
 * Recolhido ele e um BOTAO, nao uma barra.
 *
 * Ja tinha virado recolhivel uma vez, mas fechado continuava ocupando 320px de
 * largura no canto — e seguia cobrindo o que fica no rodape das telas: a
 * paginacao da lista de pedidos, o botao de salvar das configuracoes. Fechar
 * escondia o conteudo e mantinha o estorvo.
 *
 * Aberto ele cobre mesmo, e tudo bem: quem abriu escolheu olhar.
 *
 * O ponto de conexão usa a cor de conclusão da paleta, não um verde avulso, e
 * o âmbar continua reservado para movimento.
 */
export function LiveActivityWidget() {
  const { events, connected } = useAdminActivityFeed();
  const [open, setOpen] = useState(false);
  const [showPresence, setShowPresence] = useState(false);
  const visibleEvents = useMemo(
    () => (showPresence ? events : events.filter((event) => !isDriverPresenceActivity(event))),
    [events, showPresence],
  );

  // Força um re-render periódico só pra manter "há Xs"/"há X min" atualizado
  // sem precisar de nenhum novo evento chegando.
  const [, forceTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => forceTick((tick) => tick + 1), 15_000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className={cn('fixed right-4 bottom-4 z-30', open ? 'w-72 sm:w-80' : 'w-auto')}>
      <Card
        className={cn(
          'relative gap-0 overflow-hidden border-primary/20 py-0 shadow-[0_18px_44px_-20px_rgba(10,53,64,0.7)]',
          open ? 'ml-auto' : 'w-11 rounded-full border-primary/15',
        )}
      >
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-label="Atividade ao vivo"
          title={open ? 'Recolher atividade ao vivo' : 'Abrir atividade ao vivo'}
          className={cn(
            'flex items-center gap-2 bg-[linear-gradient(110deg,#0a3540,#0f6b70)] text-left text-white transition-[filter,box-shadow] hover:brightness-110 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset focus-visible:outline-none',
            open ? 'w-full px-3 py-2.5' : 'size-11 justify-center p-0',
          )}
        >
          <Activity className="size-4 shrink-0 text-[#8ed9d4]" aria-hidden="true" />
          {/*
            Fechado, so o icone e o ponto de conexao. O rotulo vive no `title`,
            e o `aria-label` mantem o botao anunciavel por leitor de tela.
          */}
          {open ? (
            <>
              <span className="text-sm font-medium">Atividade ao vivo</span>
              <span
                className={cn(
                  'ml-auto size-2 shrink-0 rounded-full',
                  connected ? 'bg-status-entregue' : 'bg-white/30',
                )}
                title={connected ? 'Conectado' : 'Desconectado'}
              />
              <ChevronDown
                className="size-4 shrink-0 rotate-180 text-white/70 transition-transform"
                aria-hidden="true"
              />
            </>
          ) : (
            <span
              className={cn(
                'absolute top-1.5 right-1.5 size-2 rounded-full ring-2 ring-[#0a3540]',
                connected ? 'bg-status-entregue' : 'bg-white/30',
              )}
              aria-hidden="true"
            />
          )}
        </button>

        {open && (
          <CardContent className="max-h-56 space-y-2 overflow-y-auto p-3 text-xs">
            <div className="grid grid-cols-2 rounded-lg bg-muted/65 p-1 text-[10px]">
              <button
                type="button"
                aria-pressed={!showPresence}
                onClick={() => setShowPresence(false)}
                className={cn(
                  'rounded-md px-2 py-1.5 font-medium transition-colors',
                  !showPresence
                    ? 'bg-card text-admin-deep shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                Operação
              </button>
              <button
                type="button"
                aria-pressed={showPresence}
                onClick={() => setShowPresence(true)}
                className={cn(
                  'rounded-md px-2 py-1.5 font-medium transition-colors',
                  showPresence
                    ? 'bg-card text-admin-deep shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                Tudo
              </button>
            </div>
            {visibleEvents.length === 0 ? (
              <p className="text-muted-foreground">Nenhuma atividade nesta categoria.</p>
            ) : (
              visibleEvents.map((event) => (
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
