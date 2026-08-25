'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2 } from 'lucide-react';
import { ApiError } from '@motoboycity/api-client';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
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
import { useMoney } from '@/lib/money';

/**
 * Hoje no FUSO DA OPERAÇÃO.
 *
 * A tela usava `new Date().toISOString().slice(0, 10)`, que é hoje em UTC:
 * entre 21h e meia-noite em São Paulo o campo já vinha preenchido com a data de
 * amanhã. Conferir pagamento à noite é comum, e ninguém desconfia de um campo
 * que já veio preenchido.
 */
function hoje(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
}

/**
 * Dar baixa numa fatura, com confirmação.
 *
 * Era um botão solto: um clique e a dívida da empresa desaparecia. Não existe
 * desfazer pela tela — para reverter é preciso cancelar a fatura, o que devolve
 * as entregas para cobrança e obriga a fechar tudo de novo.
 */
export function MarkPaidDialog({
  token,
  invoiceId,
  invoiceNumber,
  companyName,
  totalValue,
  deliveryCount,
}: {
  token: string;
  invoiceId: string;
  invoiceNumber: string;
  companyName: string;
  totalValue: number;
  deliveryCount: number;
}) {
  const money = useMoney();
  const [aberto, setAberto] = useState(false);
  const [paymentDate, setPaymentDate] = useState(hoje);
  const [paymentMethod, setPaymentMethod] = useState<'BILLED' | 'ONLINE'>('BILLED');
  const [erro, setErro] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const confirmar = useMutation({
    mutationFn: () => adminInvoicesApi.markPaid(token, invoiceId, { paymentDate, paymentMethod }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'invoice', invoiceId] });
      void queryClient.invalidateQueries({ queryKey: ['admin', 'invoices'] });
      void queryClient.invalidateQueries({ queryKey: ['admin', 'financial'] });
      void queryClient.invalidateQueries({ queryKey: ['admin', 'payment-notices'] });
      setAberto(false);
      setErro(null);
    },
    onError: (error) =>
      setErro(
        error instanceof ApiError ? error.message : 'Não foi possível confirmar o pagamento.',
      ),
  });

  /** Data no futuro não existe em conferência de extrato. */
  const dataNoFuturo = paymentDate > hoje();

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger
        render={
          <Button>
            <CheckCircle2 aria-hidden className="size-4" />
            Marcar como paga
          </Button>
        }
      />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Dar baixa na {invoiceNumber}</DialogTitle>
          <DialogDescription>
            {companyName} · {deliveryCount} pedido(s)
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/*
            O valor e a empresa aparecem grandes de proposito. O clique errado
            aqui nao e no botao — e na fatura errada, e as faturas se parecem.
          */}
          <div className="rounded-lg bg-dinheiro-recebido-suave p-3">
            <p className="text-sm text-muted-foreground">Valor que será dado como recebido</p>
            <p className="font-mono text-2xl font-semibold text-dinheiro-recebido">
              {money(totalValue)}
            </p>
          </div>

          <div className="rounded-lg bg-dinheiro-aguardando-suave p-3 text-sm">
            <p className="font-medium text-dinheiro-aguardando">O que acontece</p>
            <p className="mt-1 text-muted-foreground">
              A fatura sai da lista de pendentes e deixa de aparecer como valor em aberto — aqui e
              no painel da loja. <strong>Não há desfazer nesta tela:</strong> para reverter é
              preciso cancelar a fatura, o que devolve os pedidos para cobrança.
            </p>
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="baixa-data">Data do pagamento</Label>
              <Input
                id="baixa-data"
                type="date"
                max={hoje()}
                value={paymentDate}
                onChange={(event) => setPaymentDate(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="baixa-forma">Forma</Label>
              <select
                id="baixa-forma"
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                value={paymentMethod}
                onChange={(event) => setPaymentMethod(event.target.value as 'BILLED' | 'ONLINE')}
              >
                <option value="BILLED">Manual / faturado</option>
                <option value="ONLINE">Online</option>
              </select>
            </div>
          </div>

          {dataNoFuturo && (
            <ActionFeedback tone="warning" compact title="Confira a data">
              A data do pagamento está no futuro. Confira antes de confirmar.
            </ActionFeedback>
          )}
          {erro && (
            <ActionFeedback tone="error" title="Não foi possível confirmar o recebimento">
              {erro}
            </ActionFeedback>
          )}
        </div>

        <DialogFooter>
          <DialogClose render={<Button variant="outline">Voltar</Button>} />
          <Button onClick={() => confirmar.mutate()} disabled={confirmar.isPending || dataNoFuturo}>
            <PendingButtonLabel pending={confirmar.isPending} pendingLabel="Confirmando...">
              Confirmar recebimento
            </PendingButtonLabel>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
