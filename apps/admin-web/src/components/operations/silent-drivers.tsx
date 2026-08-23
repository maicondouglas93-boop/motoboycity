'use client';

import { useQuery } from '@tanstack/react-query';
import { MapPinOff } from 'lucide-react';
import type { SilentDriverItem } from '@motoboycity/types';
import { Card, CardContent } from '@/components/ui/card';
import { adminOperationsApi } from '@/lib/api-client';
import { session } from '@/lib/session';

/**
 * Motoboys com pedido em andamento cujo rastreamento parou de chegar.
 *
 * É a resposta pronta para a ligação da loja perguntando por que o pedido não
 * anda. Sem isto, o pedido só parece parado no mapa e ninguém sabe por quê.
 *
 * O aviso que vai para o próprio motoboy depende do app dele estar vivo, e o
 * caso mais grave é justamente aquele em que não está — por isso este bloco,
 * que é o lado que sempre funciona, fica no topo da tela e não escondido numa
 * aba.
 */
export function SilentDrivers() {
  const token = session.getToken();

  const silentQuery = useQuery({
    queryKey: ['admin', 'silent-drivers'],
    queryFn: () => adminOperationsApi.silentDrivers(token as string),
    enabled: Boolean(token),
    // Mesma cadência do detector no servidor: atualizar mais rápido não traria
    // informação nova, só consulta.
    refetchInterval: 120_000,
  });

  const drivers = silentQuery.data ?? [];
  if (drivers.length === 0) {
    // Silêncio nenhum é o estado normal — um card vazio permanente viraria
    // ruído e faria o alerta de verdade passar despercebido.
    return null;
  }

  return (
    <Card className="border-alerta">
      <CardContent className="space-y-2 py-3">
        <div className="flex items-center gap-2 text-sm font-medium text-alerta">
          <MapPinOff className="size-4" />
          Sem posição no mapa
        </div>
        {drivers.map((driver: SilentDriverItem) => (
          <p key={driver.driverId} className="text-sm">
            <span className="font-medium">{driver.driverName}</span>{' '}
            <span className="text-muted-foreground">
              está com {driver.activeDeliveryCount} pedido
              {driver.activeDeliveryCount > 1 ? 's' : ''} (
              {driver.deliveryNumbers.map((numero) => `#${numero}`).join(', ')}) e sem posição há{' '}
              {driver.silentMinutes} min.
            </span>
          </p>
        ))}
        <p className="text-xs text-muted-foreground">
          Pode ser app fechado, GPS desligado ou economia de bateria. Ligue para confirmar que a
          entrega está andando.
        </p>
      </CardContent>
    </Card>
  );
}
