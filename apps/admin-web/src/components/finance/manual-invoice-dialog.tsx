'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@motoboycity/api-client';
import type { InvoiceDetail, ManualInvoicePreview } from '@motoboycity/types';
import type { ManualInvoicePayload } from '@motoboycity/validation';
import { Building2, CalendarDays, FilePlus2, ReceiptText } from 'lucide-react';
import { ActionFeedback } from '@/components/ui/action-feedback';
import { Button } from '@/components/ui/button';
import { ManualInvoiceOrderPicker } from '@/components/finance/manual-invoice-order-picker';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PendingButtonLabel } from '@/components/ui/pending-button-label';
import { QueryState } from '@/components/ui/query-state';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { adminCompaniesApi, adminInvoicesApi } from '@/lib/api-client';
import { formatarNumero } from '@/lib/dinheiro';
import { MANUAL_INVOICE_SELECTION_LIMIT } from '@/lib/manual-invoice-filters';
import { useMoney } from '@/lib/money';

function hojeNaOperacao(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
}

export function ManualInvoiceDialog({
  token,
  onCreated,
}: {
  token: string;
  onCreated: (invoice: InvoiceDetail) => void;
}) {
  const money = useMoney();
  const queryClient = useQueryClient();
  const today = hojeNaOperacao();
  const [open, setOpen] = useState(false);
  const [companyId, setCompanyId] = useState('');
  const [deliveryIds, setDeliveryIds] = useState<string[]>([]);
  const [issueDate, setIssueDate] = useState(today);
  const [dueDate, setDueDate] = useState(today);
  const [preview, setPreview] = useState<ManualInvoicePreview | null>(null);
  const [error, setError] = useState<string | null>(null);

  const companiesQuery = useQuery({
    queryKey: ['admin', 'companies'],
    queryFn: () => adminCompaniesApi.list(token),
    enabled: open,
  });
  const candidatesQuery = useQuery({
    queryKey: ['admin', 'financial', 'invoices', 'manual-candidates', companyId],
    queryFn: () => adminInvoicesApi.manualCandidates(token, companyId),
    enabled: open && Boolean(companyId),
  });

  const companies = companiesQuery.data ?? [];
  const candidates = candidatesQuery.data ?? [];
  const companyLabels = Object.fromEntries(
    companies.map((company) => [company.id, `${company.tradeName} - ${company.document}`]),
  );

  function payload(): ManualInvoicePayload {
    return { companyId, deliveryIds, issueDate, dueDate };
  }

  function explain(requestError: unknown, fallback: string): string {
    return requestError instanceof ApiError ? requestError.message : fallback;
  }

  const previewMutation = useMutation({
    mutationFn: () => adminInvoicesApi.previewManual(token, payload()),
    onSuccess: (result) => {
      setPreview(result);
      setError(null);
    },
    onError: (requestError) =>
      setError(explain(requestError, 'Não foi possível calcular a prévia da fatura.')),
  });

  const createMutation = useMutation({
    mutationFn: () => adminInvoicesApi.createManual(token, payload()),
    onSuccess: (invoice) => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'financial'] });
      void queryClient.invalidateQueries({ queryKey: ['admin', 'invoices'] });
      onCreated(invoice);
      reset();
      setOpen(false);
    },
    onError: (requestError) => {
      setPreview(null);
      setError(
        explain(
          requestError,
          'Não foi possível emitir a fatura. Atualize os pedidos e tente novamente.',
        ),
      );
    },
  });

  function reset() {
    setCompanyId('');
    setDeliveryIds([]);
    setIssueDate(today);
    setDueDate(today);
    setPreview(null);
    setError(null);
    previewMutation.reset();
    createMutation.reset();
  }

  function changeCompany(value: string | null) {
    setCompanyId(value ?? '');
    setDeliveryIds([]);
    setPreview(null);
    setError(null);
  }

  function changeIssueDate(value: string) {
    setIssueDate(value);
    if (dueDate < value) setDueDate(value);
    setPreview(null);
    setError(null);
  }

  function changeDueDate(value: string) {
    setDueDate(value);
    setPreview(null);
    setError(null);
  }

  function changeSelection(ids: string[]) {
    setDeliveryIds(ids);
    setPreview(null);
    setError(null);
  }

  const candidateIds = new Set(candidates.map((candidate) => candidate.id));
  const canPreview =
    Boolean(companyId) &&
    deliveryIds.length > 0 &&
    deliveryIds.length <= MANUAL_INVOICE_SELECTION_LIMIT &&
    candidatesQuery.isSuccess &&
    !candidatesQuery.isFetching &&
    deliveryIds.every((id) => candidateIds.has(id)) &&
    Boolean(issueDate) &&
    Boolean(dueDate) &&
    issueDate <= today &&
    dueDate >= issueDate;
  const busy = previewMutation.isPending || createMutation.isPending;

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (busy) return;
        if (!nextOpen) reset();
        setOpen(nextOpen);
      }}
    >
      <DialogTrigger
        render={
          <Button>
            <FilePlus2 aria-hidden className="size-4" />
            Criar fatura personalizada
          </Button>
        }
      />
      <DialogContent closeDisabled={busy} className="sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ReceiptText aria-hidden className="size-5 text-primary" />
            Criar fatura personalizada
          </DialogTitle>
          <DialogDescription>
            Escolha uma empresa e exatamente quais pedidos concluídos entrarão nesta cobrança.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-4">
          <div className="grid gap-4 rounded-2xl border border-border/80 bg-muted/25 p-4 lg:grid-cols-[minmax(0,2fr)_minmax(10rem,1fr)_minmax(10rem,1fr)]">
            <div className="space-y-1.5">
              <Label htmlFor="manual-invoice-company">Empresa</Label>
              <Select
                items={companyLabels}
                value={companyId}
                onValueChange={changeCompany}
                disabled={busy || companiesQuery.isLoading || companiesQuery.isError}
              >
                <SelectTrigger id="manual-invoice-company" className="w-full bg-card">
                  <SelectValue placeholder="Selecione a empresa" />
                </SelectTrigger>
                <SelectContent>
                  {companies.map((company) => (
                    <SelectItem key={company.id} value={company.id}>
                      <Building2 className="size-4" />
                      {company.tradeName}
                      <span className="text-xs text-muted-foreground">{company.document}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="manual-invoice-issue-date">Data de emissão</Label>
              <Input
                id="manual-invoice-issue-date"
                type="date"
                disabled={busy}
                className="bg-card"
                max={today}
                value={issueDate}
                onChange={(event) => changeIssueDate(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="manual-invoice-due-date">Vencimento</Label>
              <Input
                id="manual-invoice-due-date"
                type="date"
                disabled={busy}
                className="bg-card"
                min={issueDate}
                value={dueDate}
                onChange={(event) => changeDueDate(event.target.value)}
              />
            </div>

            {companiesQuery.isLoading ? (
              <div className="lg:col-span-3">
                <QueryState compact kind="loading" title="Carregando empresas" />
              </div>
            ) : companiesQuery.isError ? (
              <div className="lg:col-span-3">
                <QueryState
                  compact
                  kind="error"
                  title="Não foi possível carregar as empresas"
                  description="A seleção fica bloqueada até a consulta ser recuperada."
                  onAction={() => void companiesQuery.refetch()}
                />
              </div>
            ) : companies.length === 0 ? (
              <div className="lg:col-span-3">
                <QueryState
                  compact
                  kind="empty"
                  title="Nenhuma empresa disponível"
                  description="Cadastre e aprove uma empresa antes de emitir uma fatura personalizada."
                />
              </div>
            ) : null}
          </div>

          {companyId && (
            <ManualInvoiceOrderPicker
              key={companyId}
              candidates={candidates}
              selectedIds={deliveryIds}
              onSelectionChange={changeSelection}
              loading={candidatesQuery.isLoading}
              error={
                candidatesQuery.isError
                  ? explain(
                      candidatesQuery.error,
                      'Não foi possível consultar os pedidos. Tente novamente.',
                    )
                  : null
              }
              refreshing={candidatesQuery.isFetching}
              disabled={busy}
              onRefresh={() => {
                setPreview(null);
                void candidatesQuery.refetch();
              }}
            />
          )}

          {deliveryIds.length > 0 && !preview && (
            <ActionFeedback tone="info" compact>
              {formatarNumero(deliveryIds.length)} pedido(s) selecionado(s). Gere a prévia para
              conferir os valores antes da emissão.
            </ActionFeedback>
          )}

          {preview && (
            <section className="rounded-2xl border border-primary/20 bg-primary/5 p-4">
              <div className="flex items-center gap-2 font-semibold">
                <CalendarDays className="size-4 text-primary" /> Prévia confirmada pelo servidor
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <div>
                  <p className="text-xs text-muted-foreground">Total da empresa</p>
                  <p className="font-mono text-xl font-semibold">{money(preview.totalValue)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Repasse aos entregadores</p>
                  <p className="font-mono font-semibold">{money(preview.driverValueSum)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Receita da plataforma</p>
                  <p className="font-mono font-semibold">{money(preview.platformValueSum)}</p>
                </div>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                {formatarNumero(preview.deliveryCount)} pedido(s) selecionado(s), incluindo os que
                estão fora do filtro. Se algum já tiver sido faturado ao confirmar, a emissão não
                será realizada e você poderá revisar a seleção.
              </p>
            </section>
          )}

          {error && (
            <ActionFeedback
              tone="error"
              title="Não foi possível concluir a operação"
              onDismiss={() => setError(null)}
            >
              {error}
            </ActionFeedback>
          )}
        </DialogBody>

        <DialogFooter className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => {
              reset();
              setOpen(false);
            }}
          >
            Voltar
          </Button>
          {preview ? (
            <Button
              type="button"
              disabled={busy || !canPreview}
              onClick={() => createMutation.mutate()}
            >
              <PendingButtonLabel
                pending={createMutation.isPending}
                pendingLabel="Emitindo fatura..."
              >
                Emitir fatura agora
              </PendingButtonLabel>
            </Button>
          ) : (
            <Button
              type="button"
              disabled={!canPreview || previewMutation.isPending}
              onClick={() => previewMutation.mutate()}
            >
              <PendingButtonLabel
                pending={previewMutation.isPending}
                pendingLabel="Calculando prévia..."
              >
                Gerar prévia
              </PendingButtonLabel>
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
