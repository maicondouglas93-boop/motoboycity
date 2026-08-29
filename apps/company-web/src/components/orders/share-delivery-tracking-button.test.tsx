import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ShareDeliveryTrackingButton } from './share-delivery-tracking-button';

const mocks = vi.hoisted(() => ({
  issuePublicLink: vi.fn(),
  revokePublicLink: vi.fn(),
}));

vi.mock('@/lib/api-client', () => ({
  trackingApi: {
    issuePublicLink: mocks.issuePublicLink,
    revokePublicLink: mocks.revokePublicLink,
  },
}));

function renderizar() {
  return render(
    <ShareDeliveryTrackingButton
      token="jwt-da-empresa"
      deliveryId="delivery-1"
      recipientPhone="(33) 99999-8877"
      recipientName="Maria"
      companyName="Joaozinho Lanches"
    />,
  );
}

/**
 * Revogar existe na API e na regra de negocio desde sempre — "a empresa tambem
 * pode revogar o link antes disso" — e nao existia na tela. Quem mandava o link
 * para o numero errado nao tinha como cancelar.
 */
describe('ShareDeliveryTrackingButton', () => {
  beforeEach(() => {
    mocks.issuePublicLink.mockReset().mockResolvedValue({
      token: 'token-publico.assinatura',
      issuedAt: '2026-08-29T12:00:00.000Z',
    });
    mocks.revokePublicLink.mockReset().mockResolvedValue({ revoked: true });
    vi.spyOn(window, 'open').mockReturnValue({ opener: window } as unknown as Window);
  });

  it('so oferece revogar depois de existir link para revogar', async () => {
    renderizar();

    expect(screen.queryByRole('button', { name: /revogar link/i })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /enviar pelo whatsapp/i }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /revogar link/i })).toBeInTheDocument(),
    );
  });

  it('revoga o link e diz o que isso significa para quem ja recebeu', async () => {
    renderizar();
    fireEvent.click(screen.getByRole('button', { name: /enviar pelo whatsapp/i }));
    const revogar = await screen.findByRole('button', { name: /revogar link/i });

    fireEvent.click(revogar);

    await waitFor(() =>
      expect(mocks.revokePublicLink).toHaveBeenCalledWith('jwt-da-empresa', 'delivery-1'),
    );
    expect(
      await screen.findByText(/nao ve mais a entrega/i, undefined, { timeout: 2000 }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /revogar link/i })).toBeNull();
  });

  it('mostra o erro da API em vez de sumir com o botao', async () => {
    mocks.revokePublicLink.mockRejectedValue(new Error('falhou'));
    renderizar();
    fireEvent.click(screen.getByRole('button', { name: /enviar pelo whatsapp/i }));
    fireEvent.click(await screen.findByRole('button', { name: /revogar link/i }));

    expect(await screen.findByText(/nao foi possivel revogar o link agora/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /revogar link/i })).toBeInTheDocument();
  });
});
