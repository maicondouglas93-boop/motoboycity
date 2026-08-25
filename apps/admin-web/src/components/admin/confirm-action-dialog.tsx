'use client';

import { useState, type ReactElement, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { ActionFeedback } from '@/components/ui/action-feedback';
import { PendingButtonLabel } from '@/components/ui/pending-button-label';
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

interface ConfirmActionDialogProps {
  children: ReactElement;
  title: string;
  description: string;
  consequence?: ReactNode;
  confirmLabel: string;
  pendingLabel?: string;
  variant?: 'default' | 'destructive';
  onConfirm: () => Promise<unknown>;
}

export function ConfirmActionDialog({
  children,
  title,
  description,
  consequence,
  confirmLabel,
  pendingLabel = 'Confirmando...',
  variant = 'default',
  onConfirm,
}: ConfirmActionDialogProps) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    setPending(true);
    setError(null);

    try {
      await onConfirm();
      setOpen(false);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : 'Não foi possível concluir a ação. Tente novamente.',
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (pending) return;
        setOpen(nextOpen);
        if (!nextOpen) setError(null);
      }}
    >
      <DialogTrigger render={children} />
      <DialogContent className="max-w-lg" closeDisabled={pending}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-4">
          {consequence && (
            <ActionFeedback tone="warning" title="Antes de confirmar">
              {consequence}
            </ActionFeedback>
          )}
          {error && (
            <ActionFeedback tone="error" title="Não foi possível concluir">
              {error}
            </ActionFeedback>
          )}
        </DialogBody>

        <DialogFooter className="flex justify-end gap-2">
          <DialogClose render={<Button variant="outline">Voltar</Button>} />
          <Button variant={variant} onClick={() => void handleConfirm()} disabled={pending}>
            <PendingButtonLabel pending={pending} pendingLabel={pendingLabel}>
              {confirmLabel}
            </PendingButtonLabel>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
