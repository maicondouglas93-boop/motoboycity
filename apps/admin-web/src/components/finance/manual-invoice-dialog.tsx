'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@motoboycity/api-client';
import type { InvoiceDetail, ManualInvoicePreview } from '@motoboycity/types';
import type { ManualInvoicePayload } from '@motoboycity/validation';
import { Building2, CalendarDays, FilePlus2, ReceiptText } from 'lucide-react';
import { ActionFeedback } from '@/components/ui/action-feedback';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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
import { formatarDataHora, formatarNumero } from '@/lib/dinheiro';
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

  function toggleDelivery(id: string, checked: boolean) {
    setDeliveryIds((current) =>
      checked ? [...current, id] : current.filter((deliveryId) => deliveryId !== id),
    );
    setPreview(null);
    setError(null);
  }

  function toggleAll() {
    setDeliveryIds(
      deliveryIds.length === candidates.length ? [] : candidates.map((candidate) => candidate.id),
    );
    setPreview(null);
    setError(null);
  }

  const allSelected = candidates.length > 0 && deliveryIds.length === candidates.length;
  const canPreview =
    Boolean(companyId) && deliveryIds.length > 0 && Boolean(issueDate) && Boolean(dueDate);
  const busy = previewMutation.isPending || createMutation.isPending;

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && !busy) reset();
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
                disabled={companiesQuery.isLoading || companiesQuery.isError}
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
            <section className="overflow-hidden rounded-2xl border border-border/80">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-muted/35 px-4 py-3">
                <div>
                  <p className="font-medium">Pedidos disponíveis</p>
                  <p className="text-xs text-muted-foreground">
                    Somente concluídos, cobrados por fatura e ainda não faturados.
                  </p>
                </div>
                {candidates.length > 0 && (
                  <Button type="button" size="sm" variant="outline" onClick={toggleAll}>
                    {allSelected ? 'Limpar selecao' : 'Selecionar todos'}
                  </Button>
                )}
              </div>

              {candidatesQuery.isLoading ? (
                <div className="p-4">
                  <QueryState compact kind="loading" title="Carregando pedidos faturáveis" />
                </div>
              ) : candidatesQuery.isError ? (
                <div className="p-4">
                  <QueryState
                    compact
                    kind="error"
                    title="Não foi possível carregar os pedidos faturáveis"
                    description="A lista não será mostrada como vazia enquanto a consulta estiver indisponível."
                    onAction={() => void candidatesQuery.refetch()}
                  />
                </div>
              ) : candidates.length === 0 ? (
                <div className="p-4">
                  <QueryState
                    compact
                    kind="empty"
                    title="Nenhum pedido aguardando fatura"
                    description="Esta empresa não possui entrega concluída e ainda não faturada."
                  />
                </div>
              ) : (
                <div className="max-h-72 divide-y divide-border overflow-y-auto">
                  {candidates.map((candidate) => (
                    <label
                      key={candidate.id}
                      className="flex cursor-pointer items-start gap-3 px-4 py-3 transition-colors hover:bg-primary/5"
                    >
                      <Checkbox
                        checked={deliveryIds.includes(candidate.id)}
                        onCheckedChange={(checked) =>
                          toggleDelivery(candidate.id, checked === true)
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
              )}
            </section>
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
                {formatarNumero(preview.deliveryCount)} pedido(s). A emissão será refeita de forma
                atômica; se outro fechamento usar um deles antes, o sistema cancela toda a ação.
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
          <Button type="button" variant="outline" disabled={busy} onClick={() => setOpen(false)}>
            Voltar
          </Button>
          {preview ? (
            <Button
              type="button"
              disabled={createMutation.isPending}
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
