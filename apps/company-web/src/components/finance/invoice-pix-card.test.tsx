import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InvoicePixCard } from './invoice-pix-card';

const mocks = vi.hoisted(() => ({
  pixCharge: vi.fn(),
  createPixCharge: vi.fn(),
}));

vi.mock('@/lib/api-client', () => ({
  companyInvoicesApi: {
    pixCharge: mocks.pixCharge,
    createPixCharge: mocks.createPixCharge,
  },
}));

function renderCard(status: 'PENDING' | 'PAID' = 'PENDING') {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <InvoicePixCard token="token" invoiceId="invoice-1" invoiceStatus={status} />
    </QueryClientProvider>,
  );
}

describe('InvoicePixCard', () => {
  beforeEach(() => {
    mocks.pixCharge.mockReset().mockResolvedValue(null);
    mocks.createPixCharge.mockReset();
  });

  it('gera a cobrança e mostra QR Code e copia-e-cola', async () => {
    mocks.createPixCharge.mockResolvedValue({
      invoiceId: 'invoice-1',
      invoiceNumber: 'FAT-1',
      status: 'ACTIVE',
      totalValue: 25.5,
      pixPayload: '000201PIXTESTE',
      pixEncodedImage: 'aW1hZ2Vt',
      expiresAt: null,
      receivedAt: null,
    });
    renderCard();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Gerar QR Code Pix' }));

    await waitFor(() =>
      expect(mocks.createPixCharge).toHaveBeenCalledWith('token', 'invoice-1'),
    );
    expect(await screen.findByAltText('QR Code Pix desta fatura')).toBeVisible();
    expect(screen.getByText('000201PIXTESTE')).toBeVisible();
  });

  it('mostra a confirmação automática de recebimento', async () => {
    mocks.pixCharge.mockResolvedValue({
      invoiceId: 'invoice-1',
      invoiceNumber: 'FAT-1',
      status: 'RECEIVED',
      totalValue: 25.5,
      pixPayload: null,
      pixEncodedImage: null,
      expiresAt: null,
      receivedAt: '2026-08-31T15:00:00.000Z',
    });
    renderCard('PAID');

    expect(await screen.findByText('Pix recebido e fatura conciliada')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Gerar QR Code Pix' })).not.toBeInTheDocument();
  });

  it('nao oferece gerar Pix para fatura paga sem cobrança', async () => {
    renderCard('PAID');
    await waitFor(() => expect(mocks.pixCharge).toHaveBeenCalled());
    expect(screen.queryByText('Pagar fatura com Pix')).not.toBeInTheDocument();
  });
});
