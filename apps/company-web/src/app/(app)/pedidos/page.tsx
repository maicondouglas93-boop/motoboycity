import { Package } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { mockOngoingDeliveries } from '@/lib/mock-data';

export default function CompanyOrdersPage() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Input placeholder="Buscar pedido..." className="max-w-xs" />
        <Button variant="outline">Ver como Tabela</Button>
      </div>

      {mockOngoingDeliveries.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-16 text-muted-foreground">
            <Package className="size-8" />
            <p className="text-sm">Nenhum registro</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {mockOngoingDeliveries.map((delivery) => (
            <Card key={delivery.id}>
              <CardContent className="flex items-center justify-between py-4">
                <div>
                  <p className="font-medium">
                    #{delivery.id} — {delivery.customerName}
                  </p>
                  <p className="text-sm text-muted-foreground">Entregador: {delivery.driverName}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm">{delivery.status}</p>
                  <p className="font-medium">{delivery.value}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
