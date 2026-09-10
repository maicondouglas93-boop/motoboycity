'use client';

import Link from 'next/link';
import { Printer } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { buttonVariants } from '@/components/ui/button';
import { companyProfileApi } from '@/lib/api-client';
import { authUserQueryOptions } from '@/lib/auth-user-query';
import { session } from '@/lib/session';

/** A API continua sendo a autoridade; esta consulta só controla a ação visível. */
export function DeliveryPrintLink({ deliveryId, companyId, className }: {
  deliveryId: string;
  companyId: string;
  className?: string;
}) {
  const token = session.getToken();
  const user = useQuery(authUserQueryOptions(token));
  const allowed = Boolean(token && user.data?.type === 'COMPANY_MEMBER' && !user.isError);
  const profile = useQuery({
    queryKey: ['company', 'print-access', user.data?.id],
    queryFn: () => companyProfileApi.get(token!),
    enabled: allowed,
    staleTime: 60_000,
    retry: false,
  });

  if (!allowed || profile.isError || profile.data?.companyId !== companyId) return null;

  return (
    <Link
      href={`/pedidos/${encodeURIComponent(deliveryId)}/imprimir`}
      prefetch={false}
      className={buttonVariants({ variant: 'outline', className })}
    >
      <Printer aria-hidden="true" /> Imprimir pedido
    </Link>
  );
}
