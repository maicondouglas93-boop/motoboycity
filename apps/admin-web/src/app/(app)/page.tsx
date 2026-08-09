import { MapPin, RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { OrderCard } from '@/components/order-card';
import {
  mockDriverQueue,
  mockInvoiceWarning,
  mockOnlineDrivers,
  mockOrdersByStage,
  mockRecentlyCompleted,
} from '@/lib/mock-data';

const SECTIONS: { key: keyof typeof mockOrdersByStage; label: string }[] = [
  { key: 'tocando', label: 'Pedidos Tocando' },
  { key: 'aceitos', label: 'Pedidos Aceitos' },
  { key: 'coletados', label: 'Pedidos Coletados' },
  { key: 'retorno', label: 'Retorno ao Local de Coleta' },
];

export default function AdminDashboardPage() {
  return (
    <div className="space-y-4">
      <Card className="border-amber-300 bg-amber-50 dark:bg-amber-950/20">
        <CardContent className="py-3 text-sm">
          Sua fatura vence em {mockInvoiceWarning.daysUntilDue} dias — programe-se: o vencimento é
          em {mockInvoiceWarning.dueDate}.
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[380px_1fr]">
        <div className="space-y-3">
          {SECTIONS.map((section) => {
            const orders = mockOrdersByStage[section.key] ?? [];
            return (
              <Card key={section.key}>
                <CardHeader className="flex-row items-center justify-between py-3">
                  <CardTitle className="text-sm font-medium">
                    {section.label} <Badge variant="secondary">{orders.length}</Badge>
                  </CardTitle>
                </CardHeader>
                {orders.length > 0 && (
                  <CardContent className="space-y-2 pt-0">
                    {orders.map((order) => (
                      <OrderCard key={order.id} order={order} />
                    ))}
                  </CardContent>
                )}
              </Card>
            );
          })}

          <Card>
            <CardHeader className="flex-row items-center justify-between py-3">
              <CardTitle className="text-sm font-medium">
                Concluídos Recentemente{' '}
                <Badge variant="secondary">{mockRecentlyCompleted.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 pt-0">
              {mockRecentlyCompleted.map((order) => (
                <OrderCard key={order.id} order={order} />
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm font-medium">Filas de Entregadores</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 pt-0">
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>Geral — {mockDriverQueue.length} entregadores na fila</span>
                <RefreshCw className="size-4" />
              </div>
              {mockDriverQueue.map((entry) => (
                <div key={entry.position} className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">{entry.position}</span>
                  {entry.name}
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between py-3">
              <CardTitle className="text-sm font-medium">
                Entregadores Online <Badge variant="secondary">{mockOnlineDrivers.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 pt-0">
              {mockOnlineDrivers.map((driver) => (
                <div key={driver.name} className="flex items-center justify-between text-sm">
                  <span>{driver.name}</span>
                  <span className="text-muted-foreground">Em andamento: {driver.ongoingCount}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <Card className="flex min-h-[500px] items-center justify-center overflow-hidden">
          <div className="flex flex-col items-center gap-2 text-muted-foreground">
            <MapPin className="size-8" />
            <p className="text-sm">Mapa (integração com Google Maps — Fase futura)</p>
          </div>
        </Card>
      </div>
    </div>
  );
}
