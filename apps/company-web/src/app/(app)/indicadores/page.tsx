import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { StatCard } from '@/components/stat-card';
import { mockDeliveriesByDay, mockIndicators } from '@/lib/mock-data';

export default function IndicatorsPage() {
  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="flex flex-wrap items-end gap-4 pt-6">
          <div className="space-y-1.5">
            <Label htmlFor="start-date">Data Inicial</Label>
            <Input id="start-date" type="date" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="end-date">Data Final</Label>
            <Input id="end-date" type="date" />
          </div>
          <Button>Aplicar Filtro</Button>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Total de Pedidos" value={mockIndicators.totalDeliveries} />
        <StatCard label="Pedidos Cancelados" value={mockIndicators.cancelledDeliveries} />
        <StatCard label="Ticket Médio" value={mockIndicators.averageTicket} />
        <StatCard label="% Cancelamento" value={mockIndicators.cancellationRate} />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <StatCard label="Tempo Médio de Entrega" value={mockIndicators.averageDeliveryTime} />
        <StatCard label="Serviço mais usado" value={mockIndicators.mostUsedService} />
        <StatCard
          label="Método de Pagamento mais usado"
          value={mockIndicators.mostUsedPaymentMethod}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Pedidos por Dia</CardTitle>
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
  );
}
