'use client';

import { useEffect, useState } from 'react';
import { Activity } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { formatRelativeTime } from '@/lib/format';
import { useAdminActivityFeed } from '@/lib/use-admin-activity-feed';

export function LiveActivityWidget() {
  const { events, connected } = useAdminActivityFeed();
  // Força um re-render periódico só pra manter "há Xs"/"há X min" atualizado
  // sem precisar de nenhum novo evento chegando.
  const [, forceTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => forceTick((tick) => tick + 1), 15_000);
    return () => clearInterval(interval);
  }, []);

  return (
    <Card className="fixed right-4 bottom-4 w-80 shadow-lg">
      <CardHeader className="flex-row items-center gap-2 py-3">
        <Activity className="size-4 text-muted-foreground" />
        <CardTitle className="text-sm font-medium">Atividade ao Vivo</CardTitle>
        <span
          className={cn(
            'ml-auto size-2 rounded-full',
            connected ? 'bg-green-500' : 'bg-muted-foreground/40',
          )}
          title={connected ? 'Conectado' : 'Desconectado'}
        />
      </CardHeader>
      <CardContent className="max-h-48 space-y-2 overflow-y-auto pt-0 text-xs">
        {events.length === 0 ? (
          <p className="text-muted-foreground">Nenhuma atividade ainda.</p>
        ) : (
          events.map((event) => (
            <div
              key={event.id}
              className="flex items-start justify-between gap-2 border-t pt-2 first:border-t-0 first:pt-0"
            >
              <span>{event.message}</span>
              <span className="shrink-0 text-muted-foreground">
                {formatRelativeTime(event.at)}
              </span>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
