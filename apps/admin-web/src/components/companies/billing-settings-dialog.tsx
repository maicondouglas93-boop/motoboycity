'use client';

import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AdminCompanyDetail, InvoiceClosingFrequency } from '@motoboycity/types';
import {
  adminUpdateCompanyBillingSettingsSchema,
  type AdminUpdateCompanyBillingSettingsPayload,
} from '@motoboycity/validation';
import { ApiError } from '@motoboycity/api-client';
import { CalendarCog } from 'lucide-react';
import { adminCompaniesApi } from '@/lib/api-client';
import { ActionFeedback } from '@/components/ui/action-feedback';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PendingButtonLabel } from '@/components/ui/pending-button-label';

const WEEKDAYS = [
  'Domingo',
  'Segunda-feira',
  'Terça-feira',
  'Quarta-feira',
  'Quinta-feira',
  'Sexta-feira',
  'Sábado',
];

interface BillingDraft {
  mode: 'AUTOMATIC' | 'MANUAL';
  frequency: InvoiceClosingFrequency;
  weekday: string;
  monthDay: string;
  blockEnabled: boolean;
  blockAfterDays: string;
}

function draftFrom(company: AdminCompanyDetail): BillingDraft {
  const settings = company.billingSettings;
  return {
    mode: settings.invoiceClosingMode,
    frequency: settings.invoiceClosingFrequency ?? 'WEEKLY',
    weekday: String(settings.invoiceClosingWeekday ?? 1),
    monthDay: String(settings.invoiceClosingMonthDay ?? 1),
    blockEnabled: settings.invoiceOverdueBlockAfterDays !== null,
    blockAfterDays: String(settings.invoiceOverdueBlockAfterDays ?? 7),
  };
}

function payloadFrom(draft: BillingDraft): unknown {
  const invoiceOverdueBlockAfterDays = draft.blockEnabled ? Number(draft.blockAfterDays) : null;
  if (draft.mode === 'MANUAL') {
    return {
      invoiceClosingMode: 'MANUAL',
      invoiceClosingFrequency: null,
      invoiceClosingWeekday: null,
      invoiceClosingMonthDay: null,
      invoiceOverdueBlockAfterDays,
    };
  }
  return {
    invoiceClosingMode: 'AUTOMATIC',
    invoiceClosingFrequency: draft.frequency,
    invoiceClosingWeekday: draft.frequency === 'WEEKLY' ? Number(draft.weekday) : null,
    invoiceClosingMonthDay: draft.frequency === 'MONTHLY' ? Number(draft.monthDay) : null,
    invoiceOverdueBlockAfterDays,
  };
}

