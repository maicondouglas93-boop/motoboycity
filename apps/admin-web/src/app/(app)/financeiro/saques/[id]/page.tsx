'use client';

import Link from 'next/link';
import { use, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { WithdrawalRequestStatus } from '@motoboycity/types';
import { AlertCircle, ChevronLeft } from 'lucide-react';
import { ApiError } from '@motoboycity/api-client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { adminFinancialApi } from '@/lib/api-client';
import { session } from '@/lib/session';
import { useMoney } from '@/lib/money';

const dateFormatter = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short' });

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
    return Promise.all([
      queryClient.invalidateQueries({ queryKey: ['admin', 'financial', 'withdrawal', id] }),
      queryClient.invalidateQueries({ queryKey: ['admin', 'financial', 'withdrawals'] }),
      queryClient.invalidateQueries({ queryKey: ['admin', 'financial', 'overview'] }),
      queryClient.invalidateQueries({ queryKey: ['admin', 'financial', 'driver-wallets'] }),
    ]);
  }

  const approveMutation = useMutation({
    mutationFn: () =>
      adminFinancialApi.approveWithdrawal(token as string, id, {
        ...(note.trim() && { note: note.trim() }),
      }),
    onSuccess: async () => {
      setNote('');
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
        ...(note.trim() && { note: note.trim() }),
        ...(paymentReference.trim() && { paymentReference: paymentReference.trim() }),
      }),
    onSuccess: async () => {
      setNote('');
      setPaymentReference('');
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
    onSuccess: async () => {
      setNote('');
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

  function reject() {
    if (note.trim().length < 3) {
      setActionError('Informe um motivo de pelo menos três caracteres para rejeitar o saque.');
      return;
    }
    setActionError(null);
    rejectMutation.mutate();
  }

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
                  ? 'Observação de aprovação ou motivo da rejeição'
                  : 'Observação do pagamento ou motivo da rejeição'}
              </Label>
              <Input
                id="withdrawal-note"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Registre um contexto para a auditoria"
              />
            </div>
            {withdrawal.status === 'APPROVED' && (
              <div className="space-y-1">
                <Label htmlFor="withdrawal-reference">Referência ou comprovante do pagamento</Label>
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
                <Button
                  disabled={actionInFlight}
                  onClick={() => {
                    setActionError(null);
                    approveMutation.mutate();
                  }}
                >
                  {approveMutation.isPending ? 'Aprovando...' : 'Aprovar saque'}
                </Button>
              )}
              {withdrawal.status === 'APPROVED' && (
                <Button
                  disabled={actionInFlight}
                  onClick={() => {
                    setActionError(null);
                    paidMutation.mutate();
                  }}
                >
                  {paidMutation.isPending ? 'Registrando...' : 'Marcar como pago'}
                </Button>
              )}
              <Button variant="destructive" disabled={actionInFlight} onClick={reject}>
                {rejectMutation.isPending ? 'Rejeitando...' : 'Rejeitar e devolver saldo'}
              </Button>
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
