'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AdminCompanyDetail } from '@motoboycity/types';
import { ApiError } from '@motoboycity/api-client';
import { Ban, RotateCcw } from 'lucide-react';
import { adminCompaniesApi } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { ActionFeedback } from '@/components/ui/action-feedback';
import { PendingButtonLabel } from '@/components/ui/pending-button-label';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

export function CompanyStatusDialog({
  company,
  token,
}: {
  company: AdminCompanyDetail;
  token: string;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const suspending = company.status === 'ACTIVE';

  const mutation = useMutation({
    mutationFn: () =>
      suspending
        ? adminCompaniesApi.suspend(token, company.id)
        : adminCompaniesApi.reactivate(token, company.id),
    onSuccess: (updated) => {
      queryClient.setQueryData(['admin', 'company', company.id], updated);
      void queryClient.invalidateQueries({ queryKey: ['admin', 'companies'] });
      setError(null);
      setOpen(false);
    },
    onError: (cause) =>
      setError(cause instanceof ApiError ? cause.message : 'Nao foi possivel alterar o status.'),
  });

  if (company.status === 'PENDING_APPROVAL') return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={<Button variant={suspending ? 'destructive' : 'secondary'} size="sm" />}
      >
        {suspending ? <Ban className="size-3.5" /> : <RotateCcw className="size-3.5" />}
        {suspending ? 'Suspender' : 'Reativar'}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg" closeDisabled={mutation.isPending}>
        <DialogHeader>
          <DialogTitle>{suspending ? 'Suspender empresa' : 'Reativar empresa'}</DialogTitle>
          <DialogDescription>
            {suspending
              ? `A empresa ${company.tradeName} perdera o acesso imediatamente e nao podera criar novos pedidos.`
              : `A empresa ${company.tradeName} voltara a acessar o painel e criar pedidos.`}
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-3">
          <ActionFeedback tone={suspending ? 'warning' : 'info'} title="Dados preservados">
            Pedidos, faturas, enderecos e historico permanecem preservados. Esta acao nao exclui
            nenhum dado.
          </ActionFeedback>
          {error && (
            <ActionFeedback tone="error" title="Não foi possível alterar o status">
              {error}
            </ActionFeedback>
          )}
        </DialogBody>
        <DialogFooter className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setOpen(false)} disabled={mutation.isPending}>
            Voltar
          </Button>
          <Button
            variant={suspending ? 'destructive' : 'default'}
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
          >
            <PendingButtonLabel pending={mutation.isPending} pendingLabel="Salvando...">
              {suspending ? 'Confirmar suspensao' : 'Confirmar reativacao'}
            </PendingButtonLabel>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
