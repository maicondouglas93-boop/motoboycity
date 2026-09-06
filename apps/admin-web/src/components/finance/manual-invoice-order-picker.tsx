'use client';

import { useMemo, useState } from 'react';
import type { ManualInvoiceCandidate } from '@motoboycity/types';
import { Filter, RefreshCw } from 'lucide-react';
import { ActionFeedback } from '@/components/ui/action-feedback';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { QueryState } from '@/components/ui/query-state';
import { ReportPagination } from '@/components/reports/report-pagination';
import { formatarDataHora, formatarNumero, somarDinheiro } from '@/lib/dinheiro';
import { useMoney } from '@/lib/money';
import { paginar } from '@/lib/paginacao';
import {
  EMPTY_MANUAL_INVOICE_FILTERS,
  MANUAL_INVOICE_SELECTION_LIMIT,
  MANUAL_INVOICE_SORT_OPTIONS,
  deselectInvoiceResults,
  filterManualInvoiceCandidates,
  invoicePeriod,
  manualInvoiceFilterError,
  selectInvoiceResults,
  type ManualInvoiceFilters,
} from '@/lib/manual-invoice-filters';

const PERIODS = [
  ['today', 'Hoje'],
  ['yesterday', 'Ontem'],
  ['last7', 'Últimos 7 dias'],
  ['month', 'Este mês'],
  ['previousMonth', 'Mês anterior'],
] as const;
const selectClass =
  'h-9 w-full rounded-lg border border-input bg-card px-3 text-sm disabled:opacity-50';

