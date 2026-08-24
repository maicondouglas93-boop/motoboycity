import Link from 'next/link';
import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { AlertCircle, ArrowLeft, History, Radio } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

export function ReportPageHeader({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <header className="space-y-3">
      <Link
        href="/relatorios"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Central de relatórios
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary ring-1 ring-inset ring-primary/10">
            <Icon className="size-5" aria-hidden="true" />
          </span>
          <div>
            <h1 className="font-heading text-2xl font-semibold tracking-tight text-admin-deep">
              {title}
            </h1>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">{description}</p>
          </div>
        </div>
        {action}
      </div>
    </header>
  );
}

export function ReportSectionHeading({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="font-heading text-lg font-semibold text-admin-deep">{title}</h2>
        {description && (
          <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}

export function ReportPeriodSummary({
  period,
  comparisonPeriod,
  live,
}: {
  period: { from: string; to: string };
  comparisonPeriod?: { from: string; to: string };
  live?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/10 bg-admin-soft/35 px-4 py-3 text-sm leading-6 text-muted-foreground">
      <p>
        Período considerado: <strong className="text-admin-deep">{period.from}</strong> até{' '}
        <strong className="text-admin-deep">{period.to}</strong>
        {comparisonPeriod && (
          <>
            . Comparação: <strong className="text-admin-deep">{comparisonPeriod.from}</strong> até{' '}
            <strong className="text-admin-deep">{comparisonPeriod.to}</strong>
          </>
        )}
        .
      </p>
      {live !== undefined && (
        <Badge variant={live ? 'default' : 'outline'} className="gap-1.5">
          {live ? (
            <Radio className="size-3" aria-hidden="true" />
          ) : (
            <History className="size-3" aria-hidden="true" />
          )}
          {live ? 'Período em andamento' : 'Recorte histórico'}
        </Badge>
      )}
    </div>
  );
}

export function ReportQueryState({
  loading,
  error,
  loadingLabel = 'Calculando relatório...',
  onRetry,
}: {
  loading: boolean;
  error: boolean;
  loadingLabel?: string;
  onRetry?: () => void;
}) {
  if (loading) {
    return (
      <Card>
        <CardContent
          className="py-16 text-center text-sm text-muted-foreground"
          role="status"
          aria-live="polite"
        >
          {loadingLabel}
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <div
        role="alert"
        className="flex flex-wrap items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
      >
        <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
        <span className="flex-1">Não foi possível gerar este relatório. Tente novamente.</span>
        {onRetry && (
          <Button type="button" size="sm" variant="outline" onClick={onRetry}>
            Tentar novamente
          </Button>
        )}
      </div>
    );
  }

  return null;
}
