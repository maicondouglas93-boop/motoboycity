import { describe, expect, it } from 'vitest';
import {
  buildDeliveryTrackingMessage,
  buildDeliveryTrackingWhatsAppUrl,
  normalizeDeliveryWhatsAppNumber,
} from '@/lib/delivery-whatsapp';

describe('delivery tracking WhatsApp', () => {
  const publicUrl = 'https://empresa.motoboycity.com.br/rastrear/token.assinatura';

  it('normaliza telefone brasileiro nacional ou E.164', () => {
    expect(normalizeDeliveryWhatsAppNumber('(33) 99999-8877')).toBe('5533999998877');
    expect(normalizeDeliveryWhatsAppNumber('+55 33 99999-8877')).toBe('5533999998877');
    expect(normalizeDeliveryWhatsAppNumber('123')).toBeNull();
  });

  it('abre conversa direta quando o destinatario possui telefone valido', () => {
    const url = buildDeliveryTrackingWhatsAppUrl('(33) 99999-8877', publicUrl);

    expect(url).toBe(
      `https://wa.me/5533999998877?text=${encodeURIComponent(buildDeliveryTrackingMessage(publicUrl))}`,
    );
  });

  it('usa compartilhamento generico sem quebrar quando o telefone esta ausente', () => {
    const url = buildDeliveryTrackingWhatsAppUrl(null, publicUrl);

    expect(url).toBe(
      `https://wa.me/?text=${encodeURIComponent(buildDeliveryTrackingMessage(publicUrl))}`,
    );
  });

  it('inclui somente a mensagem curta e o link publico', () => {
    expect(buildDeliveryTrackingMessage(publicUrl)).toBe(
      `Ola!\n\nAcompanhe sua entrega em tempo real:\n${publicUrl}`,
    );
  });
});