export function ManualInvoiceOrderPicker({
  candidates,
  selectedIds,
  onSelectionChange,
  loading,
  error,
  refreshing,
  disabled,
  onRefresh,
}: {
  candidates: ManualInvoiceCandidate[];
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
  loading: boolean;
  error: string | null;
  refreshing: boolean;
  disabled: boolean;
  onRefresh: () => void;
}) {
  const money = useMoney();
  const [filters, setFilters] = useState(EMPTY_MANUAL_INVOICE_FILTERS);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const filterError = manualInvoiceFilterError(filters);
  const advancedFilterCount = [
    filters.serviceType,
    filters.minValue,
    filters.maxValue,
    filters.selection !== 'all',
  ].filter(Boolean).length;
  const results = useMemo(
    () => filterManualInvoiceCandidates(candidates, filters, selectedIds),
    [candidates, filters, selectedIds],
  );
  const selected = new Set(selectedIds);
  const resultIds = results.map((item) => item.id);
  const resultSet = new Set(resultIds);
  const availableIds = new Set(candidates.map((item) => item.id));
  const missingIds = selectedIds.filter((id) => !availableIds.has(id));
  const hiddenCount = selectedIds.filter((id) => availableIds.has(id) && !resultSet.has(id)).length;
  const selectedCountInResults = resultIds.filter((id) => selected.has(id)).length;
  const selectedTotal = somarDinheiro(
    candidates.filter((item) => selected.has(item.id)).map((item) => item.totalValue),
  );
  const resultTotal = somarDinheiro(results.map((item) => item.totalValue));
  const serviceTypes = [...new Set(candidates.map((item) => item.serviceTypeName))].sort((a, b) =>
    a.localeCompare(b, 'pt-BR'),
  );
  const pagination = paginar(results.length, page, pageSize);
  const unavailable = disabled || loading || refreshing || Boolean(error);

  function changeFilters(patch: Partial<ManualInvoiceFilters>) {
    setFilters((current) => ({ ...current, ...patch }));
    setPage(1);
    setSelectionError(null);
  }
  function selectResults(ids: string[]) {
    const next = selectInvoiceResults(selectedIds, ids);
    if (!next) {
      setSelectionError(
        `O limite é ${MANUAL_INVOICE_SELECTION_LIMIT} pedidos por fatura. Reduza os resultados ou a seleção; nenhum pedido foi adicionado.`,
      );
      return;
    }
    setSelectionError(null);
    onSelectionChange(next);
  }
  function deselectResults(ids: string[]) {
    setSelectionError(null);
    onSelectionChange(deselectInvoiceResults(selectedIds, ids));
  }

  return (
    <section className="space-y-3" aria-label="Buscar e selecionar pedidos para a fatura">
      <fieldset
        disabled={unavailable}
        className="min-w-0 space-y-3 rounded-2xl border border-border/80 bg-muted/20 p-4"
      >
        <legend className="px-1 text-sm font-semibold">
          <Filter className="mr-1 inline size-4 text-primary" aria-hidden /> Filtrar pedidos
        </legend>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="invoice-order-search">Pedido / nº externo</Label>
            <Input
              id="invoice-order-search"
              value={filters.search}
              placeholder="Ex.: 432, 445 ou número externo"
              aria-describedby="invoice-order-search-hint"
              onChange={(e) => changeFilters({ search: e.target.value })}
            />
            <p id="invoice-order-search-hint" className="text-xs text-muted-foreground">
              Número do pedido exato; busca parcial no externo. Separe vários por vírgula.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="invoice-order-from">Concluído de</Label>
            <Input
              id="invoice-order-from"
              type="date"
              value={filters.from}
              max={filters.to || undefined}
              onChange={(e) => changeFilters({ from: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="invoice-order-to">Concluído até</Label>
            <Input
              id="invoice-order-to"
              type="date"
              value={filters.to}
              min={filters.from || undefined}
              onChange={(e) => changeFilters({ to: e.target.value })}
            />
          </div>
        </div>
        <details className="rounded-lg border border-border/60 bg-card/40 px-3 py-2">
          <summary className="cursor-pointer text-sm font-medium text-primary">
            Mais filtros: modalidade, valor e seleção
            {advancedFilterCount > 0 && ` · ${advancedFilterCount} ativo(s)`}
          </summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5">
              <Label htmlFor="invoice-order-service">Modalidade</Label>
              <select
                id="invoice-order-service"
                className={selectClass}
                value={filters.serviceType}
                onChange={(e) => changeFilters({ serviceType: e.target.value })}
              >
                <option value="">Todas as modalidades</option>
                {serviceTypes.map((name) => (
                  <option value={name} key={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="invoice-order-min">Valor mínimo (R$)</Label>
              <Input
                id="invoice-order-min"
                inputMode="decimal"
                placeholder="Ex.: 5,50"
                value={filters.minValue}
                onChange={(e) => changeFilters({ minValue: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="invoice-order-max">Valor máximo (R$)</Label>
              <Input
                id="invoice-order-max"
                inputMode="decimal"
                placeholder="Ex.: 20,00"
                value={filters.maxValue}
                onChange={(e) => changeFilters({ maxValue: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="invoice-order-selection">Seleção</Label>
              <select
                id="invoice-order-selection"
                className={selectClass}
                value={filters.selection}
                onChange={(e) =>
                  changeFilters({ selection: e.target.value as ManualInvoiceFilters['selection'] })
                }
              >
                <option value="all">Todos os pedidos</option>
                <option value="selected">Só selecionados</option>
                <option value="unselected">Não selecionados</option>
              </select>
            </div>
          </div>
        </details>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">Conclusão:</span>
          {PERIODS.map(([preset, label]) => (
            <Button
              key={preset}
              variant="outline"
              size="sm"
              onClick={() => changeFilters(invoicePeriod(preset))}
            >
              {label}
            </Button>
          ))}
          <Button variant="ghost" size="sm" onClick={() => changeFilters({ from: '', to: '' })}>
            Todo o período
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => changeFilters(EMPTY_MANUAL_INVOICE_FILTERS)}
          >
            Limpar filtros
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Datas de conclusão no horário de Brasília, incluindo o dia final. Valores são o total do
          pedido para a empresa.
        </p>
      </fieldset>

      <div className="overflow-hidden rounded-2xl border border-border/80">
        <div className="space-y-3 border-b bg-muted/35 px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-medium">Pedidos disponíveis</p>
              <p className="text-xs text-muted-foreground">
                Somente concluídos, cobrados por fatura e ainda não faturados.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={onRefresh}
              disabled={disabled || refreshing}
            >
              <RefreshCw className={`size-3.5 ${refreshing ? 'animate-spin' : ''}`} aria-hidden />{' '}
              Atualizar pedidos
            </Button>
          </div>
          {!loading && !error && !filterError && (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm" aria-live="polite">
                {formatarNumero(results.length)} de {formatarNumero(candidates.length)} pedidos ·{' '}
                {money(resultTotal)} nos resultados
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-2 text-xs">
                  Ordenar
                  <select
                    aria-label="Ordenar pedidos"
                    className={selectClass}
                    value={filters.sort}
                    disabled={unavailable}
                    onChange={(e) =>
                      changeFilters({ sort: e.target.value as ManualInvoiceFilters['sort'] })
                    }
                  >
                    {Object.entries(MANUAL_INVOICE_SORT_OPTIONS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={
                    unavailable || results.length === 0 || selectedCountInResults === results.length
                  }
                  onClick={() => selectResults(resultIds)}
                >
                  Selecionar resultados
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={unavailable || selectedCountInResults === 0}
                  onClick={() => deselectResults(resultIds)}
                >
                  Desmarcar resultados
                </Button>
              </div>
            </div>
          )}
        </div>
        {loading ? (
          <div className="p-4">
            <QueryState compact kind="loading" title="Carregando pedidos faturáveis" />
          </div>
        ) : error ? (
          <div className="p-4">
            <QueryState
              compact
              kind="error"
              title="Não foi possível carregar os pedidos faturáveis"
              description={error}
              onAction={onRefresh}
            />
          </div>
        ) : filterError ? (
          <div className="p-4">
            <ActionFeedback tone="error" compact>
              {filterError}
            </ActionFeedback>
          </div>
        ) : results.length === 0 ? (
          <div className="p-4">
            <QueryState
              compact
              kind="empty"
              title={
                candidates.length
                  ? 'Nenhum pedido encontrado com estes filtros'
                  : 'Nenhum pedido aguardando fatura'
              }
              description={
                candidates.length
                  ? 'Altere ou limpe os filtros para buscar outros pedidos.'
                  : 'Esta empresa não possui entrega concluída e ainda não faturada.'
              }
            />
          </div>
        ) : (
          <>
            <div className="max-h-72 divide-y divide-border overflow-y-auto" aria-busy={refreshing}>
              {results.slice(pagination.inicio, pagination.fim).map((candidate) => (
                <label
                  key={candidate.id}
                  className={`flex cursor-pointer items-start gap-3 px-4 py-3 transition-colors hover:bg-primary/5 ${selected.has(candidate.id) ? 'bg-primary/5' : ''}`}
                >
                  <Checkbox
                    checked={selected.has(candidate.id)}
                    disabled={unavailable}
                    onCheckedChange={(checked) =>
                      checked ? selectResults([candidate.id]) : deselectResults([candidate.id])
                    }
                    aria-label={`Selecionar pedido ${candidate.displayNumber}`}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <strong>Pedido #{candidate.displayNumber}</strong>
                      <span className="text-xs text-muted-foreground">
                        {candidate.serviceTypeName}
                      </span>
                      {candidate.externalOrderNumber && (
                        <span className="text-xs text-muted-foreground">
                          Externo {candidate.externalOrderNumber}
                        </span>
                      )}
                    </span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      Concluído em {formatarDataHora(candidate.completedAt)}
                    </span>
                  </span>
                  <span className="text-right">
                    <strong className="block font-mono tabular-nums">
                      {money(candidate.totalValue)}
                    </strong>
                    <span className="text-xs text-muted-foreground">
                      repasse {money(candidate.driverValue)}
                    </span>
                  </span>
                </label>
              ))}
            </div>
            <div className="border-t p-3">
              <ReportPagination
                page={pagination.numero}
                pageSize={pageSize}
                total={results.length}
                isFetching={unavailable}
                onPageChange={setPage}
                onPageSizeChange={(size) => {
                  setPageSize(size);
                  setPage(1);
                }}
                itemLabel="pedidos"
              />
            </div>
          </>
        )}
      </div>
      {selectionError && (
        <ActionFeedback tone="error" compact onDismiss={() => setSelectionError(null)}>
          {selectionError}
        </ActionFeedback>
      )}
      {selectedIds.length > 0 && (
        <div className="space-y-2 rounded-xl border border-primary/20 bg-primary/5 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium">
              {formatarNumero(selectedIds.length)} pedido(s) selecionado(s) de até{' '}
              {MANUAL_INVOICE_SELECTION_LIMIT}
              {!error && !loading && missingIds.length === 0 && <> · {money(selectedTotal)}</>}
            </p>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={unavailable}
                onClick={() =>
                  changeFilters({ ...EMPTY_MANUAL_INVOICE_FILTERS, selection: 'selected' })
                }
              >
                Ver seleção completa
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={disabled}
                onClick={() => deselectResults(selectedIds)}
              >
                Limpar seleção
              </Button>
            </div>
          </div>
          {!error && !loading && hiddenCount > 0 && (
            <p className="text-sm text-colete-escuro" role="status">
              {hiddenCount} selecionado(s) fora dos filtros continuam incluídos na prévia.
            </p>
          )}
          {!error && !loading && missingIds.length > 0 && (
            <ActionFeedback tone="warning" compact>
              {missingIds.length} selecionado(s) não estão mais disponíveis. Remova-os e confira a
              seleção.
              <Button
                size="sm"
                variant="outline"
                disabled={disabled}
                onClick={() => deselectResults(missingIds)}
              >
                Remover indisponíveis
              </Button>
            </ActionFeedback>
          )}
          <p className="text-xs text-muted-foreground">
            A seleção é preservada ao filtrar e paginar. “Selecionar resultados” inclui todas as
            páginas do filtro atual.
          </p>
        </div>
      )}
    </section>
  );
}
