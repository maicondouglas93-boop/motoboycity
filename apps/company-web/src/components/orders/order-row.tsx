import type { OperationalDeliveryItem } from '@motoboycity/types';
import { StatusChip, statusRailClass } from '@/components/orders/status-chip';
import { ElapsedTime } from '@/components/orders/elapsed-time';

/**
 * Linha de pedido da central operacional.
 *
 * O trilho colorido na borda esquerda é a assinatura da interface: o estado da
 * entrega é legível na varredura da lista, sem precisar ler o texto de cada
 * chip. Âmbar ali significa que tem motoboy na rua com esse pedido.
 */
export function OrderRow({
  order,
  selected,
  onSelect,
}: {
  order: OperationalDeliveryItem;
  selected: boolean;
  onSelect: () => void;
}) {
  const destination = order.addresses.find((address) => address.type === 'DROPOFF');

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`relative w-full overflow-hidden rounded-lg border py-3 pr-3 pl-4 text-left transition ${
        selected ? 'border-asfalto bg-asfalto/[0.04]' : 'hover:bg-muted/60'
      }`}
    >
      <span
        aria-hidden="true"
        className={`absolute inset-y-0 left-0 w-1 ${statusRailClass(order.status)}`}
      />
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-baseline gap-2">
          <span className="font-mono text-sm font-semibold">#{order.displayNumber}</span>
          {/* Ha quanto tempo neste estado — o medidor de pressao da fila. */}
          <ElapsedTime since={order.statusChangedAt} />
        </span>
        <StatusChip status={order.status} />
      </div>
      <p className="mt-1.5 truncate text-xs text-muted-foreground">
        {order.externalOrderNumber ? `${order.externalOrderNumber} · ` : ''}
        {destination?.street
          ? `${destination.street}, ${destination.number ?? 's/n'}`
          : 'Destino por GPS'}
      </p>
      {order.driver && <p className="mt-1 truncate text-xs font-medium">{order.driver.name}</p>}
    </button>
  );
}
