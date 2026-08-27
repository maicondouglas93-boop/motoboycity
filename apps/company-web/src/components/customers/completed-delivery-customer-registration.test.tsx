import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { CompanyCustomer } from '@motoboycity/types';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CompletedDeliveryCustomerRegistration } from './completed-delivery-customer-registration';
import type { CompletedDeliveryCustomerSource } from '@/lib/company-customer';

const mocks = vi.hoisted(() => ({ match: vi.fn() }));

vi.mock('@/lib/api-client', () => ({
  companyCustomersApi: { match: mocks.match },
}));

vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
    open ? <div>{children}</div> : null,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  DialogBody: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const customer = {
  id: 'customer-1',
  name: 'Maria Oliveira',
  cpf: null,
  phone: '33999999991',
  addressLabel: 'Destino da entrega',
  address: {
    street: 'Rua Um',
    number: '10',
    complement: null,
    city: 'Lajinha',
    state: 'MG',
    zip: '36930000',
    lat: -20.15,
    lng: -41.62,
    referenceNote: null,
  },
  addresses: [],
  createdAt: '2026-08-27T12:00:00.000Z',
  updatedAt: '2026-08-27T12:00:00.000Z',
} satisfies CompanyCustomer;

vi.mock('@/components/customers/customer-form', () => ({
  CustomerForm: ({
    initial,
    onSaved,
  }: {
    initial: { name: string; phone: string; address: { street: string } };
    onSaved: (customer: CompanyCustomer) => void;
  }) => (
    <div>
      <p>
        {initial.name} - {initial.phone} - {initial.address.street}
      </p>
      <button type="button" onClick={() => onSaved(customer)}>
        Confirmar cadastro
      </button>
    </div>
  ),
}));

const delivery = {
  batchId: null,
  destinationKnownAtCreation: false,
  status: 'COMPLETED',
  recipientName: 'Maria Oliveira',
  recipientPhone: '(33) 99999-9991',
  addresses: [
    {
      type: 'DROPOFF',
      street: 'Rua Um',
      number: '10',
      complement: null,
      city: 'Lajinha',
      state: 'MG',
      zip: '36930000',
      lat: -20.15,
      lng: -41.62,
      referenceNote: null,
    },
  ],
} satisfies CompletedDeliveryCustomerSource;

function renderRegistration() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <CompletedDeliveryCustomerRegistration token="token" delivery={delivery} />
    </QueryClientProvider>,
  );
}

describe('CompletedDeliveryCustomerRegistration', () => {
  beforeEach(() => {
    mocks.match.mockReset();
  });

  it('abre o formulario preenchido e atualiza o estado depois de salvar', async () => {
    mocks.match.mockResolvedValue({ customer: null });
    renderRegistration();

    fireEvent.click(await screen.findByRole('button', { name: 'Cadastrar este cliente' }));

    expect(screen.getByRole('heading', { name: 'Cadastrar cliente deste pedido' })).toBeVisible();
    expect(screen.getByText('Maria Oliveira - 33999999991 - Rua Um')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar cadastro' }));

    await waitFor(() => {
      expect(screen.getByText('Cliente j\u00e1 cadastrado: Maria Oliveira')).toBeVisible();
    });
    expect(mocks.match).toHaveBeenCalledWith('token', { phone: '33999999991' });
  });

  it('nao oferece duplicidade quando o telefone ja pertence a um cliente', async () => {
    mocks.match.mockResolvedValue({ customer });
    renderRegistration();

    const link = await screen.findByRole('link', {
      name: 'Cliente j\u00e1 cadastrado: Maria Oliveira',
    });
    expect(link).toHaveAttribute('href', '/clientes/customer-1');
    expect(
      screen.queryByRole('button', { name: 'Cadastrar este cliente' }),
    ).not.toBeInTheDocument();
  });
});
