import Link from 'next/link';
import type { ReactNode } from 'react';
import { ArrowLeft, type LucideIcon } from 'lucide-react';

export type AdminPageHeaderTone = 'operation' | 'customers' | 'finance' | 'reports' | 'settings';

const TONES: Record<
  AdminPageHeaderTone,
  { panel: string; rail: string; icon: string; eyebrow: string; glow: string }
> = {
  operation: {
    panel: 'border-colete/25 from-card via-card to-dinheiro-nao-cobrado-suave/70',
    rail: 'from-colete-escuro to-colete',
    icon: 'bg-colete/15 text-colete-escuro ring-colete/25',
    eyebrow: 'text-colete-escuro',
    glow: 'bg-colete/15',
  },
  customers: {
    panel: 'border-status-entregue/20 from-card via-card to-dinheiro-recebido-suave/70',
    rail: 'from-status-entregue to-[#35a16f]',
    icon: 'bg-status-entregue/10 text-status-entregue ring-status-entregue/20',
    eyebrow: 'text-status-entregue',
    glow: 'bg-status-entregue/10',
  },
  finance: {
    panel: 'border-status-pagamento/20 from-card via-card to-dinheiro-informativo-suave/75',
    rail: 'from-status-pagamento to-[#5b7ee5]',
    icon: 'bg-status-pagamento/10 text-status-pagamento ring-status-pagamento/20',
    eyebrow: 'text-status-pagamento',
    glow: 'bg-status-pagamento/10',
  },
  reports: {
    panel: 'border-primary/20 from-card via-card to-admin-soft/75',
    rail: 'from-primary to-[#35b8b2]',
    icon: 'bg-primary/10 text-primary ring-primary/20',
    eyebrow: 'text-primary',
    glow: 'bg-primary/10',
  },
  settings: {
    panel: 'border-admin-deep/15 from-card via-card to-secondary/80',
    rail: 'from-admin-deep to-primary',
    icon: 'bg-admin-soft text-admin-deep ring-primary/15',
    eyebrow: 'text-primary',
    glow: 'bg-primary/10',
  },
};

/** Cabeçalho comum das áreas administrativas, com cor ligada ao domínio. */
export function AdminPageHeader({
  icon: Icon,
  eyebrow,
  title,
  description,
  tone,
  actions,
  backHref,
  backLabel = 'Voltar',
}: {
  icon: LucideIcon;
  eyebrow: string;
  title: string;
  description: string;
  tone: AdminPageHeaderTone;
  actions?: ReactNode;
  backHref?: string;
  backLabel?: string;
}) {
  const style = TONES[tone];

  return (
    <header
      className={`relative overflow-hidden rounded-3xl border bg-gradient-to-br px-5 py-5 shadow-[0_18px_42px_-34px_rgba(10,53,64,0.65)] sm:px-6 ${style.panel}`}
    >
      <span
        aria-hidden="true"
        className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${style.rail}`}
      />
      <span
        aria-hidden="true"
        className={`absolute -top-16 right-10 size-44 rounded-full blur-3xl ${style.glow}`}
      />

      {backHref && (
        <Link
          href={backHref}
          className="relative mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          {backLabel}
        </Link>
      )}

      <div className="relative flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3.5">
          <span
            className={`flex size-11 shrink-0 items-center justify-center rounded-2xl ring-1 ring-inset ${style.icon}`}
          >
            <Icon className="size-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className={`text-xs font-bold tracking-[0.15em] uppercase ${style.eyebrow}`}>
              {eyebrow}
            </p>
            <h1 className="mt-1">{title}</h1>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">{description}</p>
          </div>
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}
