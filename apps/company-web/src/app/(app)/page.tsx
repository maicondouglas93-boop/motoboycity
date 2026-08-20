'use client';

import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AddressSetupForm } from '@/components/orders/address-setup-form';
import { CreateOrderForm } from '@/components/orders/create-order-form';
import { companyAddressApi, serviceTypesApi } from '@/lib/api-client';
import { session } from '@/lib/session';

export default function CompanyHomePage() {
  const token = session.getToken();

  const addressQuery = useQuery({
    queryKey: ['company', 'address'],
    queryFn: () => companyAddressApi.get(token as string),
    enabled: Boolean(token),
  });

  const serviceTypesQuery = useQuery({
    queryKey: ['service-types', { active: true }],
    queryFn: () => serviceTypesApi.list(token as string, { active: true }),
    enabled: Boolean(token),
  });

  if (!token) {
    return <p className="text-sm text-muted-foreground">Faça login para lançar pedidos.</p>;
  }

  const pickupAddress = addressQuery.data?.address ?? null;

  return (
    <div className="max-w-xl">
      <Card>
        <CardHeader>
          <CardTitle>Lançar Pedido</CardTitle>
        </CardHeader>
        <CardContent>
          {addressQuery.isLoading && <p className="text-sm text-muted-foreground">Carregando...</p>}
          {addressQuery.isError && (
            <p className="text-sm text-destructive">
              Não foi possível carregar o endereço de coleta.
            </p>
          )}
          {addressQuery.isSuccess && !pickupAddress && <AddressSetupForm token={token} />}
          {addressQuery.isSuccess && pickupAddress && (
            <CreateOrderForm
              token={token}
              pickupAddress={pickupAddress}
              serviceTypes={serviceTypesQuery.data ?? []}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
