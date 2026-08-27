'use client';

import { useState } from 'react';
import { MessageCircle } from 'lucide-react';
import { ApiError } from '@motoboycity/api-client';
import type { DeliveryStatus } from '@motoboycity/types';
import { Button } from '@/components/ui/button';
import { trackingApi } from '@/lib/api-client';
import { buildDeliveryTrackingWhatsAppUrl } from '@/lib/delivery-whatsapp';

export function ShareDeliveryTrackingButton({
  token,
  deliveryId,
  recipientPhone,
  recipientName,
  companyName,
  status,
  label = 'Enviar pelo WhatsApp',
  prominent = false,
}: {
  token: string;
  deliveryId: string;
  recipientPhone: string | null;
  recipientName?: string | null;
  companyName?: string | null;
  status?: DeliveryStatus;
  label?: string;
  prominent?: boolean;
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
      const whatsappUrl = buildDeliveryTrackingWhatsAppUrl(recipientPhone, publicUrl, {
        recipientName,
        companyName,
        status,
      });
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
    <div className={`flex flex-col gap-1.5 ${prominent ? 'items-stretch' : 'items-end'}`}>
      <Button
        type="button"
        variant={prominent ? 'default' : 'outline'}
        size={prominent ? 'sm' : 'default'}
        className={
          prominent
            ? 'w-full bg-[#149447] text-white shadow-[0_8px_20px_-12px_rgba(20,148,71,0.95)] hover:bg-[#0f7d3b] hover:text-white'
            : undefined
        }
        disabled={loading}
        onClick={() => void share()}
      >
        <MessageCircle className="size-4" aria-hidden="true" />
        {loading ? 'Preparando...' : label}
      </Button>
      {error && (
        <p className={`max-w-72 text-xs text-destructive ${prominent ? '' : 'text-right'}`}>
          {error}
        </p>
      )}
    </div>
  );
}
