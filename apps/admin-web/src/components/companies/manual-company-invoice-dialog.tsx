'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AdminCompanyDetail, InvoiceListItem } from '@motoboycity/types';
import { ApiError } from '@motoboycity/api-client';
import { FileCheck2 } from 'lucide-react';
import { adminInvoicesApi } from '@/lib/api-client';
import { ActionFeedback } from '@/components/ui/action-feedback';
import { Button } from '@/components/ui/button';
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
import { PendingButtonLabel } from '@/components/ui/pending-button-label';

export function ManualCompanyInvoiceDialog({
  company,
  token,
}: {
  company: AdminCompanyDetail;
  token: string;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [created, setCreated] = useState<InvoiceListItem | null>(null);
  const [error, setError] = useState<string | null>(null);

  const closeInvoice = useMutation({
    mutationFn: () => adminInvoicesApi.close(token, company.id),
    onSuccess: (invoice) => {
      setCreated(invoice);
      setError(null);
      void queryClient.invalidateQueries({
        queryKey: ['admin', 'company-invoices', company.id],
      });
      void queryClient.invalidateQueries({ queryKey: ['admin', 'financial'] });
      void queryClient.invalidateQueries({
        queryKey: ['admin', 'company-deliveries', 'summary', company.id],
      });
    },
    onError: (caughtError) =>
      setError(
        caughtError instanceof ApiError
          ? caughtError.message
          : 'Não foi possível fechar a fatura desta empresa.',
      ),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (closeInvoice.isPending) return;
        setOpen(nextOpen);
        if (nextOpen) {
          setCreated(null);
          setError(null);
        }
      }}
    >
      <DialogTrigger render={<Button size="sm" />}>
        <FileCheck2 className="size-3.5" /> Fechar fatura agora
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg" closeDisabled={closeInvoice.isPending}>
        <DialogHeader>
          <DialogTitle>Fechar fatura de {company.tradeName}</DialogTitle>
          <DialogDescription>
            Todos os pedidos concluídos, faturáveis e ainda sem fatura serão agrupados com emissão e
            vencimento de hoje.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          {!created && (
            <ActionFeedback tone="warning" title="Ação financeira">
              O fechamento alcança somente esta empresa. Para escolher pedidos ou outra data, use a
              fatura personalizada na area Financeiro.
            </ActionFeedback>
          )}
          {created && (
            <ActionFeedback tone="success" title={`Fatura ${created.number} emitida`}>
              <Link className="font-medium underline" href={`/faturas/${created.id}`}>
                Abrir a fatura
              </Link>
            </ActionFeedback>
          )}
          {error && (
            <ActionFeedback tone="error" title="Não foi possível fechar">
              {error}
            </ActionFeedback>
          )}
        </DialogBody>
        <DialogFooter className="flex justify-end gap-2">
          <DialogClose
            render={<Button variant="outline">{created ? 'Concluir' : 'Voltar'}</Button>}
          />
          {!created && (
            <Button onClick={() => closeInvoice.mutate()} disabled={closeInvoice.isPending}>
              <PendingButtonLabel pending={closeInvoice.isPending} pendingLabel="Fechando...">
                Confirmar fechamento
              </PendingButtonLabel>
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
