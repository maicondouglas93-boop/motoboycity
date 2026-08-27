import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DeliveryStatus } from '@motoboycity/types';
import { HomeDeliveryTrackingShare } from './home-delivery-tracking-share';

const mocks = vi.hoisted(() => ({
  issuePublicLink: vi.fn(),
}));

vi.mock('@/lib/api-client', () => ({
  trackingApi: { issuePublicLink: mocks.issuePublicLink },
}));

describe('HomeDeliveryTrackingShare', () => {
  beforeEach(() => {
    mocks.issuePublicLink.mockResolvedValue({
      token: 'token-publico.assinatura',
      issuedAt: '2026-08-27T12:00:00.000Z',
    });
  });

  it.each<DeliveryStatus>(['ACCEPTED', 'COLLECTED'])(
    'mostra a chamada clara e compartilha o pedido no status %s',
    async (status) => {
      const opened = { opener: window } as unknown as Window;
      const openSpy = vi.spyOn(window, 'open').mockReturnValue(opened);

      render(
        <HomeDeliveryTrackingShare
          token="jwt-da-empresa"
          deliveryId="delivery-1"
          status={status}
          recipientPhone="(33) 99999-8877"
          recipientName="Maria"
          companyName="Joaozinho Lanches"
        />,
      );

      expect(
        screen.getByText('Enviar localização do pedido em tempo real para o cliente'),
      ).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Enviar localização pelo WhatsApp' }));

      await waitFor(() =>
        expect(mocks.issuePublicLink).toHaveBeenCalledWith('jwt-da-empresa', 'delivery-1'),
      );
      expect(openSpy).toHaveBeenCalledWith(
        expect.stringContaining('https://wa.me/5533999998877?text='),
        '_blank',
      );
      const whatsappUrl = decodeURIComponent(String(openSpy.mock.calls[0]?.[0]));
      expect(whatsappUrl).toContain('/rastrear/token-publico.assinatura');
      expect(whatsappUrl).toContain('Olá, Maria!');
      expect(whatsappUrl).toContain(
        status === 'COLLECTED'
          ? 'Sua entrega de *Joaozinho Lanches* saiu para entrega.'
          : 'Um motoboy aceitou sua entrega de *Joaozinho Lanches*.',
      );
      expect(opened.opener).toBeNull();
    },
  );

  it.each<DeliveryStatus>([
    'SCHEDULED',
    'AWAITING_DRIVER',
    'DELIVERED',
    'FAILED',
    'COMPLETED',
    'CANCELLED',
    'AWAITING_PAYMENT',
  ])('nao mostra a acao fora do percurso compartilhavel em %s', (status) => {
    const { container } = render(
      <HomeDeliveryTrackingShare
        token="jwt-da-empresa"
        deliveryId="delivery-1"
        status={status}
        recipientPhone={null}
        recipientName={null}
        companyName="Joaozinho Lanches"
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
