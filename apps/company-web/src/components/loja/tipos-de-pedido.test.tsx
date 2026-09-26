import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { OperacaoDaLoja } from '@motoboycity/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TiposDePedidoPage from '@/app/(app)/loja/tipos-de-pedido/page';
import { OPERACAO_DE_EXEMPLO } from '@/lib/loja-mock';

/**
 * A tela de Tipos de pedido fica atrás do login do painel e não abre sem a
 * API; este teste é o que confere que a opção do prazo chega ao que é salvo.
 */

const mocks = vi.hoisted(() => ({
  operation: vi.fn(),
  updateOrderTypes: vi.fn(),
  endereco: vi.fn(),
}));

vi.mock('@/lib/api-client', () => ({
  companyStoreOperationApi: {
    operation: mocks.operation,
    updateOrderTypes: mocks.updateOrderTypes,
  },
  companyAddressApi: { get: mocks.endereco },
}));

/** Como o banco (JSONB) devolve: o mesmo conteúdo, com as chaves em outra ordem. */
function comoOBancoDevolve<T>(valor: T): T {
  if (Array.isArray(valor)) return valor.map(comoOBancoDevolve) as T;
  if (valor !== null && typeof valor === 'object') {
    return Object.fromEntries(
      Object.entries(valor)
        .reverse()
        .map(([chave, item]) => [chave, comoOBancoDevolve(item)]),
    ) as T;
  }
  return valor;
}

async function abrir() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <TiposDePedidoPage />
    </QueryClientProvider>,
  );
  await screen.findByRole('button', { name: 'Salvar tipos de pedido' });
}

function caixaDe(texto: RegExp): HTMLElement {
  const caixa = screen
    .getByText(texto)
    .closest('label')
    ?.querySelector<HTMLElement>('[role=checkbox]');
  if (!caixa) throw new Error(`Caixa não encontrada: ${texto}`);
  return caixa;
}

function ligarAceiteManual() {
  fireEvent.click(screen.getByLabelText(/Aprovar manualmente/));
}

function salvar() {
  fireEvent.click(screen.getByRole('button', { name: 'Salvar tipos de pedido' }));
}

/** O que a tela mandou gravar. */
async function gravado(): Promise<Partial<OperacaoDaLoja>> {
  await waitFor(() => expect(mocks.updateOrderTypes).toHaveBeenCalledOnce());
  const [token, partes] = mocks.updateOrderTypes.mock.calls[0] as [string, Partial<OperacaoDaLoja>];
  expect(token).toBe('token');
  return partes;
}

beforeEach(() => {
  window.localStorage.setItem('motoboycity.accessToken', 'token');
  mocks.operation.mockResolvedValue(comoOBancoDevolve(OPERACAO_DE_EXEMPLO));
  mocks.endereco.mockResolvedValue({
    address: {
      id: 'e1',
      label: null,
      street: 'Rua da Empresa',
      number: '12',
      complement: null,
      city: 'Lajinha',
      state: 'MG',
      zip: '36980-000',
      lat: null,
      lng: null,
    },
  });
  mocks.updateOrderTypes.mockImplementation((_token: string, partes: Partial<OperacaoDaLoja>) =>
    Promise.resolve(comoOBancoDevolve({ ...OPERACAO_DE_EXEMPLO, ...partes })),
  );
});

describe('Tipos de pedido — prazo do aceite', () => {
  it('só aparece no aceite manual, e já vem ligado', async () => {
    await abrir();
    expect(screen.queryByText(/Cancelar sozinho/)).not.toBeInTheDocument();

    ligarAceiteManual();
    expect(caixaDe(/Cancelar sozinho/)).toHaveAttribute('aria-checked', 'true');
  });

  it('o prazo escolhido é o que vai para o sistema', async () => {
    await abrir();
    ligarAceiteManual();
    fireEvent.change(screen.getByLabelText('Quanto tempo esperar o aceite'), {
      target: { value: '20' },
    });
    salvar();

    expect((await gravado()).recebimento).toMatchObject({ modo: 'MANUAL', prazoDoAceiteMin: 20 });
  });

  it('desligado, vai que o pedido não cai sozinho', async () => {
    await abrir();
    ligarAceiteManual();
    fireEvent.click(caixaDe(/Cancelar sozinho/));
    salvar();

    expect((await gravado()).recebimento).toMatchObject({ modo: 'MANUAL', prazoDoAceiteMin: null });
  });
});

describe('Tipos de pedido — quem faz a entrega', () => {
  it('vem pelo MOTOboyCity, e a loja com motoboy próprio escolhe o entregador dela', async () => {
    await abrir();
    expect(screen.getByLabelText(/Motoboy do MOTOboyCity/)).toBeChecked();

    fireEvent.click(screen.getByLabelText(/Entregador da loja/));
    salvar();

    expect((await gravado()).entrega?.quemEntrega).toBe('LOJA');
  });
});

describe('Tipos de pedido — retirada', () => {
  it('o endereço padrão é o da empresa, e não o do exemplo', async () => {
    await abrir();
    expect(
      await screen.findByText(
        'Rua da Empresa, 12 · Lajinha/MG — o mesmo de onde o motoboy retira.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Coronel Pedro Alves/)).not.toBeInTheDocument();
  });
});

describe('Tipos de pedido — depois de salvar', () => {
  it('diz que está tudo salvo, mesmo com o banco devolvendo as chaves em outra ordem', async () => {
    await abrir();
    expect(screen.getByText('Tudo salvo.')).toBeInTheDocument();

    ligarAceiteManual();
    expect(screen.getByText('Há alterações não salvas.')).toBeInTheDocument();
    salvar();

    expect(await screen.findByText('Tudo salvo.')).toBeInTheDocument();
  });

  it('mostra o erro do servidor e mantém o que foi mudado', async () => {
    mocks.updateOrderTypes.mockRejectedValue(new Error('fora do ar'));
    await abrir();
    ligarAceiteManual();
    salvar();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível salvar os tipos de pedido.',
    );
    expect(screen.getByLabelText(/Aprovar manualmente/)).toBeChecked();
  });
});
