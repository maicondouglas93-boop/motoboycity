'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Ban } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { adminInvoicesApi } from '@/lib/api-client';
import { useMoney } from '@/lib/money';

/** O servidor exige 10 caracteres; a tela avisa antes de deixar enviar. */
const MINIMO_DO_MOTIVO = 10;

/**
 * Cancela uma fatura emitida errada.
 *
 * O texto diz em voz alta o que vai acontecer com as entregas, porque essa é a
 * parte que ninguém adivinha: elas voltam para "sem fatura" e entram no
 * próximo fechamento. Sem essa frase, o admin cancela achando que está
 * apagando a cobrança.
 */
export function CancelInvoiceDialog({
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
  const queryClient = useQueryClient();
  const [aberto, setAberto] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [erro, setErro] = useState<string | null>(null);

  const motivoValido = motivo.trim().length >= MINIMO_DO_MOTIVO;

  const cancelar = useMutation({
    mutationFn: () => adminInvoicesApi.cancel(token, invoiceId, { reason: motivo.trim() }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'financial'] });
      setAberto(false);
      setMotivo('');
      setErro(null);
    },
    onError: (falha: unknown) => {
      setErro(falha instanceof Error ? falha.message : 'Não foi possível cancelar a fatura.');
    },
  });

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm">
            <Ban aria-hidden className="size-3.5" />
            Cancelar
          </Button>
        }
      />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Cancelar a fatura {invoiceNumber}</DialogTitle>
          <DialogDescription>
            {companyName} · {money(totalValue)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/*
            A consequencia vem antes do campo, e nao depois do botao: quem le
            isto ainda pode desistir.
          */}
          <div className="rounded-lg bg-dinheiro-aguardando-suave p-3 text-sm">
            <p className="font-medium text-dinheiro-aguardando">O que acontece ao cancelar</p>
            <p className="mt-1 text-muted-foreground">
              {deliveryCount > 0 ? (
                <>
                  As <strong>{deliveryCount} entrega(s)</strong> desta fatura voltam para “sem
                  fatura” e entram no próximo fechamento semanal. A cobrança não é perdida — ela é
                  reaberta.
                </>
              ) : (
                <>
                  A fatura fica cancelada e mantém número e histórico. Nada é apagado do sistema.
                </>
              )}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cancelar-motivo">Motivo</Label>
            <textarea
              id="cancelar-motivo"
              rows={3}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="Ex.: fatura emitida em duplicidade para a mesma semana"
              value={motivo}
              onChange={(evento) => setMotivo(evento.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Fica no histórico da fatura, com o seu nome.
              {motivo.trim().length > 0 && motivo.trim().length < MINIMO_DO_MOTIVO && (
                <span className="text-destructive">
                  {' '}
                  Faltam {MINIMO_DO_MOTIVO - motivo.trim().length} caractere(s).
                </span>
              )}
            </p>
          </div>

          {erro && <p className="text-sm text-destructive">{erro}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setAberto(false)}>
            Voltar
          </Button>
          <Button
            variant="destructive"
            onClick={() => cancelar.mutate()}
            disabled={!motivoValido || cancelar.isPending}
          >
            {cancelar.isPending ? 'Cancelando...' : 'Cancelar fatura'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
