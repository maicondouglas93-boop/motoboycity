import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CustomerForm } from '@/components/customers/customer-form';

const mocks = vi.hoisted(() => ({ create: vi.fn(), update: vi.fn() }));

vi.mock('@/lib/api-client', () => ({
  companyCustomersApi: { create: mocks.create, update: mocks.update },
}));

vi.mock('@/components/operations/google-address-autocomplete', () => ({
  GoogleAddressAutocomplete: ({ value }: { value: string }) => (
    <input aria-label="Endereco selecionado" value={value} readOnly />
  ),
}));

const initial = {
  name: 'Maria Oliveira',
  phone: '33999999991',
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
};

function renderForm(onSaved = vi.fn()) {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <CustomerForm token="token" initial={initial} onSaved={onSaved} onCancel={vi.fn()} />
    </QueryClientProvider>,
  );
  return onSaved;
}

describe('CustomerForm pos-entrega', () => {
  beforeEach(() => {
    mocks.create.mockReset();
    mocks.update.mockReset();
  });

  it('abre preenchido e salva sem CPF sem alterar a entrega', async () => {
    const saved = { id: 'customer-1', cpf: null, ...initial };
    mocks.create.mockResolvedValue(saved);
    const onSaved = renderForm();

    expect(screen.getByLabelText('Nome completo')).toHaveValue('Maria Oliveira');
    expect(screen.getByLabelText('Telefone')).toHaveValue('33999999991');
    expect(screen.getByLabelText('Endereco selecionado')).toHaveValue('Rua Um, 10, Lajinha/MG');

    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar cliente' }));

    await waitFor(() => {
      expect(mocks.create).toHaveBeenCalledWith('token', {
        name: 'Maria Oliveira',
        cpf: undefined,
        phone: '33999999991',
        address: {
          street: 'Rua Um',
          number: '10',
          complement: undefined,
          city: 'Lajinha',
          state: 'MG',
          zip: '36930000',
          lat: -20.15,
          lng: -41.62,
          referenceNote: undefined,
        },
      });
    });
    expect(onSaved).toHaveBeenCalledWith(saved);
  });

  it('rejeita CPF invalido quando ele e informado', async () => {
    renderForm();
    fireEvent.change(screen.getByLabelText('CPF (opcional)'), { target: { value: '123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar cliente' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('CPF invalido.');
    expect(mocks.create).not.toHaveBeenCalled();
  });
});
