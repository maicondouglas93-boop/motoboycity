'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@motoboycity/api-client';
import type { InvoiceDetail, ManualInvoicePreview } from '@motoboycity/types';
import type { ManualInvoicePayload } from '@motoboycity/validation';
import { Building2, CalendarDays, FilePlus2, ReceiptText } from 'lucide-react';
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
      setError(explain(requestError, 'Nao foi possivel calcular a previa da fatura.')),
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
          'Nao foi possivel emitir a fatura. Atualize os pedidos e tente novamente.',
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
      <DialogContent closeDisabled={busy}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ReceiptText aria-hidden className="size-5 text-primary" />
            Criar fatura personalizada
          </DialogTitle>
          <DialogDescription>
            Escolha uma empresa e exatamente quais pedidos concluidos entrarao nesta cobranca.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-5">
          <div className="space-y-1.5">
            <Label>Empresa</Label>
            <Select items={companyLabels} value={companyId} onValueChange={changeCompany}>
              <SelectTrigger className="w-full">
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
            {companiesQuery.isError && (
              <p className="text-xs text-destructive">Nao foi possivel carregar as empresas.</p>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="manual-invoice-issue-date">Data de emissao</Label>
              <Input
                id="manual-invoice-issue-date"
                type="date"
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
                min={issueDate}
                value={dueDate}
                onChange={(event) => changeDueDate(event.target.value)}
              />
            </div>
          </div>

          {companyId && (
            <section className="overflow-hidden rounded-2xl border border-border/80">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-muted/35 px-4 py-3">
                <div>
                  <p className="font-medium">Pedidos disponiveis</p>
                  <p className="text-xs text-muted-foreground">
                    Somente concluidos, cobrados por fatura e ainda nao faturados.
                  </p>
                </div>
                {candidates.length > 0 && (
                  <Button type="button" size="sm" variant="outline" onClick={toggleAll}>
                    {allSelected ? 'Limpar selecao' : 'Selecionar todos'}
                  </Button>
                )}
              </div>

              {candidatesQuery.isLoading ? (
                <p className="p-6 text-sm text-muted-foreground">Carregando pedidos...</p>
              ) : candidatesQuery.isError ? (
                <p className="p-6 text-sm text-destructive">
                  Nao foi possivel carregar os pedidos faturaveis.
                </p>
              ) : candidates.length === 0 ? (
                <p className="p-6 text-sm text-muted-foreground">
                  Esta empresa nao possui pedido concluido aguardando fatura.
                </p>
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
                          Concluido em {formatarDataHora(candidate.completedAt)}
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
            <p className="text-sm text-muted-foreground">
              {formatarNumero(deliveryIds.length)} pedido(s) selecionado(s). Gere a previa para
              conferir os valores antes da emissao.
            </p>
          )}

          {preview && (
            <section className="rounded-2xl border border-primary/20 bg-primary/5 p-4">
              <div className="flex items-center gap-2 font-semibold">
                <CalendarDays className="size-4 text-primary" /> Previa confirmada pelo servidor
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
                {formatarNumero(preview.deliveryCount)} pedido(s). A emissao sera refeita de forma
                atomica; se outro fechamento usar um deles antes, o sistema cancela toda a acao.
              </p>
            </section>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}
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
              {createMutation.isPending ? 'Emitindo...' : 'Emitir fatura agora'}
            </Button>
          ) : (
            <Button
              type="button"
              disabled={!canPreview || previewMutation.isPending}
              onClick={() => previewMutation.mutate()}
            >
              {previewMutation.isPending ? 'Calculando...' : 'Gerar previa'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
