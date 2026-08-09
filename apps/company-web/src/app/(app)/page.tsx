'use client';

import { MapPin } from 'lucide-react';
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
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[380px_1fr]">
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Lançar Pedido</CardTitle>
          </CardHeader>
          <CardContent>
            {addressQuery.isLoading && (
              <p className="text-sm text-muted-foreground">Carregando...</p>
            )}
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

      <Card className="flex min-h-125 items-center justify-center overflow-hidden">
        <div className="flex flex-col items-center gap-2 text-muted-foreground">
          <MapPin className="size-8" />
          <p className="text-sm">Mapa (integração com Google Maps — Fase futura)</p>
        </div>
      </Card>
    </div>
  );
}
