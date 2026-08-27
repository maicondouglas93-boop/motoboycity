import type { DeliveryStatus } from '@motoboycity/types';

/** Aceita telefone nacional (10/11 digitos) ou E.164 brasileiro ja prefixado. */
export function normalizeDeliveryWhatsAppNumber(phone: string | null): string | null {
  const digits = phone?.replace(/\D/g, '') ?? '';
  const national =
    (digits.length === 12 || digits.length === 13) && digits.startsWith('55')
      ? digits.slice(2)
      : digits;
  if (!/^[1-9]\d{9,10}$/.test(national)) return null;
  return `55${national}`;
}

export interface DeliveryTrackingMessageContext {
  companyName?: string | null;
  recipientName?: string | null;
  status?: DeliveryStatus;
}

function safeMessageLabel(value: string | null | undefined): string | null {
  const normalized =
    value
      ?.replace(/[\r\n*_~`]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim() ?? '';
  return normalized || null;
}

export function buildDeliveryTrackingMessage(
  publicUrl: string,
  context: DeliveryTrackingMessageContext = {},
): string {
  const recipientName = safeMessageLabel(context.recipientName);
  const companyName = safeMessageLabel(context.companyName);
  const greeting = recipientName ? `Olá, ${recipientName}!` : 'Olá!';
  const company = companyName ? ` de *${companyName}*` : '';

  const deliveryUpdate =
    context.status === 'COLLECTED'
      ? `Sua entrega${company} saiu para entrega. 🛵`
      : context.status === 'ACCEPTED'
        ? `Um motoboy aceitou sua entrega${company}. 🛵`
        : `Sua entrega${company} está sendo preparada. 🛵`;
  const trackingCall =
    context.status === 'ACCEPTED' || context.status === 'COLLECTED'
      ? 'Acompanhe o motoboy em tempo real pelo link:'
      : 'Acompanhe as atualizações da entrega pelo link:';

  return [greeting, '', deliveryUpdate, '', trackingCall, publicUrl].join('\n');
}

export function buildDeliveryTrackingWhatsAppUrl(
  phone: string | null,
  publicUrl: string,
  context: DeliveryTrackingMessageContext = {},
): string {
  const number = normalizeDeliveryWhatsAppNumber(phone);
  const message = encodeURIComponent(buildDeliveryTrackingMessage(publicUrl, context));
  return number ? `https://wa.me/${number}?text=${message}` : `https://wa.me/?text=${message}`;
}