export function BillingSettingsDialog({
  company,
  token,
}: {
  company: AdminCompanyDetail;
  token: string;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(() => draftFrom(company));
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) return;
    setDraft(draftFrom(company));
    setError(null);
    setSuccess(false);
  }

  const update = useMutation({
    mutationFn: (payload: AdminUpdateCompanyBillingSettingsPayload) =>
      adminCompaniesApi.updateBillingSettings(token, company.id, payload),
    onSuccess: (updated) => {
      queryClient.setQueryData(['admin', 'company', company.id], updated);
      void queryClient.invalidateQueries({ queryKey: ['admin', 'companies'] });
      setDraft(draftFrom(updated));
      setError(null);
      setSuccess(true);
    },
    onError: (caughtError) => {
      setSuccess(false);
      setError(
        caughtError instanceof ApiError
          ? caughtError.message
          : 'Não foi possível salvar a política de faturamento.',
      );
    },
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSuccess(false);
    const parsed = adminUpdateCompanyBillingSettingsSchema.safeParse(payloadFrom(draft));
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Revise a configuração informada.');
      return;
    }
    setError(null);
    update.mutate(parsed.data);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <CalendarCog className="size-3.5" /> Faturamento
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl" closeDisabled={update.isPending}>
        <DialogHeader>
          <DialogTitle>Política de faturamento de {company.tradeName}</DialogTitle>
          <DialogDescription>
            Defina quando os pedidos viram fatura e depois de quantos dias de atraso a empresa e
            bloqueada.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <form className="space-y-5" onSubmit={submit}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="billing-closing-mode">Tipo de fechamento</Label>
                <select
                  id="billing-closing-mode"
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                  value={draft.mode}
                  onChange={(event) =>
                    setDraft({ ...draft, mode: event.target.value as BillingDraft['mode'] })
                  }
                >
                  <option value="AUTOMATIC">Automático</option>
                  <option value="MANUAL">Manual pelo administrador</option>
                </select>
              </div>

              {draft.mode === 'AUTOMATIC' && (
                <div className="space-y-1.5">
                  <Label htmlFor="billing-closing-frequency">Periodicidade</Label>
                  <select
                    id="billing-closing-frequency"
                    className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                    value={draft.frequency}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        frequency: event.target.value as InvoiceClosingFrequency,
                      })
                    }
                  >
                    <option value="WEEKLY">Semanal</option>
                    <option value="MONTHLY">Mensal</option>
                  </select>
                </div>
              )}

              {draft.mode === 'AUTOMATIC' && draft.frequency === 'WEEKLY' && (
                <div className="space-y-1.5">
                  <Label htmlFor="billing-closing-weekday">Dia da semana</Label>
                  <select
                    id="billing-closing-weekday"
                    className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                    value={draft.weekday}
                    onChange={(event) => setDraft({ ...draft, weekday: event.target.value })}
                  >
                    {WEEKDAYS.map((label, weekday) => (
                      <option key={label} value={weekday}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {draft.mode === 'AUTOMATIC' && draft.frequency === 'MONTHLY' && (
                <div className="space-y-1.5">
                  <Label htmlFor="billing-closing-month-day">Dia do mês</Label>
                  <Input
                    id="billing-closing-month-day"
                    type="number"
                    min={1}
                    max={31}
                    value={draft.monthDay}
                    onChange={(event) => setDraft({ ...draft, monthDay: event.target.value })}
                  />
                  <p className="text-xs text-muted-foreground">
                    Nos meses curtos, os dias 29, 30 e 31 fecham no último dia disponível.
                  </p>
                </div>
              )}
            </div>

            {draft.mode === 'MANUAL' && (
              <ActionFeedback tone="warning" title="Fechamento manual">
                Nenhuma fatura será fechada pelo agendamento. O administrador usa a ação
                &quot;Fechar fatura agora&quot; no detalhe desta empresa.
              </ActionFeedback>
            )}

            <div className="rounded-lg border p-4">
              <label className="flex items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  className="mt-1 size-4"
                  checked={draft.blockEnabled}
                  onChange={(event) => setDraft({ ...draft, blockEnabled: event.target.checked })}
                />
                <span>
                  <strong className="block">Bloquear automaticamente por atraso</strong>
                  <span className="text-muted-foreground">
                    Suspende novos acessos e a operação da empresa até o ADM reativar.
                  </span>
                </span>
              </label>
              {draft.blockEnabled && (
                <div className="mt-4 max-w-xs space-y-1.5">
                  <Label htmlFor="billing-overdue-days">Dias de atraso para bloquear</Label>
                  <Input
                    id="billing-overdue-days"
                    type="number"
                    min={1}
                    max={365}
                    value={draft.blockAfterDays}
                    onChange={(event) => setDraft({ ...draft, blockAfterDays: event.target.value })}
                  />
                </div>
              )}
            </div>

            {success && (
              <ActionFeedback tone="success" title="Configuração salva">
                A nova política passa a valer no próximo processamento financeiro.
              </ActionFeedback>
            )}
            {error && (
              <ActionFeedback tone="error" title="Não foi possível salvar">
                {error}
              </ActionFeedback>
            )}

            <div className="flex justify-end">
              <Button type="submit" disabled={update.isPending}>
                <PendingButtonLabel pending={update.isPending} pendingLabel="Salvando...">
                  Salvar política
                </PendingButtonLabel>
              </Button>
            </div>
          </form>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
