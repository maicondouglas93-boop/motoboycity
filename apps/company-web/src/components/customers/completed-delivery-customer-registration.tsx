'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BookUser, UserRoundCheck } from 'lucide-react';
import { CustomerForm } from '@/components/customers/customer-form';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { companyCustomersApi } from '@/lib/api-client';
import {
  buildCompletedDeliveryCustomerPrefill,
  type CompletedDeliveryCustomerSource,
} from '@/lib/company-customer';

export function CompletedDeliveryCustomerRegistration({
  token,
  delivery,
}: {
  token: string;
  delivery: CompletedDeliveryCustomerSource;
}) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const initial = buildCompletedDeliveryCustomerPrefill(delivery);
  const matchQueryKey = ['company', 'customers', 'match', initial?.phone ?? null] as const;
  const matchQuery = useQuery({
    queryKey: matchQueryKey,
    queryFn: () => companyCustomersApi.match(token, { phone: initial!.phone }),
    enabled: Boolean(initial),
    staleTime: 60_000,
    retry: false,
  });

  if (!initial) return null;

  const existingCustomer = matchQuery.data?.customer ?? null;

  return (
    <section className="mt-3 space-y-2 rounded-xl border border-portal/20 bg-portal-soft/45 p-3">
      <div className="flex items-start gap-2">
        <BookUser className="mt-0.5 size-4 shrink-0 text-portal" aria-hidden="true" />
        <div>
          <p className="font-semibold text-portal-deep">Reutilizar este destino</p>
          <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
            Salve o destinat&aacute;rio e o endere&ccedil;o final para criar os pr&oacute;ximos
            pedidos mais r&aacute;pido.
          </p>
        </div>
      </div>

      {matchQuery.isLoading ? (
        <p className="text-xs text-muted-foreground">Verificando sua lista de clientes...</p>
      ) : matchQuery.isError ? (
        <div className="space-y-2">
          <p className="text-xs text-destructive">
            N&atilde;o foi poss&iacute;vel verificar se este cliente j&aacute; est&aacute;
            cadastrado.
          </p>
          <Button type="button" size="sm" variant="outline" onClick={() => matchQuery.refetch()}>
            Tentar novamente
          </Button>
        </div>
      ) : existingCustomer ? (
        <Link
          href={`/clientes/${existingCustomer.id}`}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-portal hover:text-portal-deep hover:underline"
        >
          <UserRoundCheck className="size-3.5" aria-hidden="true" />
          Cliente j&aacute; cadastrado: {existingCustomer.name}
        </Link>
      ) : (
        <Button type="button" size="sm" onClick={() => setOpen(true)}>
          Cadastrar este cliente
        </Button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cadastrar cliente deste pedido</DialogTitle>
            <DialogDescription>
              Confirme os dados e, se necess&aacute;rio, complete o n&uacute;mero do destino
              capturado.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <CustomerForm
              token={token}
              initial={initial}
              onCancel={() => setOpen(false)}
              onSaved={(customer) => {
                queryClient.setQueryData(matchQueryKey, { customer });
                setOpen(false);
              }}
            />
          </DialogBody>
        </DialogContent>
      </Dialog>
    </section>
  );
}
