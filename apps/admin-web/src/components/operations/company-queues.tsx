'use client';

import { Fragment, useState } from 'react';
import type { DeliveryStatus, OperationalDeliveryItem } from '@motoboycity/types';
import { Building2, ChevronDown, ChevronRight } from 'lucide-react';
import { statusHex, statusLabel } from '@/components/orders/status-chip';

/**
 * A fila agrupada por EMPRESA, e não por status.
 *
 * As duas lentes respondem perguntas diferentes. Por status: "o que está
 * travado agora". Por empresa: "algum cliente está sendo mal atendido" — que a
 * lista por status não mostra, porque espalha os pedidos de uma mesma loja por
 * várias seções.
 *
 * Numa central com trinta pedidos de dez lojas, a segunda pergunta é a que faz
 * o telefone tocar.
 */
export function CompanyQueues({
  orders,
  renderOrder,
}: {
  orders: OperationalDeliveryItem[];
  /**
   * A linha vem pronta de quem chama, com o clique ja ligado. Envolver aqui num
   * `div` com `onClick` duplicaria o gesto — a linha ja e um `<button>` — e
   * criaria um alvo clicavel que o teclado nao alcanca.
   */
  renderOrder: (order: OperationalDeliveryItem) => React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const grupos = new Map<string, { companyName: string; orders: OperationalDeliveryItem[] }>();
  for (const order of orders) {
    const grupo = grupos.get(order.companyId) ?? { companyName: order.companyName, orders: [] };
    grupo.orders.push(order);
    grupos.set(order.companyId, grupo);
  }

  /**
   * Mais pedidos primeiro. A loja com fila maior é a que corre mais risco de
   * atraso, e é ela que precisa estar no alto da tela sem ninguém procurar.
   */
  const ordenados = [...grupos.entries()].sort(
    (left, right) =>
      right[1].orders.length - left[1].orders.length ||
      left[1].companyName.localeCompare(right[1].companyName),
  );

  if (ordenados.length === 0) {
    return <p className="py-6 text-center text-xs text-muted-foreground">Nenhum pedido ativo.</p>;
  }

  return (
    <div className="space-y-2.5">
      {ordenados.map(([companyId, grupo]) => {
        const aberto = !collapsed[companyId];
        // Contadores por status, na ordem em que aparecem na fila da loja.
        const porStatus = new Map<DeliveryStatus, number>();
        for (const order of grupo.orders) {
          porStatus.set(order.status, (porStatus.get(order.status) ?? 0) + 1);
        }

        return (
          <div
            key={companyId}
            className="overflow-hidden rounded-2xl border border-primary/12 bg-card/75 shadow-[0_8px_24px_-22px_rgba(15,107,112,0.72)]"
          >
            <button
              type="button"
              onClick={() =>
                setCollapsed((current) => ({ ...current, [companyId]: !current[companyId] }))
              }
              aria-expanded={aberto}
              className="flex w-full items-center gap-2.5 bg-gradient-to-r from-admin-soft to-muted/40 px-3 py-2.5 text-left transition-all hover:from-admin-soft hover:to-admin-soft/45 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary focus-visible:outline-none"
            >
              <span className="grid size-6 shrink-0 place-items-center rounded-lg bg-card/85 text-primary shadow-sm ring-1 ring-inset ring-primary/10">
                {aberto ? (
                  <ChevronDown className="size-3.5" aria-hidden="true" />
                ) : (
                  <ChevronRight className="size-3.5" aria-hidden="true" />
                )}
              </span>
              <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground shadow-sm">
                <Building2 className="size-3.5" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-semibold text-admin-deep capitalize">
                  {grupo.companyName}
                </span>
                <span className="block text-[9px] font-normal text-muted-foreground">
                  {grupo.orders.length} pedido{grupo.orders.length === 1 ? '' : 's'}
                </span>
              </span>
              {/*
                Contadores coloridos pelo mesmo mapa de status da fila: a cor
                aqui significa a mesma coisa que significa no chip, ou ela vira
                decoracao e o olho para de confiar nela.
              */}
              <span className="flex shrink-0 items-center gap-1">
                {[...porStatus.entries()].map(([status, total]) => (
                  <span
                    key={status}
                    title={`${total} ${statusLabel(status)}`}
                    className="inline-flex size-5 items-center justify-center rounded-full text-[9px] font-bold text-white shadow-sm ring-2 ring-card"
                    style={{ backgroundColor: statusHex(status) }}
                  >
                    {total}
                  </span>
                ))}
              </span>
            </button>

            {aberto && (
              <div className="m-2 mt-0 overflow-hidden rounded-xl border border-border/70 bg-card/80">
                {grupo.orders.map((order) => (
                  <Fragment key={order.id}>{renderOrder(order)}</Fragment>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
