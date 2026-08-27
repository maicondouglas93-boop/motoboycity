'use client';

import { useState } from 'react';
import { MessageCircle } from 'lucide-react';
import { ApiError } from '@motoboycity/api-client';
import { Button } from '@/components/ui/button';
import { trackingApi } from '@/lib/api-client';
import { buildDeliveryTrackingWhatsAppUrl } from '@/lib/delivery-whatsapp';

export function ShareDeliveryTrackingButton({
  token,
  deliveryId,
  recipientPhone,
  label = 'Enviar pelo WhatsApp',
}: {
  token: string;
  deliveryId: string;
  recipientPhone: string | null;
  label?: string;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function share(): Promise<void> {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const link = await trackingApi.issuePublicLink(token, deliveryId);
      const publicUrl = `${window.location.origin}/rastrear/${encodeURIComponent(link.token)}`;
      const whatsappUrl = buildDeliveryTrackingWhatsAppUrl(recipientPhone, publicUrl);
      const opened = window.open(whatsappUrl, '_blank');
      if (opened) opened.opener = null;
      else window.location.assign(whatsappUrl);
    } catch (shareError) {
      setError(
        shareError instanceof ApiError
          ? shareError.message
          : 'Nao foi possivel preparar o rastreamento agora.',
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <Button type="button" variant="outline" disabled={loading} onClick={() => void share()}>
        <MessageCircle className="size-4" aria-hidden="true" />
        {loading ? 'Preparando...' : label}
      </Button>
      {error && <p className="max-w-72 text-right text-xs text-destructive">{error}</p>}
    </div>
  );
}
