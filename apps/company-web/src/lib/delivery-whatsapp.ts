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

export function buildDeliveryTrackingMessage(publicUrl: string): string {
  return ['Ola!', '', 'Acompanhe sua entrega em tempo real:', publicUrl].join('\n');
}

export function buildDeliveryTrackingWhatsAppUrl(phone: string | null, publicUrl: string): string {
  const number = normalizeDeliveryWhatsAppNumber(phone);
  const message = encodeURIComponent(buildDeliveryTrackingMessage(publicUrl));
  return number ? `https://wa.me/${number}?text=${message}` : `https://wa.me/?text=${message}`;
}
