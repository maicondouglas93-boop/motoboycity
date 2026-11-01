import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { CompanyAddressItem, CompanyCustomer, ServiceTypeItem } from '@motoboycity/types';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OperationalOrderForm } from '@/components/operations/operational-order-form';

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  createBatch: vi.fn(),
  operations: vi.fn(),
  match: vi.fn(),
}));

vi.mock('@/lib/api-client', () => ({
  apiBaseUrl: 'https://api.example.test',
  deliveriesApi: {
    create: mocks.create,
    createBatch: mocks.createBatch,
    operations: mocks.operations,
    cancel: vi.fn(),
    redispatch: vi.fn(),
  },
  companyCustomersApi: { match: mocks.match },
}));

vi.mock('socket.io-client', () => ({
  io: () => ({ on: vi.fn(), disconnect: vi.fn() }),
}));

vi.mock('@/components/ui/select', () => ({
  Select: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectItem: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectValue: () => null,
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

vi.mock('@/components/customers/customer-autocomplete', () => ({
  CustomerAutocomplete: ({ onSelect }: { onSelect: (customer: CompanyCustomer) => void }) => (
    <button type="button" onClick={() => onSelect(customer)}>
      Selecionar Maria
    </button>
  ),
}));

const selectedAddress = {
  label: 'Rua Manual, 20 - Lajinha/MG',
  street: 'Rua Manual',
  number: '20',
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
      Escolher endereco manual
    </button>
  ),
}));

vi.mock('@/components/customers/customer-form', () => ({
  CustomerForm: () => <p>Formulario de cliente</p>,
}));

const pickupAddress = {
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
} satisfies CompanyAddressItem;

const serviceTypes = [
  {
    id: 'service-1',
    code: 'MOTO',
    name: 'Moto',
    active: true,
    createdAt: '2026-08-26T12:00:00.000Z',
  },
] satisfies ServiceTypeItem[];

function renderForm(onUnregisteredCustomers = vi.fn()) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <OperationalOrderForm
        token="token"
        pickupAddress={pickupAddress}
        serviceTypes={serviceTypes}
        onUnregisteredCustomers={onUnregisteredCustomers}
      />
    </QueryClientProvider>,
  );
  return onUnregisteredCustomers;
}

describe('OperationalOrderForm com clientes', () => {
  beforeEach(() => {
    mocks.create.mockReset();
    mocks.createBatch.mockReset();
    mocks.operations.mockReset();
    mocks.match.mockReset();
    mocks.create.mockResolvedValue({ id: 'delivery-1', displayNumber: 123 });
    mocks.operations.mockResolvedValue({ active: [], recent: [], counts: {} });
  });

  it('cria entrega com o snapshot preenchido pelo cliente selecionado', async () => {
    const onUnregisteredCustomers = renderForm();
    fireEvent.click(screen.getByRole('button', { name: 'Selecionar Maria' }));

    expect(screen.getByPlaceholderText(/Destinat/)).toHaveValue('Maria Oliveira');
    expect(screen.getByPlaceholderText('Telefone')).toHaveValue('33999999991');
    fireEvent.click(screen.getByRole('button', { name: 'Criar pedido' }));
    expect(await screen.findByRole('heading', { name: 'Este pedido tem volta?' })).toBeVisible();
    expect(mocks.create).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Não, sem volta' }));

    await waitFor(() => {
      expect(mocks.create).toHaveBeenCalledWith(
        'token',
        expect.objectContaining({
          serviceTypeId: 'service-1',
          requiresReturn: false,
          recipientName: 'Maria Oliveira',
          recipientPhone: '33999999991',
          dropoffAddress: expect.objectContaining({ street: 'Rua Um', number: '10' }),
        }),
      );
    });
    expect(mocks.match).not.toHaveBeenCalled();
    await waitFor(() => expect(onUnregisteredCustomers).toHaveBeenCalledWith([]));
  });

  it('mantem entrega manual e oferece cadastro somente depois do sucesso', async () => {
    mocks.match.mockResolvedValue({ customer: null });
    const onUnregisteredCustomers = renderForm();
    fireEvent.change(screen.getByPlaceholderText(/Destinat/), {
      target: { value: 'Cliente Manual' },
    });
    fireEvent.change(screen.getByPlaceholderText('Telefone'), {
      target: { value: '(33) 99999-9992' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Escolher endereco manual' }));
    fireEvent.click(screen.getByRole('button', { name: 'Criar pedido' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Não, sem volta' }));

    await waitFor(() => {
      expect(mocks.match).toHaveBeenCalledWith('token', { phone: '33999999992' });
      expect(onUnregisteredCustomers).toHaveBeenCalledWith([
        expect.objectContaining({ name: 'Cliente Manual', phone: '33999999992' }),
      ]);
    });
    expect(mocks.create).toHaveBeenCalledOnce();
  });

  it('envia requiresReturn=true ao escolher "Sim, com volta" mesmo sem marcar a caixa antes', async () => {
    renderForm();
    fireEvent.click(screen.getByRole('button', { name: 'Escolher endereco manual' }));
    fireEvent.click(screen.getByRole('button', { name: 'Criar pedido' }));

    expect(await screen.findByRole('heading', { name: 'Este pedido tem volta?' })).toBeVisible();
    expect(mocks.create).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Sim, com volta' }));

    await waitFor(() => {
      expect(mocks.create).toHaveBeenCalledWith(
        'token',
        expect.objectContaining({
          serviceTypeId: 'service-1',
          requiresReturn: true,
        }),
      );
    });
  });

  it('permite voltar e revisar o formulario sem enviar o pedido', async () => {
    renderForm();
    fireEvent.change(screen.getByPlaceholderText(/Destinat/), {
      target: { value: 'João Revisão' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Escolher endereco manual' }));
    fireEvent.click(screen.getByRole('button', { name: 'Criar pedido' }));

    fireEvent.click(await screen.findByRole('button', { name: 'Voltar e revisar' }));

    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: 'Este pedido tem volta?' })).toBeNull();
    });
    expect(mocks.create).not.toHaveBeenCalled();
    expect(screen.getByPlaceholderText(/Destinat/)).toHaveValue('João Revisão');
  });

  it('nao abre a confirmacao de volta quando falta endereco obrigatorio', () => {
    renderForm();
    fireEvent.click(screen.getByRole('button', { name: 'Criar pedido' }));

    expect(
      screen.getByText('Selecione no Google um endereço completo para cada destino.'),
    ).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Este pedido tem volta?' })).toBeNull();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('pergunta sobre a volta tambem na criacao em lote e aplica a escolha a todas as entregas', async () => {
    mocks.createBatch.mockResolvedValue({
      batchId: 'batch-1',
      deliveries: [{ id: 'delivery-1' }, { id: 'delivery-2' }],
    });
    renderForm();
    fireEvent.click(screen.getByRole('button', { name: 'Lote' }));
    for (const chooseAddress of screen.getAllByRole('button', { name: 'Escolher endereco manual' })) {
      fireEvent.click(chooseAddress);
    }

    fireEvent.click(screen.getByRole('button', { name: 'Criar lote (2)' }));

    expect(await screen.findByRole('heading', { name: 'Este lote tem volta?' })).toBeVisible();
    expect(mocks.createBatch).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Sim, com volta' }));

    await waitFor(() => {
      expect(mocks.createBatch).toHaveBeenCalledWith(
        'token',
        expect.objectContaining({
          deliveries: [
            expect.objectContaining({ requiresReturn: true }),
            expect.objectContaining({ requiresReturn: true }),
          ],
        }),
      );
    });
  });
});
