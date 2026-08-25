import { AlertTriangle, LoaderCircle, SearchX, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

type QueryStateKind = 'loading' | 'error' | 'empty';

const STATE_STYLE: Record<
  QueryStateKind,
  { icon: LucideIcon; card: string; iconBox: string; eyebrow: string }
> = {
  loading: {
    icon: LoaderCircle,
    card: 'border-status-pagamento/20 bg-gradient-to-br from-card to-dinheiro-informativo-suave/75',
    iconBox: 'bg-status-pagamento/10 text-status-pagamento',
    eyebrow: 'text-status-pagamento',
  },
  error: {
    icon: AlertTriangle,
    card: 'border-alerta/25 bg-gradient-to-br from-card to-dinheiro-atrasado-suave/80',
    iconBox: 'bg-alerta/10 text-alerta',
    eyebrow: 'text-alerta',
  },
  empty: {
    icon: SearchX,
    card: 'border-primary/20 bg-gradient-to-br from-card to-admin-soft/70',
    iconBox: 'bg-admin-soft text-primary',
    eyebrow: 'text-primary',
  },
};

const EYEBROW: Record<QueryStateKind, string> = {
  loading: 'Consultando dados',
  error: 'Não foi possível consultar',
  empty: 'Nenhum resultado',
};

/**
 * Estado consistente para consultas do Admin Web.
 *
 * Loading, erro e vazio não podem parecer a mesma tela em branco: cada estado
 * usa uma cor semântica, um rótulo explícito e, no erro, uma ação de recuperação.
 */
export function QueryState({
  kind,
  title,
  description,
  actionLabel = 'Tentar novamente',
  onAction,
  compact = false,
}: {
  kind: QueryStateKind;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  compact?: boolean;
}) {
  const style = STATE_STYLE[kind];
  const Icon = style.icon;

  return (
    <Card
      role={kind === 'error' ? 'alert' : 'status'}
      aria-live={kind === 'loading' ? 'polite' : undefined}
      className={style.card}
    >
      <CardContent
        className={`flex flex-col items-start gap-4 sm:flex-row sm:items-center ${compact ? 'py-3' : 'py-6'}`}
      >
        <span
          className={`flex shrink-0 items-center justify-center rounded-2xl ${compact ? 'size-10' : 'size-12'} ${style.iconBox}`}
        >
          <Icon
            className={`${compact ? 'size-5' : 'size-6'} ${kind === 'loading' ? 'animate-spin' : ''}`}
            aria-hidden="true"
          />
        </span>
        <div className="min-w-0 flex-1">
          <p className={`text-xs font-bold tracking-[0.12em] uppercase ${style.eyebrow}`}>
            {EYEBROW[kind]}
          </p>
          <p className="mt-1 font-heading text-base font-semibold text-admin-deep">{title}</p>
          {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
        </div>
        {onAction && (
          <Button
            type="button"
            variant={kind === 'error' ? 'outline' : 'default'}
            onClick={onAction}
          >
            {actionLabel}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
