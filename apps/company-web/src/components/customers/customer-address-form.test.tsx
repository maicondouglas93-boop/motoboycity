import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CustomerAddressForm } from '@/components/customers/customer-address-form';

const mocks = vi.hoisted(() => ({ createAddress: vi.fn(), updateAddress: vi.fn() }));

vi.mock('@/lib/api-client', () => ({
  companyCustomersApi: {
    createAddress: mocks.createAddress,
    updateAddress: mocks.updateAddress,
  },
}));

const selectedAddress = {
  label: 'Avenida Dois, 25, Lajinha/MG',
  street: 'Avenida Dois',
  number: '25',
  city: 'Lajinha',
  state: 'MG',
  zip: '36930000',
  lat: -20.16,
  lng: -41.63,
};

vi.mock('@/components/operations/google-address-autocomplete', () => ({
  GoogleAddressAutocomplete: ({
    onValueChange,
    onAddressChange,
  }: {
    onValueChange: (value: string) => void;
    onAddressChange: (address: typeof selectedAddress) => void;
  }) => (
    <button
      type="button"
      onClick={() => {
        onValueChange(selectedAddress.label);
        onAddressChange(selectedAddress);
      }}
    >
      Selecionar endereco
    </button>
  ),
}));

function renderForm(onSaved = vi.fn()) {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <CustomerAddressForm
        token="token"
        customerId="customer-1"
        onSaved={onSaved}
        onCancel={vi.fn()}
      />
    </QueryClientProvider>,
  );
  return onSaved;
}

describe('CustomerAddressForm', () => {
  beforeEach(() => {
    mocks.createAddress.mockReset();
    mocks.updateAddress.mockReset();
  });

  it('cadastra um endereco nomeado e estruturado', async () => {
    const saved = {
      id: 'address-2',
      label: 'Trabalho',
      isPrimary: false,
      street: selectedAddress.street,
      number: selectedAddress.number,
      complement: null,
      city: selectedAddress.city,
      state: selectedAddress.state,
      zip: selectedAddress.zip,
      lat: selectedAddress.lat,
      lng: selectedAddress.lng,
      referenceNote: null,
    };
    mocks.createAddress.mockResolvedValue(saved);
    const onSaved = renderForm();

    fireEvent.change(screen.getByLabelText('Nome do endereço'), {
      target: { value: 'Trabalho' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Selecionar endereco' }));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar endereço' }));

    await waitFor(() => {
      expect(mocks.createAddress).toHaveBeenCalledWith('token', 'customer-1', {
        label: 'Trabalho',
        address: {
          street: 'Avenida Dois',
          number: '25',
          complement: undefined,
          city: 'Lajinha',
          state: 'MG',
          zip: '36930000',
          lat: -20.16,
          lng: -41.63,
          referenceNote: undefined,
        },
      });
    });
    expect(onSaved).toHaveBeenCalledWith(saved);
  });
});
