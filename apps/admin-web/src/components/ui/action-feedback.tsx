import type { ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, CircleAlert, Info, X } from 'lucide-react';
import { cn } from '@/lib/utils';

type ActionFeedbackTone = 'success' | 'error' | 'warning' | 'info';

const TONES: Record<
  ActionFeedbackTone,
  { icon: typeof CheckCircle2; panel: string; iconClass: string }
> = {
  success: {
    icon: CheckCircle2,
    panel: 'border-status-entregue/25 bg-dinheiro-recebido-suave/70 text-foreground',
    iconClass: 'text-status-entregue',
  },
  error: {
    icon: CircleAlert,
    panel: 'border-destructive/25 bg-destructive/6 text-foreground',
    iconClass: 'text-destructive',
  },
  warning: {
    icon: AlertTriangle,
    panel: 'border-colete/35 bg-dinheiro-nao-cobrado-suave/75 text-foreground',
    iconClass: 'text-colete-escuro',
  },
  info: {
    icon: Info,
    panel: 'border-status-pagamento/20 bg-dinheiro-informativo-suave/70 text-foreground',
    iconClass: 'text-status-pagamento',
  },
};

/** Feedback comum para resultados de mutacoes e avisos operacionais. */
export function ActionFeedback({
  tone,
  title,
  children,
  compact = false,
  onDismiss,
  className,
  id,
  tabIndex,
}: {
  tone: ActionFeedbackTone;
  title?: string;
  children: ReactNode;
  compact?: boolean;
  onDismiss?: () => void;
  className?: string;
  id?: string;
  tabIndex?: number;
}) {
  const style = TONES[tone];
  const Icon = style.icon;

  return (
    <div
      id={id}
      tabIndex={tabIndex}
      role={tone === 'error' ? 'alert' : 'status'}
      aria-live={tone === 'error' ? 'assertive' : 'polite'}
      className={cn(
        'flex items-start gap-3 rounded-xl border',
        compact ? 'px-3 py-2.5 text-xs' : 'px-4 py-3 text-sm',
        style.panel,
        className,
      )}
    >
      <Icon
        aria-hidden="true"
        className={cn('mt-0.5 shrink-0', compact ? 'size-4' : 'size-5', style.iconClass)}
      />
      <div className="min-w-0 flex-1 leading-5">
        {title && <p className="font-semibold text-foreground">{title}</p>}
        <div className={cn(title && 'mt-0.5 text-muted-foreground')}>{children}</div>
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="-mr-1 grid size-7 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          aria-label="Fechar aviso"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
