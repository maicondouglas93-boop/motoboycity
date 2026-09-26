import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type {
  CompanyCustomer,
  CompanyCustomerAddress,
  EnderecoDaEntrega,
} from '@motoboycity/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CadastroDaVenda } from '@/components/loja/cadastro-da-venda';
import type { StoreOrderCustomerSource } from '@/lib/company-customer';

/**
 * "Salvar cliente" na venda da loja online: conferido pelo telefone, com as
 * três situações — cliente novo, já cadastrado com este endereço, ou cadastrado
 * com outro endereço.
 */

const mocks = vi.hoisted(() => ({
  match: vi.fn(),
  endereco: vi.fn(),
}));

vi.mock('@/lib/api-client', () => ({
  companyCustomersApi: { match: mocks.match },
  companyAddressApi: { get: mocks.endereco },
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

const ENDERECO_SALVO: CompanyCustomerAddress = {
  street: 'Rua Sao Jose',
  number: '45',
  complement: null,
  city: 'Lajinha',
  state: 'MG',
  zip: '36930000',
  lat: -20.15,
  lng: -41.62,
  referenceNote: null,
};

const CLIENTE: CompanyCustomer = {
  id: 'cliente-1',
  name: 'Ana Souza',
  cpf: null,
  phone: '33988776655',
  addressLabel: 'Casa',
  address: ENDERECO_SALVO,
  addresses: [{ id: 'endereco-1', label: 'Casa', isPrimary: true, ...ENDERECO_SALVO }],
  createdAt: '2026-09-20T12:00:00.000Z',
  updatedAt: '2026-09-20T12:00:00.000Z',
};

// Os formulários de verdade usam o Google; aqui basta ver o que recebem e salvar.
vi.mock('@/components/customers/customer-form', () => ({
  CustomerForm: ({
    initial,
    onSaved,
  }: {
    initial: { name: string; phone: string; addressLabel: string; address: CompanyCustomerAddress };
    onSaved: (cliente: CompanyCustomer) => void;
  }) => (
    <div>
      <p>
        {initial.name} · {initial.phone} · {initial.addressLabel} · {initial.address.zip} ·{' '}
        {initial.address.referenceNote}
      </p>
      <button type="button" onClick={() => onSaved(CLIENTE)}>
        Cadastrar cliente
      </button>
    </div>
  ),
}));

vi.mock('@/components/customers/customer-address-form', () => ({
  CustomerAddressForm: ({
    customerId,
    prefill,
    onSaved,
  }: {
    customerId: string;
    prefill: { label: string; address: CompanyCustomerAddress };
    onSaved: (endereco: CompanyCustomer['addresses'][number]) => void;
  }) => (
    <div>
      <p>
        {customerId} · {prefill.label} · {prefill.address.street}, {prefill.address.number}
      </p>
      <button
        type="button"
        onClick={() =>
          onSaved({ id: 'endereco-2', label: prefill.label, isPrimary: false, ...prefill.address })
        }
      >
        Salvar endereço
      </button>
    </div>
  ),
}));

const ENTREGA: EnderecoDaEntrega = {
  rua: 'Rua São José',
  numero: '45',
  complemento: null,
  bairro: 'Centro',
  cidade: 'Lajinha',
  estado: 'MG',
  cep: '',
  referencia: 'Portão azul',
};
const VENDA = { cliente: 'Ana Souza', telefone: '33988776655', entrega: ENTREGA };

function abrir(venda: StoreOrderCustomerSource = VENDA) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <CadastroDaVenda venda={venda} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  window.localStorage.setItem('motoboycity.accessToken', 'token');
  mocks.match.mockReset();
  mocks.endereco.mockResolvedValue({ address: { zip: '36930111', state: 'MG' } });
});

describe('Salvar cliente a partir da venda', () => {
  it('telefone fora do cadastro: salva o cliente com os dados do pedido', async () => {
    mocks.match.mockResolvedValue({ customer: null });
    abrir();

    expect(await screen.findByText(/não está no seu cadastro de clientes/)).toBeInTheDocument();
    expect(mocks.match).toHaveBeenCalledWith('token', { phone: '33988776655' });
    const salvar = screen.getByRole('button', { name: 'Salvar cliente' });
    await waitFor(() => expect(salvar).toBeEnabled());
    fireEvent.click(salvar);

    // Sem CEP no checkout, o da loja; o bairro vira o nome do endereço e a referência.
    expect(
      screen.getByText('Ana Souza · 33988776655 · Centro · 36930111 · Bairro Centro · Portão azul'),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar cliente' }));

    expect(await screen.findByText(/este endereço já está salvo nele/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Abrir o cadastro de Ana Souza' })).toHaveAttribute(
      'href',
      '/clientes/cliente-1',
    );
  });

  it('já é cliente com este endereço: nada a salvar', async () => {
    mocks.match.mockResolvedValue({ customer: CLIENTE });
    abrir();

    expect(await screen.findByText(/este endereço já está salvo nele/)).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('já é cliente, com outro endereço: salva o endereço no cliente, e não outro cliente', async () => {
    mocks.match.mockResolvedValue({ customer: CLIENTE });
    abrir({ ...VENDA, entrega: { ...ENTREGA, rua: 'Avenida Brasil', numero: '900' } });

    const salvar = await screen.findByRole('button', { name: 'Salvar este endereço no cliente' });
    await waitFor(() => expect(salvar).toBeEnabled());
    fireEvent.click(salvar);

    expect(screen.getByText('cliente-1 · Centro · Avenida Brasil, 900')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Salvar endereço' }));

    expect(await screen.findByText(/este endereço já está salvo nele/)).toBeInTheDocument();
  });

  it('retirada não tem endereço: não oferece cadastro', () => {
    abrir({ ...VENDA, entrega: null });

    expect(screen.queryByText(/cadastro/)).not.toBeInTheDocument();
    expect(mocks.match).not.toHaveBeenCalled();
  });

  it('sem CEP no pedido nem endereço da loja, diz como completar', async () => {
    mocks.match.mockResolvedValue({ customer: null });
    mocks.endereco.mockResolvedValue({ address: null });
    abrir();

    const salvar = await screen.findByRole('button', { name: 'Salvar cliente' });
    await waitFor(() => expect(salvar).toBeEnabled());
    fireEvent.click(salvar);

    expect(screen.getByText(/O pedido veio sem CEP/)).toBeInTheDocument();
  });
});
