'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { MinusCircle, PlusCircle } from 'lucide-react';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ActionFeedback } from '@/components/ui/action-feedback';
import { PendingButtonLabel } from '@/components/ui/pending-button-label';
import { adminFinancialApi } from '@/lib/api-client';
import { useMoney } from '@/lib/money';

/** O servidor exige 10 caracteres; a tela avisa antes de deixar enviar. */
const MINIMO_DO_MOTIVO = 10;

/**
 * Ajuste manual na carteira de um entregador.
 *
 * Existe porque erro de repasse, cobrança indevida e acerto combinado
 * acontecem, e sem isto a única saída seria escrever SQL no banco — sem motivo
 * registrado, sem autor, e sem aparecer no extrato do motoboy.
 *
 * A tela é deliberadamente chata de usar: pede confirmação do valor por
 * extenso na descrição, exige motivo, e diz em voz alta o que vai acontecer.
 * Mexer no dinheiro de alguém não deve ser um clique rápido.
 */
export function WalletAdjustmentDialog({
  token,
  driverId,
  driverName,
  saldoAtual,
}: {
  token: string;
  driverId: string;
  driverName: string;
  saldoAtual: number;
}) {
  const money = useMoney();
  const queryClient = useQueryClient();
  const [aberto, setAberto] = useState(false);
  const [tipo, setTipo] = useState<'CREDIT' | 'DEBIT'>('CREDIT');
  const [valor, setValor] = useState('');
  const [motivo, setMotivo] = useState('');
  const [erro, setErro] = useState<string | null>(null);

  const valorNumerico = Number(valor.replace(',', '.'));
  const valorValido = Number.isFinite(valorNumerico) && valorNumerico > 0;
  const motivoValido = motivo.trim().length >= MINIMO_DO_MOTIVO;

  /**
   * O saldo depois do ajuste, mostrado ANTES de confirmar.
   *
   * É a única forma de o admin perceber que digitou 500 em vez de 50 — o
   * número final é mais fácil de reconhecer como errado que o valor digitado.
   */
  const saldoDepois = valorValido
    ? tipo === 'CREDIT'
      ? saldoAtual + valorNumerico
      : saldoAtual - valorNumerico
    : saldoAtual;

  const ajustar = useMutation({
    mutationFn: () =>
      adminFinancialApi.adjustDriverWallet(token, driverId, {
        type: tipo,
        amount: valorNumerico,
        reason: motivo.trim(),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'financial'] });
      setAberto(false);
      setValor('');
      setMotivo('');
      setErro(null);
    },
    onError: (falha: unknown) => {
      setErro(falha instanceof Error ? falha.message : 'Não foi possível lançar o ajuste.');
    },
  });

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      {/* Base UI usa `render`, e nao `asChild` como o Radix. */}
      <DialogTrigger
        render={
          <Button variant="outline" size="sm">
            Ajustar saldo
          </Button>
        }
      />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Ajustar a carteira de {driverName}</DialogTitle>
          <DialogDescription>
            O ajuste vira um lançamento novo no extrato, com o seu nome e o motivo. Nada é apagado:
            um ajuste errado se corrige com outro, e os dois ficam visíveis.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setTipo('CREDIT')}
              className={`flex items-center justify-center gap-2 rounded-lg border p-3 text-sm font-medium transition ${
                tipo === 'CREDIT'
                  ? 'border-dinheiro-recebido bg-dinheiro-recebido-suave text-dinheiro-recebido'
                  : 'border-border text-muted-foreground hover:bg-accent'
              }`}
            >
              <PlusCircle aria-hidden className="size-4" />
              Creditar
            </button>
            <button
              type="button"
              onClick={() => setTipo('DEBIT')}
              className={`flex items-center justify-center gap-2 rounded-lg border p-3 text-sm font-medium transition ${
                tipo === 'DEBIT'
                  ? 'border-dinheiro-atrasado bg-dinheiro-atrasado-suave text-dinheiro-atrasado'
                  : 'border-border text-muted-foreground hover:bg-accent'
              }`}
            >
              <MinusCircle aria-hidden className="size-4" />
              Debitar
            </button>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ajuste-valor">Valor</Label>
            <Input
              id="ajuste-valor"
              inputMode="decimal"
              placeholder="0,00"
              value={valor}
              onChange={(evento) => setValor(evento.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ajuste-motivo">Motivo</Label>
            <textarea
              id="ajuste-motivo"
              rows={3}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="Ex.: repasse do pedido #1173 saiu R$ 5,00 a menos"
              value={motivo}
              onChange={(evento) => setMotivo(evento.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              O motoboy vê este texto no extrato dele. Escreva para ele entender.
              {motivo.trim().length > 0 && motivo.trim().length < MINIMO_DO_MOTIVO && (
                <span className="text-destructive">
                  {' '}
                  Faltam {MINIMO_DO_MOTIVO - motivo.trim().length} caractere(s).
                </span>
              )}
            </p>
          </div>

          {valorValido && (
            <div className="rounded-lg bg-dinheiro-retido-suave p-3 text-sm">
              <p className="text-muted-foreground">
                Saldo agora: <span className="font-mono">{money(saldoAtual)}</span>
              </p>
              <p className="font-medium">
                Depois do ajuste:{' '}
                <span
                  className={`font-mono ${saldoDepois < 0 ? 'text-dinheiro-atrasado' : 'text-dinheiro-recebido'}`}
                >
                  {money(saldoDepois)}
                </span>
              </p>
              {saldoDepois < 0 && (
                <p className="mt-1 text-xs text-dinheiro-atrasado">
                  O saldo fica negativo — o entregador passa a dever este valor. Isso é permitido e
                  fica visível na carteira dele.
                </p>
              )}
            </div>
          )}

          {erro && (
            <ActionFeedback tone="error" title="Não foi possível lançar o ajuste">
              {erro}
            </ActionFeedback>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setAberto(false)}>
            Cancelar
          </Button>
          <Button
            onClick={() => ajustar.mutate()}
            disabled={!valorValido || !motivoValido || ajustar.isPending}
          >
            <PendingButtonLabel pending={ajustar.isPending} pendingLabel="Lançando...">
              Lançar ajuste
            </PendingButtonLabel>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
