import { cn } from '@/lib/utils';

/**
 * Espaço reservado enquanto o dado carrega. Some sozinho quando a lista chega,
 * e não pulsa para quem pediu movimento reduzido.
 */
function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden="true"
      className={cn('rounded-md bg-muted motion-safe:animate-pulse', className)}
      {...props}
    />
  );
}

export { Skeleton };
