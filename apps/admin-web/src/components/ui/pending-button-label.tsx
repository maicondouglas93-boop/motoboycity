import type { ReactNode } from 'react';
import { LoaderCircle } from 'lucide-react';

/** Mantem texto e indicador de progresso consistentes em botoes assincronos. */
export function PendingButtonLabel({
  pending,
  pendingLabel,
  children,
}: {
  pending: boolean;
  pendingLabel: string;
  children: ReactNode;
}) {
  if (!pending) return children;

  return (
    <>
      <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
      {pendingLabel}
    </>
  );
}
