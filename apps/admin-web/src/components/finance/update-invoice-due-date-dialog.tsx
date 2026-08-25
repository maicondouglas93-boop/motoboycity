'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@motoboycity/api-client';
import type { InvoiceStatus } from '@motoboycity/types';
import { CalendarClock } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
import { ActionFeedback } from '@/components/ui/action-feedback';
import { PendingButtonLabel } from '@/components/ui/pending-button-label';
import { adminInvoicesApi } from '@/lib/api-client';
import { formatarData } from '@/lib/dinheiro';

const MIN_REASON_LENGTH = 10;

function todayInOperation(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
}

export function UpdateInvoiceDueDateDialog({
  token,
  invoiceId,
  invoiceNumber,
  companyName,
  issueDate,
  currentDueDate,
  status,
}: {
  token: string;
  invoiceId: string;
  invoiceNumber: string;
  companyName: string;
  issueDate: string;
  currentDueDate: string;
  status: InvoiceStatus;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [dueDate, setDueDate] = useState(currentDueDate);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const update = useMutation({
    mutationFn: () =>
      adminInvoicesApi.updateDueDate(token, invoiceId, {
        dueDate,
        reason: reason.trim(),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'invoice', invoiceId] });
      void queryClient.invalidateQueries({ queryKey: ['admin', 'financial'] });
      void queryClient.invalidateQueries({ queryKey: ['admin', 'invoices'] });
      setOpen(false);
      setError(null);
    },
    onError: (requestError) =>
      setError(
        requestError instanceof ApiError
          ? requestError.message
          : 'Nao foi possivel alterar o vencimento.',
      ),
  });

  function reset() {
    setDueDate(currentDueDate);
    setReason('');
    setError(null);
    update.reset();
  }

  const trimmedReason = reason.trim();
  const sameDate = dueDate === currentDueDate;
  const invalidReason = trimmedReason.length < MIN_REASON_LENGTH;
  const becomesOverdue = Boolean(dueDate) && dueDate < todayInOperation();
  const returnsToPending = status === 'OVERDUE' && dueDate >= todayInOperation();

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (nextOpen) reset();
        setOpen(nextOpen);
      }}
    >
      <DialogTrigger
        render={
          <Button size="sm" variant="outline">
            <CalendarClock aria-hidden className="size-3.5" />
            Alterar vencimento
          </Button>
        }
      />
      <DialogContent closeDisabled={update.isPending} className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Alterar vencimento da {invoiceNumber}</DialogTitle>
          <DialogDescription>{companyName}</DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-4">
          <div className="grid gap-3 rounded-2xl border border-border/80 bg-muted/30 p-4 sm:grid-cols-2">
            <div>
              <p className="text-xs text-muted-foreground">Emissao</p>
              <p className="font-medium">{formatarData(issueDate)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Vencimento atual</p>
              <p className="font-medium">{formatarData(currentDueDate)}</p>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="invoice-new-due-date">Novo vencimento</Label>
            <Input
              id="invoice-new-due-date"
              type="date"
              min={issueDate}
              value={dueDate}
              onChange={(event) => {
                setDueDate(event.target.value);
                setError(null);
              }}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="invoice-due-date-reason">Motivo da alteracao</Label>
            <textarea
              id="invoice-due-date-reason"
              rows={3}
              maxLength={300}
              className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="Ex.: novo prazo combinado com a empresa"
              value={reason}
              onChange={(event) => {
                setReason(event.target.value);
                setError(null);
              }}
            />
            <p className="text-xs text-muted-foreground">
              O motivo e o seu nome ficarao registrados na trilha da fatura.
              {trimmedReason.length > 0 && invalidReason && (
                <span className="text-destructive">
                  {' '}
                  Faltam {MIN_REASON_LENGTH - trimmedReason.length} caractere(s).
                </span>
              )}
            </p>
          </div>

          {sameDate && (
            <p className="text-sm text-muted-foreground">
              Escolha uma data diferente do vencimento atual.
            </p>
          )}
          {becomesOverdue && !sameDate && (
            <ActionFeedback tone="warning" compact title="A fatura ficará vencida">
              Essa data ja passou. Ao salvar, a fatura sera marcada como vencida.
            </ActionFeedback>
          )}
          {returnsToPending && !sameDate && (
            <ActionFeedback tone="info" compact title="A fatura voltará para pendente">
              O novo prazo ainda esta aberto. A fatura voltara para pendente.
            </ActionFeedback>
          )}
          {error && (
            <ActionFeedback tone="error" title="Não foi possível alterar o vencimento">
              {error}
            </ActionFeedback>
          )}
        </DialogBody>

        <DialogFooter className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
          <Button variant="outline" disabled={update.isPending} onClick={() => setOpen(false)}>
            Voltar
          </Button>
          <Button
            disabled={!dueDate || sameDate || invalidReason || update.isPending}
            onClick={() => update.mutate()}
          >
            <PendingButtonLabel pending={update.isPending} pendingLabel="Salvando...">
              Confirmar novo vencimento
            </PendingButtonLabel>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
