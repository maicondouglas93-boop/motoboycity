import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import type { OrderCard as OrderCardData } from '@/lib/mock-data';

export function OrderCard({ order }: { order: OrderCardData }) {
  return (
    <Card>
      <CardContent className="space-y-2 py-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">
            #{order.id} <span className="text-muted-foreground">{order.time}</span>
          </span>
          <div className="flex items-center gap-2">
            {order.etaOrDuration && (
              <span className="text-xs text-muted-foreground">{order.etaOrDuration}</span>
            )}
            <Badge variant="secondary">{order.statusLabel}</Badge>
          </div>
        </div>
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">{order.businessName}</p>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Avatar className="size-5">
              <AvatarFallback className="text-[10px]">{order.driverName.charAt(0)}</AvatarFallback>
            </Avatar>
            {order.driverName}
          </div>
        </div>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{order.distanceKm}</span>
          <span>
            {order.value} ({order.driverValue})
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
