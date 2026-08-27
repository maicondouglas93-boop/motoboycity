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

  it('avisa que a entrega coletada saiu da empresa e personaliza o cliente', () => {
    expect(
      buildDeliveryTrackingMessage(publicUrl, {
        recipientName: 'Maria',
        companyName: 'Joaozinho Lanches',
        status: 'COLLECTED',
      }),
    ).toBe(
      `Olá, Maria!\n\nSua entrega de *Joaozinho Lanches* saiu para entrega. 🛵\n\nAcompanhe o motoboy em tempo real pelo link:\n${publicUrl}`,
    );
  });

  it('nao diz que saiu para entrega antes da coleta', () => {
    const message = buildDeliveryTrackingMessage(publicUrl, {
      companyName: 'Mercado Central',
      status: 'ACCEPTED',
    });

    expect(message).toContain('Um motoboy aceitou sua entrega de *Mercado Central*. 🛵');
    expect(message).not.toContain('saiu para entrega');
  });

  it('remove quebras e marcacao injetada dos nomes usados na mensagem', () => {
    const message = buildDeliveryTrackingMessage(publicUrl, {
      recipientName: '  Maria\n*Silva* ',
      companyName: ' Loja\n_Teste_ ',
      status: 'COLLECTED',
    });

    expect(message).toContain('Olá, Maria Silva!');
    expect(message).toContain('Sua entrega de *Loja Teste* saiu para entrega.');
  });
});
