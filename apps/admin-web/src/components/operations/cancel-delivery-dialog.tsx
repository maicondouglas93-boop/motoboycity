'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Ban } from 'lucide-react';
import { ApiError } from '@motoboycity/api-client';
import type { DeliveryStatus } from '@motoboycity/types';
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
import { Label } from '@/components/ui/label';
import { deliveriesApi } from '@/lib/api-client';
import { statusLabel } from '@/components/orders/status-chip';

/**
 * Cancelar um pedido, com confirmação e motivo.
 *
 * Antes era um clique direto no painel lateral, sem pergunta e sem registro.
 * Cancelar entrega é irreversível e pode pegar um pedido que já está na rua —
 * o motoboy simplesmente vê a corrida sumir.
 */
export function CancelDeliveryDialog({
  token,
  deliveryId,
  displayNumber,
  companyName,
  status,
  driverName,
}: {
  token: string;
  deliveryId: string;
  displayNumber: number;
  companyName: string;
  status: DeliveryStatus;
  driverName?: string | null;
}) {
  const [aberto, setAberto] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const queryClient = useQueryClient();

  /**
   * Depois do aceite existe um motoboy do outro lado.
   *
   * A consequência muda de "some da fila" para "alguém que está dirigindo
   * perde a corrida", e a tela precisa dizer isso antes do clique.
   */
  const jaTemMotoboy = !['SCHEDULED', 'AWAITING_DRIVER'].includes(status);

  const cancelar = useMutation({
    mutationFn: () => deliveriesApi.cancel(token, deliveryId, motivo.trim() || undefined),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'operations'] });
      void queryClient.invalidateQueries({ queryKey: ['admin', 'deliveries'] });
      setAberto(false);
      setMotivo('');
      setErro(null);
    },
    onError: (error) => {
      setErro(
        error instanceof ApiError ? error.message : 'Não foi possível cancelar o pedido.',
      );
    },
  });

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger
        render={
          <Button size="sm" variant="destructive">
            <Ban aria-hidden className="size-3.5" />
            Cancelar
          </Button>
        }
      />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Cancelar o pedido #{displayNumber}</DialogTitle>
          <DialogDescription>
            {companyName} · {statusLabel(status)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* A consequencia vem antes do campo: quem le isto ainda pode desistir. */}
          <div
            className={`rounded-lg p-3 text-sm ${
              jaTemMotoboy
                ? 'bg-dinheiro-atrasado-suave text-dinheiro-atrasado'
                : 'bg-dinheiro-aguardando-suave text-dinheiro-aguardando'
            }`}
          >
            <p className="font-medium">O que acontece ao cancelar</p>
            <p className="mt-1 text-muted-foreground">
              {jaTemMotoboy ? (
                <>
                  Este pedido já está com{' '}
                  <strong>{driverName ?? 'um motoboy'}</strong>. A corrida vai sumir do aplicativo
                  dele sem aviso, e o pedido não pode ser reaberto — a loja precisa lançar outro.
                </>
              ) : (
                <>
                  O pedido sai da fila e a oferta em aberto é encerrada. Não pode ser reaberto — a
                  loja precisa lançar outro.
                </>
              )}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cancelar-pedido-motivo">Motivo</Label>
            <textarea
              id="cancelar-pedido-motivo"
              rows={3}
              maxLength={300}
              placeholder="Ex.: cliente desistiu, loja pediu por telefone"
              className="w-full rounded-lg border border-input bg-card/90 px-3 py-2 text-sm shadow-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/15"
              value={motivo}
              onChange={(event) => setMotivo(event.target.value)}
            />
            {/*
              O servidor aceita sem motivo — a loja cancela pelo aplicativo em
              segundos. Aqui a tela exige, porque quem cancela entrega dos
              outros precisa deixar dito por que.
            */}
            <p className="text-xs text-muted-foreground">
              Fica registrado no histórico do pedido, junto com seu nome.
            </p>
          </div>

          {erro && <p className="text-sm text-destructive">{erro}</p>}
        </div>

        <DialogFooter>
          <DialogClose render={<Button variant="outline">Voltar</Button>} />
          <Button
            variant="destructive"
            onClick={() => cancelar.mutate()}
            disabled={cancelar.isPending || motivo.trim().length < 3}
          >
            {cancelar.isPending ? 'Cancelando...' : 'Cancelar pedido'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
