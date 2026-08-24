'use client';

import type { ReactNode } from 'react';
import { AlertCircle, CalendarRange } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function ReportFilterCard({
  idPrefix,
  from,
  to,
  onFromChange,
  onToChange,
  onApply,
  onClear,
  isFetching,
  error,
  description,
  children,
}: {
  idPrefix: string;
  from: string;
  to: string;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
  onApply: () => void;
  onClear: () => void;
  isFetching: boolean;
  error: string | null;
  description: string;
  children?: ReactNode;
}) {
  return (
    <Card className="premium-panel" aria-busy={isFetching}>
      <CardHeader className="border-b border-border/70 pb-4">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
            <CalendarRange className="size-5" aria-hidden="true" />
          </span>
          <div>
            <CardTitle>Filtros do relatório</CardTitle>
            <CardDescription className="mt-1">{description}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            onApply();
          }}
        >
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-44 flex-1 space-y-1.5 sm:max-w-56">
              <Label htmlFor={`${idPrefix}-from`}>A partir de</Label>
              <Input
                id={`${idPrefix}-from`}
                type="date"
                value={from}
                onChange={(event) => onFromChange(event.target.value)}
              />
            </div>
            <div className="min-w-44 flex-1 space-y-1.5 sm:max-w-56">
              <Label htmlFor={`${idPrefix}-to`}>Até</Label>
              <Input
                id={`${idPrefix}-to`}
                type="date"
                value={to}
                onChange={(event) => onToChange(event.target.value)}
              />
            </div>
            {children}
            <Button type="submit" disabled={isFetching}>
              {isFetching ? 'Atualizando...' : 'Aplicar filtros'}
            </Button>
            <Button type="button" variant="outline" onClick={onClear} disabled={isFetching}>
              Limpar
            </Button>
          </div>
          {error && (
            <div
              role="alert"
              className="flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive"
            >
              <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
              {error}
            </div>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
