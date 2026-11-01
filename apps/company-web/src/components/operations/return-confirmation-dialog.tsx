'use client';

import { ArrowRight, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface ReturnConfirmationFieldsProps {
  defaultRequiresReturn?: boolean;
  disabled?: boolean;
  onConfirm: (requiresReturn: boolean) => void;
  onBack: () => void;
}

export function returnConfirmationCopy(deliveryCount = 1) {
  const isBatch = deliveryCount > 1;
  return {
    title: isBatch ? 'Este lote tem volta?' : 'Este pedido tem volta?',
    description: isBatch
      ? `Antes de finalizar as ${deliveryCount} entregas, confirme se o motoboy precisa voltar à loja após concluir o roteiro.`
      : 'Antes de finalizar, confirme se o motoboy precisa voltar à loja após a entrega.',
  };
}

/**
 * Conteúdo reutilizável da pergunta de retorno antes de criar pedido/lote.
 * Pode ser usado tanto dentro de um `Dialog` próprio (formulários da página)
 * quanto como etapa interna de um modal já aberto (`CallDriverDialog`).
 */
export function ReturnConfirmationStep({
  defaultRequiresReturn = false,
  disabled = false,
  onConfirm,
  onBack,
}: ReturnConfirmationFieldsProps) {
  return (
    <>
      <DialogBody className="space-y-4">
        <div className="rounded-xl border border-portal/20 bg-portal-soft/50 p-3.5 text-sm text-foreground">
          <p className="font-medium text-portal-deep">
            Marque <strong>Sim, com volta</strong> quando o entregador precisar retornar ao local de
            coleta — por exemplo, para devolver maquininha, dinheiro em espécie, documento assinado
            ou mercadoria de troca.
          </p>
          {defaultRequiresReturn && (
            <p className="mt-2 text-xs text-muted-foreground">
              O retorno já estava marcado no formulário. Confirme abaixo para concluir o envio.
            </p>
          )}
        </div>

        <div className="grid gap-2.5 sm:grid-cols-2">
          <Button
            type="button"
            variant="outline"
            size="lg"
            disabled={disabled}
            className="w-full justify-center"
            onClick={() => onConfirm(false)}
          >
            <ArrowRight className="size-4" aria-hidden="true" />
            Não, sem volta
          </Button>
          <Button
            type="button"
            variant="default"
            size="lg"
            disabled={disabled}
            className="w-full justify-center"
            onClick={() => onConfirm(true)}
          >
            <RotateCcw className="size-4" aria-hidden="true" />
            Sim, com volta
          </Button>
        </div>
      </DialogBody>

      <DialogFooter className="flex justify-end">
        <Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={onBack}>
          Voltar e revisar
        </Button>
      </DialogFooter>
    </>
  );
}

interface ReturnConfirmationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deliveryCount?: number;
  defaultRequiresReturn?: boolean;
  disabled?: boolean;
  onConfirm: (requiresReturn: boolean) => void;
}

export function ReturnConfirmationDialog({
  open,
  onOpenChange,
  deliveryCount = 1,
  defaultRequiresReturn = false,
  disabled = false,
  onConfirm,
}: ReturnConfirmationDialogProps) {
  const copy = returnConfirmationCopy(deliveryCount);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>{copy.description}</DialogDescription>
        </DialogHeader>
        <ReturnConfirmationStep
          defaultRequiresReturn={defaultRequiresReturn}
          disabled={disabled}
          onConfirm={onConfirm}
          onBack={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
