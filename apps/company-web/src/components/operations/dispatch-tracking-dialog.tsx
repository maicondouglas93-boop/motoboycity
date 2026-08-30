'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { DispatchTrackingPanel } from './dispatch-tracking-panel';

/**
 * O acompanhamento como janela própria, para quem cria o pedido a partir de um
 * formulário que continua na tela.
 *
 * `CallDriverDialog` não usa isto: lá o formulário e o acompanhamento são a
 * mesma janela, que troca de conteúdo. Aqui a janela abre por cima do
 * formulário completo, que a loja quer encontrar do jeito que deixou.
 */
export function DispatchTrackingDialog({
  open,
  onOpenChange,
  token,
  deliveryIds,
  batchId,
  creating,
  detailHref = (id) => `/pedidos/${id}`,
  allowActions = true,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  deliveryIds: string[];
  batchId: string | null;
  creating: boolean;
  detailHref?: (deliveryId: string) => string;
  allowActions?: boolean;
}) {
  const [error, setError] = useState<string | null>(null);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setError(null);
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Acompanhando</DialogTitle>
        </DialogHeader>

        <DialogBody className="space-y-3">
          <DispatchTrackingPanel
            token={token}
            deliveryIds={deliveryIds}
            batchId={batchId}
            creating={creating}
            allowActions={allowActions}
            detailHref={detailHref}
            onError={setError}
          />
          {error && <p className="text-center text-sm text-destructive">{error}</p>}
        </DialogBody>

        <DialogFooter>
          {/*
            Só fechar. O pedido não some ao fechar — ele vive na central, e é
            de lá que a loja acompanha o resto do dia.
          */}
          <Button type="button" className="w-full" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
