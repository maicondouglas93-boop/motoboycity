import type { OperationalDeliveryItem } from '@motoboycity/types';
import { StatusChip, statusRailClass } from '@/components/orders/status-chip';
import { ElapsedTime } from '@/components/orders/elapsed-time';
import { operationTime } from '@/lib/operation-clock';

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
      className={`relative w-full overflow-hidden rounded-xl border bg-card/70 py-3 pr-3 pl-4 text-left shadow-[0_1px_2px_rgba(16,37,47,0.035)] transition-all ${
        selected
          ? 'border-portal/45 bg-portal-soft/60 shadow-[0_10px_24px_-18px_rgba(15,107,112,0.65)] ring-1 ring-portal/10'
          : 'border-border/75 hover:-translate-y-0.5 hover:border-portal/25 hover:bg-card hover:shadow-md'
      }`}
    >
      <span
        aria-hidden="true"
        className={`absolute inset-y-0 left-0 w-1 ${statusRailClass(order.status)}`}
      />
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-baseline gap-2">
          <span className="font-mono text-sm font-semibold">#{order.displayNumber}</span>
          {/*
            Duas medidas de tempo, e cada uma responde uma pergunta: a HORA diz
            quando o pedido entrou, e o cronometro diz ha quanto tempo ele esta
            parado neste estado. So o cronometro nao deixa remontar a fila; so a
            hora nao mostra pressao.
          */}
          <span className="font-mono text-xs text-muted-foreground">
            {operationTime(order.createdAt)}
          </span>
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
