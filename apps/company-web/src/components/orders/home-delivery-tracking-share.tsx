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
  recipientName,
  companyName,
}: {
  token: string;
  deliveryId: string;
  status: DeliveryStatus;
  recipientPhone: string | null;
  recipientName: string | null;
  companyName: string;
}) {
  if (!canShareDeliveryTrackingFromHome(status)) return null;

  return (
    <section className="space-y-2 rounded-xl border border-[#149447]/25 bg-[linear-gradient(135deg,rgba(20,148,71,0.1),rgba(255,255,255,0.78))] p-2.5 shadow-[0_8px_22px_-18px_rgba(20,148,71,0.8)]">
      <p className="text-[11px] leading-4 font-bold text-[#0f7137]">
        Enviar localização do pedido em tempo real para o cliente
      </p>
      <ShareDeliveryTrackingButton
        token={token}
        deliveryId={deliveryId}
        recipientPhone={recipientPhone}
        recipientName={recipientName}
        companyName={companyName}
        status={status}
        label="Enviar localização pelo WhatsApp"
        prominent
      />
    </section>
  );
}
