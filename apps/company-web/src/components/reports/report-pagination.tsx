'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

export const REPORT_PAGE_SIZES = [10, 25, 50, 100] as const;

export function ReportPagination({
  page,
  pageSize,
  total,
  isFetching,
  onPageChange,
  onPageSizeChange,
  itemLabel = 'itens',
}: {
  page: number;
  pageSize: number;
  total: number;
  isFetching: boolean;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  itemLabel?: string;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const firstVisible = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const lastVisible = Math.min(page * pageSize, total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/70 bg-card/70 px-4 py-3 text-sm">
      <p className="text-muted-foreground" aria-live="polite">
        Mostrando {firstVisible}–{lastVisible} de {total} {itemLabel}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          Por página
          <select
            aria-label={`${itemLabel} por página`}
            className="h-8 rounded-md border bg-background px-2 text-xs text-portal-deep"
            value={pageSize}
            onChange={(event) => onPageSizeChange(Number(event.target.value))}
            disabled={isFetching}
          >
            {REPORT_PAGE_SIZES.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page <= 1 || isFetching}
        >
          <ChevronLeft data-icon="inline-start" aria-hidden="true" />
          Anterior
        </Button>
        <span className="min-w-24 text-center text-xs font-medium text-portal-deep">
          Página {page} de {totalPages}
        </span>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages || isFetching}
        >
          Próxima
          <ChevronRight data-icon="inline-end" aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}
