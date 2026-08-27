import type { DeliveryStatus } from '@motoboycity/types';
import { ShareDeliveryTrackingButton } from './share-delivery-tracking-button';

export function canShareDeliveryTrackingFromHome(status: DeliveryStatus): boolean {
  return status === 'ACCEPTED' || status === 'COLLECTED';
}

export function HomeDeliveryTrackingShare({
  token,
  deliveryId,
  status,
  recipientPhone,
}: {
  token: string;
  deliveryId: string;
  status: DeliveryStatus;
  recipientPhone: string | null;
}) {
  if (!canShareDeliveryTrackingFromHome(status)) return null;

  return (
    <section className="space-y-3 rounded-xl border border-portal/20 bg-card/85 p-3 shadow-sm">
      <div>
        <p className="font-semibold text-portal-deep">
          Enviar localização do pedido em tempo real para o cliente
        </p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          O cliente receberá pelo WhatsApp um link para acompanhar esta entrega.
        </p>
      </div>
      <ShareDeliveryTrackingButton
        token={token}
        deliveryId={deliveryId}
        recipientPhone={recipientPhone}
        label="Enviar localização pelo WhatsApp"
      />
    </section>
  );
}
