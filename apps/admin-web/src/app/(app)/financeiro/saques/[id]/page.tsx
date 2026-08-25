'use client';

import Link from 'next/link';
import { use, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { WithdrawalRequestStatus } from '@motoboycity/types';
import { AlertCircle, ChevronLeft } from 'lucide-react';
import { ApiError } from '@motoboycity/api-client';
import { ConfirmActionDialog } from '@/components/admin/confirm-action-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { adminFinancialApi } from '@/lib/api-client';
import { session } from '@/lib/session';
import { useMoney } from '@/lib/money';

const dateFormatter = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'America/Sao_Paulo',
});

const MIN_REASON_LENGTH = 10;

const statusLabel: Record<WithdrawalRequestStatus, string> = {
  PENDING: 'Em análise',
  APPROVED: 'Aprovado para pagamento',
  PAID: 'Pago',
  REJECTED: 'Rejeitado',
};

function statusVariant(
  status: WithdrawalRequestStatus,
): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (status === 'PAID' || status === 'APPROVED') return 'default';
  if (status === 'REJECTED') return 'destructive';
  return 'secondary';
}

export default function WithdrawalDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const money = useMoney();
  const { id } = use(params);
  const token = session.getToken();
  const queryClient = useQueryClient();
  const [note, setNote] = useState('');
  const [paymentReference, setPaymentReference] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);

  const withdrawalQuery = useQuery({
    queryKey: ['admin', 'financial', 'withdrawal', id],
    queryFn: () => adminFinancialApi.getWithdrawal(token as string, id),
    enabled: Boolean(token),
  });

  function invalidate() {
    return queryClient.invalidateQueries({ queryKey: ['admin', 'financial'] });
  }

  const approveMutation = useMutation({
    mutationFn: () =>
      adminFinancialApi.approveWithdrawal(token as string, id, {
        note: note.trim(),
      }),
    onMutate: () => setActionError(null),
    onSuccess: async () => {
      setNote('');
      setActionError(null);
      await invalidate();
    },
    onError: (error) =>
      setActionError(
        error instanceof ApiError ? error.message : 'Não foi possível aprovar o saque.',
      ),
  });
  const paidMutation = useMutation({
    mutationFn: () =>
      adminFinancialApi.markWithdrawalPaid(token as string, id, {
        note: note.trim(),
        ...(paymentReference.trim() && { paymentReference: paymentReference.trim() }),
      }),
    onMutate: () => setActionError(null),
    onSuccess: async () => {
      setNote('');
      setPaymentReference('');
      setActionError(null);
      await invalidate();
    },
    onError: (error) =>
      setActionError(
        error instanceof ApiError ? error.message : 'Não foi possível registrar o pagamento.',
      ),
  });
  const rejectMutation = useMutation({
    mutationFn: () =>
      adminFinancialApi.rejectWithdrawal(token as string, id, { note: note.trim() }),
    onMutate: () => setActionError(null),
    onSuccess: async () => {
      setNote('');
      setActionError(null);
      await invalidate();
    },
    onError: (error) =>
      setActionError(
        error instanceof ApiError ? error.message : 'Não foi possível rejeitar o saque.',
      ),
  });

  if (!token) {
    return (
      <p className="text-sm text-muted-foreground">
        Faça login como administrador para ver este saque.
      </p>
    );
  }
  if (withdrawalQuery.isLoading) {
    return <p className="text-sm text-muted-foreground">Carregando solicitação de saque...</p>;
  }
  if (withdrawalQuery.isError || !withdrawalQuery.data) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
        <AlertCircle className="size-4" /> Não foi possível carregar esta solicitação.
      </div>
    );
  }

  const withdrawal = withdrawalQuery.data;
  const actionInFlight =
    approveMutation.isPending || paidMutation.isPending || rejectMutation.isPending;
  const reasonLength = note.trim().length;
  const reasonIsValid = reasonLength >= MIN_REASON_LENGTH;

  return (
    <div className="space-y-6">
      <Link
        href="/financeiro/saques"
        className="flex w-fit items-center gap-1 text-sm text-muted-foreground"
      >
        <ChevronLeft className="size-4" /> Voltar para fila de saques
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Saque de {withdrawal.driver.name}</h1>
          <p className="text-sm text-muted-foreground">
            Solicitado em {dateFormatter.format(new Date(withdrawal.createdAt))} ·{' '}
            {withdrawal.driver.email}
          </p>
        </div>
        <Badge variant={statusVariant(withdrawal.status)}>{statusLabel[withdrawal.status]}</Badge>
      </header>

      <section className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Valores</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">Solicitado</span>
              <strong>{money(withdrawal.requestedAmount)}</strong>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">Taxa</span>
              <span>{money(withdrawal.feeAmount)}</span>
            </div>
            <div className="flex justify-between gap-3 border-t pt-2">
              <span className="text-muted-foreground">Líquido a pagar</span>
              <strong>{money(withdrawal.netAmount)}</strong>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Destino de pagamento</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div>
              <p className="text-muted-foreground">Titular</p>
              <p>{withdrawal.accountHolderName ?? withdrawal.driver.name}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Chave PIX</p>
              <p className="break-all font-medium">{withdrawal.pixKey ?? 'Não informado'}</p>
              <p className="text-xs text-muted-foreground">{withdrawal.pixKeyType ?? '—'}</p>
            </div>
            {withdrawal.paymentReference && (
              <div>
                <p className="text-muted-foreground">Referência registrada</p>
                <p className="break-all">{withdrawal.paymentReference}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Controle</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              <span className="text-muted-foreground">ID da solicitação: </span>
              <span className="break-all font-mono text-xs">{withdrawal.id}</span>
            </p>
            <p>
              <span className="text-muted-foreground">Taxa aplicada: </span>
              R$ 0,00 (regra de saque semanal)
            </p>
          </CardContent>
        </Card>
      </section>

      {(withdrawal.status === 'PENDING' || withdrawal.status === 'APPROVED') && (
        <Card>
          <CardHeader>
            <CardTitle>Ação administrativa</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="withdrawal-note">
                {withdrawal.status === 'PENDING'
                  ? 'Motivo da aprovação ou rejeição'
                  : 'Motivo do pagamento ou da rejeição'}
              </Label>
              <textarea
                id="withdrawal-note"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Registre o motivo desta decisão para a auditoria"
                rows={3}
                maxLength={1_000}
                className="flex w-full rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50"
              />
              <p
                className={`text-xs ${reasonIsValid || reasonLength === 0 ? 'text-muted-foreground' : 'text-destructive'}`}
              >
                Mínimo de {MIN_REASON_LENGTH} caracteres para registrar a decisão. ({reasonLength}/
                {MIN_REASON_LENGTH})
              </p>
            </div>
            {withdrawal.status === 'APPROVED' && (
              <div className="space-y-1">
                <Label htmlFor="withdrawal-reference">
                  Referência ou comprovante do pagamento (opcional)
                </Label>
                <Input
                  id="withdrawal-reference"
                  value={paymentReference}
                  onChange={(event) => setPaymentReference(event.target.value)}
                  placeholder="Ex.: ID PIX, protocolo ou URL interna"
                />
              </div>
            )}
            {actionError && <p className="text-sm text-destructive">{actionError}</p>}
            <div className="flex flex-wrap gap-2">
              {withdrawal.status === 'PENDING' && (
                <ConfirmActionDialog
                  title="Aprovar este saque?"
                  description={`O saque de ${money(withdrawal.netAmount)} ficará liberado para a etapa de pagamento.`}
                  consequence="Esta aprovação não registra uma transferência. Depois de pagar o PIX, ainda será necessário marcar o saque como pago."
                  confirmLabel="Confirmar aprovação"
                  pendingLabel="Aprovando..."
                  onConfirm={() => approveMutation.mutateAsync()}
                >
                  <Button disabled={actionInFlight || !reasonIsValid}>Aprovar saque</Button>
                </ConfirmActionDialog>
              )}
              {withdrawal.status === 'APPROVED' && (
                <ConfirmActionDialog
                  title="Confirmar que o saque foi pago?"
                  description={`Confirme somente depois de transferir ${money(withdrawal.netAmount)} para a chave PIX exibida nesta página.`}
                  consequence="A confirmação finaliza o lançamento pendente no ledger e registra o saque como pago no histórico auditável."
                  confirmLabel="Confirmar pagamento"
                  pendingLabel="Registrando..."
                  onConfirm={() => paidMutation.mutateAsync()}
                >
                  <Button disabled={actionInFlight || !reasonIsValid}>Marcar como pago</Button>
                </ConfirmActionDialog>
              )}
              <ConfirmActionDialog
                title="Rejeitar este saque?"
                description={`O saque de ${money(withdrawal.requestedAmount)} será rejeitado.`}
                consequence="O lançamento pendente será cancelado e o valor solicitado voltará ao saldo disponível do motoboy. A justificativa ficará no histórico."
                confirmLabel="Rejeitar e devolver saldo"
                pendingLabel="Rejeitando..."
                variant="destructive"
                onConfirm={() => rejectMutation.mutateAsync()}
              >
                <Button variant="destructive" disabled={actionInFlight || !reasonIsValid}>
                  Rejeitar e devolver saldo
                </Button>
              </ConfirmActionDialog>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Histórico auditável</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {withdrawal.statusHistory.map((entry) => (
            <div key={`${entry.toStatus}-${entry.changedAt}`} className="border-l-2 pl-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={statusVariant(entry.toStatus)}>{statusLabel[entry.toStatus]}</Badge>
                <span className="text-sm">{dateFormatter.format(new Date(entry.changedAt))}</span>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {entry.changedBy ? `Por ${entry.changedBy.name}` : 'Ação automática do sistema'}
              </p>
              {entry.note && <p className="mt-1 text-sm">{entry.note}</p>}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
