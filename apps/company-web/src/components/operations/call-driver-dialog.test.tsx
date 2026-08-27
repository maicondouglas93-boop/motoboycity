import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CallDriverDialog } from './call-driver-dialog';

const mocks = vi.hoisted(() => ({
  address: vi.fn(),
  create: vi.fn(),
  createBatch: vi.fn(),
  operations: vi.fn(),
  serviceTypes: vi.fn(),
}));

vi.mock('@/lib/api-client', () => ({
  companyAddressApi: { get: mocks.address },
  deliveriesApi: {
    create: mocks.create,
    createBatch: mocks.createBatch,
    operations: mocks.operations,
    cancel: vi.fn(),
    redispatch: vi.fn(),
  },
  serviceTypesApi: { list: mocks.serviceTypes },
}));

vi.mock('@/lib/session', () => ({
  session: { getToken: () => 'token' },
}));

function renderDialog() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <CallDriverDialog>
        <button type="button">Chamar entregador</button>
      </CallDriverDialog>
    </QueryClientProvider>,
  );
}

describe('CallDriverDialog', () => {
  beforeEach(() => {
    mocks.address.mockResolvedValue({
      address: {
        id: 'pickup-1',
        label: null,
        street: 'Rua da Loja',
        number: '1',
        complement: null,
        city: 'Lajinha',
        state: 'MG',
        zip: '36930000',
        lat: -20.14,
        lng: -41.61,
      },
    });
    mocks.serviceTypes.mockResolvedValue([
      {
        id: 'service-1',
        code: 'MOTO',
        name: 'Moto',
        active: true,
        createdAt: '2026-08-27T12:00:00.000Z',
      },
    ]);
    mocks.create.mockImplementation(() => new Promise(() => undefined));
  });

  it('mostra o acompanhamento imediatamente enquanto a API cria o pedido', async () => {
    renderDialog();

    fireEvent.click(screen.getByRole('button', { name: 'Chamar entregador' }));
    await screen.findByText('Moto');
    fireEvent.click(screen.getByRole('button', { name: 'Chamar entregador' }));

    await waitFor(() => expect(mocks.create).toHaveBeenCalledOnce());
    expect(screen.getByRole('heading', { name: 'Acompanhando' })).toBeVisible();
    expect(
      screen.getByText('Enviando o pedido e iniciando a busca por um entregador...'),
    ).toBeVisible();
    expect(screen.getByText('Iniciando busca...')).toBeVisible();
  });
});
