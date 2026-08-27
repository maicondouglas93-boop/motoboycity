import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { CompanyCustomer } from '@motoboycity/types';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CustomerAutocomplete } from '@/components/customers/customer-autocomplete';

const mocks = vi.hoisted(() => ({ list: vi.fn() }));

vi.mock('@/lib/api-client', () => ({
  companyCustomersApi: { list: mocks.list },
}));

const customer = {
  id: 'customer-1',
  name: 'Maria Oliveira',
  cpf: '52998224725',
  phone: '33999999991',
  addressLabel: 'Casa',
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
  addresses: [
    {
      id: 'address-1',
      label: 'Casa',
      isPrimary: true,
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
  createdAt: '2026-08-26T12:00:00.000Z',
  updatedAt: '2026-08-26T12:00:00.000Z',
} satisfies CompanyCustomer;

function renderAutocomplete(onSelect = vi.fn(), onClear = vi.fn()) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <CustomerAutocomplete token="token" onSelect={onSelect} onClear={onClear} />
    </QueryClientProvider>,
  );
  return { onSelect, onClear };
}

describe('CustomerAutocomplete', () => {
  beforeEach(() => {
    mocks.list.mockReset();
    mocks.list.mockResolvedValue({ items: [customer], total: 1, page: 1, pageSize: 8 });
  });

  it('aguarda o debounce, pesquisa por nome e seleciona o resultado', async () => {
    const { onSelect } = renderAutocomplete();
    fireEvent.change(screen.getByLabelText('Pesquisar cliente cadastrado'), {
      target: { value: 'Maria' },
    });

    expect(mocks.list).not.toHaveBeenCalled();
    const result = await screen.findByRole('button', { name: /Maria Oliveira/ });
    expect(mocks.list).toHaveBeenCalledWith('token', { q: 'Maria', pageSize: 8 });

    fireEvent.click(result);
    expect(onSelect).toHaveBeenCalledWith(customer, customer.addresses[0]);
  });

  it('permite escolher um dos enderecos do cliente', async () => {
    const trabalho = {
      ...customer.addresses[0],
      id: 'address-2',
      label: 'Trabalho',
      isPrimary: false,
      street: 'Avenida Dois',
      number: '25',
    };
    const customerWithTwoAddresses = {
      ...customer,
      addresses: [customer.addresses[0], trabalho],
    };
    mocks.list.mockResolvedValue({
      items: [customerWithTwoAddresses],
      total: 1,
      page: 1,
      pageSize: 8,
    });
    const { onSelect } = renderAutocomplete();
    fireEvent.change(screen.getByLabelText('Pesquisar cliente cadastrado'), {
      target: { value: 'Maria' },
    });

    fireEvent.click(await screen.findByRole('button', { name: /Maria Oliveira/ }));
    fireEvent.click(screen.getByRole('button', { name: /Trabalho/ }));

    expect(onSelect).toHaveBeenCalledWith(customerWithTwoAddresses, trabalho);
  });

  it('mostra estado sem resultado', async () => {
    mocks.list.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 8 });
    renderAutocomplete();
    fireEvent.change(screen.getByLabelText('Pesquisar cliente cadastrado'), {
      target: { value: 'Nao existe' },
    });

    expect(await screen.findByText('Nenhum cliente encontrado.')).toBeInTheDocument();
  });
});
