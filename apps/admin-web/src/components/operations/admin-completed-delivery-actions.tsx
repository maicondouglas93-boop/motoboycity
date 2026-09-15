'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Lock, FileEdit, Trash2, AlertTriangle } from 'lucide-react';
import { adminDeliveriesApi } from '@/lib/api-client';
import { ApiError } from '@motoboycity/api-client';
import type { DeliveryDetail } from '@motoboycity/types';

interface AdminCompletedDeliveryActionsProps {
  token: string;
  delivery: DeliveryDetail;
}

const lockedReasons = {
  INVOICED: 'Este pedido já foi faturado.',
  DRIVER_REPASSE_NOT_PENDING: 'O repasse ao entregador já foi processado ou não está pendente.',
  DELIVERY_NOT_COMPLETED: 'Apenas pedidos concluídos podem ser ajustados por esta opção.',
};

export function AdminCompletedDeliveryActions({ token, delivery }: AdminCompletedDeliveryActionsProps) {
  const queryClient = useQueryClient();
  
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  
  const [updateOpen, setUpdateOpen] = useState(false);
  const [updateReason, setUpdateReason] = useState('');
  const [totalValue, setTotalValue] = useState(delivery.totalValue?.toString() ?? '');
  const [driverValue, setDriverValue] = useState(delivery.driverValue?.toString() ?? '');

  const { financialAdjustment } = delivery;

  // Se não tem a flag (versões antigas de API ou nulo), não renderiza.
  if (!financialAdjustment) return null;

  const isLocked = !financialAdjustment.allowed;
  const lockMessage = financialAdjustment.blockedReason ? lockedReasons[financialAdjustment.blockedReason] : '';

  const cancelMutation = useMutation({
    mutationFn: async () => {
      return adminDeliveriesApi.cancelCompleted(token, delivery.id, { reason: cancelReason });
    },
    onSuccess: (updatedDelivery) => {
      queryClient.setQueryData(['delivery', delivery.id], updatedDelivery);
      setCancelOpen(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      return adminDeliveriesApi.updateValues(token, delivery.id, {
        reason: updateReason,
        totalValue: Number(totalValue),
        driverValue: Number(driverValue),
      });
    },
    onSuccess: (updatedDelivery) => {
      queryClient.setQueryData(['delivery', delivery.id], updatedDelivery);
      setUpdateOpen(false);
    },
  });

  return (
    <>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          className={isLocked ? 'text-muted-foreground' : ''}
          onClick={() => {
            if (!isLocked) {
              setTotalValue(delivery.totalValue?.toString() ?? '');
              setDriverValue(delivery.driverValue?.toString() ?? '');
              setUpdateReason('');
              setUpdateOpen(true);
            }
          }}
          title={isLocked ? lockMessage : 'Ajustar valores financeiros'}
        >
          <FileEdit className="mr-2 size-4" />
          Ajustar Valores
          {isLocked && <Lock className="ml-2 size-3" />}
        </Button>

        <Button
          variant="destructive"
          size="sm"
          className={isLocked ? 'opacity-70' : ''}
          onClick={() => !isLocked && setCancelOpen(true)}
          title={isLocked ? lockMessage : 'Cancelar pedido concluído'}
        >
          <Trash2 className="mr-2 size-4" />
          Cancelar Concluído
          {isLocked && <Lock className="ml-2 size-3" />}
        </Button>
      </div>

      {/* MODAL DE ATUALIZAR VALORES */}
      <Dialog open={updateOpen} onOpenChange={setUpdateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ajustar Valores do Pedido</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            <div className="rounded-lg border border-warning/50 bg-warning/10 p-3 text-sm text-warning-foreground">
              <div className="flex gap-2">
                <AlertTriangle className="size-5 shrink-0" />
                <p>
                  Esta é uma operação financeira. O repasse do entregador sofrerá ajuste atômico imediato, 
                  e a fatura da empresa considerará o novo valor.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="total-value">Valor Empresa (R$)</Label>
                <Input
                  id="total-value"
                  type="number"
                  step="0.01"
                  min="0"
                  value={totalValue}
                  onChange={(e) => setTotalValue(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="driver-value">Valor Entregador (R$)</Label>
                <Input
                  id="driver-value"
                  type="number"
                  step="0.01"
                  min="0"
                  value={driverValue}
                  onChange={(e) => setDriverValue(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="update-reason">Motivo (Obrigatório)</Label>
              <textarea
                id="update-reason"
                rows={3}
                placeholder="Por que os valores estão sendo alterados manualmente?"
                value={updateReason}
                className="w-full rounded-lg border border-input bg-card/90 px-3 py-2 text-sm shadow-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/15"
                onChange={(e) => setUpdateReason(e.target.value)}
              />
            </div>
            {updateMutation.isError && (
              <p className="text-sm text-destructive">
                {updateMutation.error instanceof ApiError
                  ? updateMutation.error.message
                  : 'Erro ao atualizar valores.'}
              </p>
            )}
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="outline">Voltar</Button>} />
            <Button
              onClick={() => updateMutation.mutate()}
              disabled={updateMutation.isPending || updateReason.trim().length < 5 || !totalValue || !driverValue}
            >
              {updateMutation.isPending ? 'Salvando...' : 'Salvar Ajuste'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL DE CANCELAR PEDIDO */}
      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancelar Pedido Concluído</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive-foreground">
              <div className="flex gap-2">
                <AlertTriangle className="size-5 shrink-0" />
                <p>
                  O repasse de <strong>{delivery.driverValue ? `R$ ${delivery.driverValue}` : 'valor'}</strong> será removido do saldo do entregador, 
                  o pedido será marcado como CANCELADO e a loja não será cobrada.
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="cancel-reason">Motivo do Cancelamento (Obrigatório)</Label>
              <textarea
                id="cancel-reason"
                rows={3}
                placeholder="Por que este pedido está sendo cancelado após a conclusão?"
                value={cancelReason}
                className="w-full rounded-lg border border-input bg-card/90 px-3 py-2 text-sm shadow-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/15"
                onChange={(e) => setCancelReason(e.target.value)}
              />
            </div>
            {cancelMutation.isError && (
              <p className="text-sm text-destructive">
                {cancelMutation.error instanceof ApiError
                  ? cancelMutation.error.message
                  : 'Erro ao cancelar o pedido.'}
              </p>
            )}
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="outline">Voltar</Button>} />
            <Button
              variant="destructive"
              onClick={() => cancelMutation.mutate()}
              disabled={cancelMutation.isPending || cancelReason.trim().length < 5}
            >
              {cancelMutation.isPending ? 'Cancelando...' : 'Confirmar Cancelamento'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
