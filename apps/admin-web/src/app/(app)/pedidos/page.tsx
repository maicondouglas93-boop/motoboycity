import {
  Ban,
  CalendarClock,
  CheckCircle2,
  Clock,
  Hourglass,
  ListOrdered,
  Timer,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { mockDeliveriesByDay } from '@/lib/mock-data';

const STATUS_FILTERS = [
  { label: 'Todos os Pedidos', icon: ListOrdered },
  { label: 'Pedidos em Andamento', icon: Clock },
  { label: 'Pedidos Finalizados', icon: CheckCircle2 },
  { label: 'Pedidos Cancelados', icon: Ban },
  { label: 'Pedidos Agendados', icon: CalendarClock },
  { label: 'Pedidos Preparado', icon: Timer },
  { label: 'Aguardando Pagamento', icon: Hourglass },
];

export default function AdminOrdersPage() {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Gerencie e visualize todos os pedidos realizados na plataforma
          </p>
          <Button>Importar Pedidos</Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Pedidos por Dia</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex h-40 items-end gap-2">
              {mockDeliveriesByDay.map((value, index) => (
                <div
                  key={index}
                  className="flex-1 rounded-t bg-primary/70"
                  style={{ height: `${(value / Math.max(...mockDeliveriesByDay)) * 100}%` }}
                />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="h-fit">
        <CardContent className="space-y-1 pt-6">
          {STATUS_FILTERS.map(({ label, icon: Icon }) => (
            <button
              key={label}
              className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-accent"
            >
              <Icon className="size-4 text-muted-foreground" />
              {label}
            </button>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
