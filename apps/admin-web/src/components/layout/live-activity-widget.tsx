import { Activity } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { mockLiveActivity } from '@/lib/mock-data';

/**
 * Widget flutuante de atividade ao vivo — no produto real é uma projeção em
 * tempo real de DeliveryStatusHistory/DeliveryOffer via Socket.IO (ver
 * docs/architecture/phase-2a-domain-model.md, seção 12). Aqui é só estrutura
 * visual com dados fictícios; nenhuma conexão realtime foi implementada.
 */
export function LiveActivityWidget() {
  return (
    <Card className="fixed right-4 bottom-4 w-80 shadow-lg">
      <CardHeader className="flex-row items-center gap-2 py-3">
        <Activity className="size-4 text-muted-foreground" />
        <CardTitle className="text-sm font-medium">Atividade ao Vivo</CardTitle>
      </CardHeader>
      <CardContent className="max-h-48 space-y-2 overflow-y-auto pt-0 text-xs">
        {mockLiveActivity.map((item, index) => (
          <div
            key={index}
            className="flex items-start justify-between gap-2 border-t pt-2 first:border-t-0 first:pt-0"
          >
            <span>{item.message}</span>
            <span className="shrink-0 text-muted-foreground">{item.time}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
