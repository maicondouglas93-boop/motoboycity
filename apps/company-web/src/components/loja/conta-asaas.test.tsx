import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ContaAsaasDaLoja } from '@motoboycity/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ContaAsaas } from '@/components/loja/conta-asaas';
import { PagamentosDaLoja } from '@/components/loja/pagamentos-da-loja';
import { OPERACAO_DE_EXEMPLO } from '@/lib/loja-mock';

/**
 * O recebimento online em Configurações: o que a tela manda ao ligar a conta
 * Asaas, o que mostra ligada, e o Pix que só se habilita com a conta e a chave
 * Pix.
 */

const mocks = vi.hoisted(() => ({
  conta: vi.fn(),
  conectar: vi.fn(),
  desconectar: vi.fn(),
  operation: vi.fn(),
  updatePayments: vi.fn(),
}));

vi.mock('@/lib/api-client', () => ({
  companyStoreAsaasApi: {
    conta: mocks.conta,
    conectar: mocks.conectar,
    desconectar: mocks.desconectar,
  },
  companyStoreOperationApi: {
    operation: mocks.operation,
    updatePayments: mocks.updatePayments,
  },
}));

const LIGADA: ContaAsaasDaLoja = {
  conectada: true,
  ambiente: 'PRODUCAO',
  nome: 'Açaí do Zé',
  email: 'financeiro@acai.com',
  temChavePix: true,
  conectadaEm: '2026-09-27T12:00:00.000Z',
};

function abrir(tela: React.ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(<QueryClientProvider client={queryClient}>{tela}</QueryClientProvider>);
}

beforeEach(() => {
  window.localStorage.setItem('motoboycity.accessToken', 'token');
  mocks.conta.mockResolvedValue({ conectada: false });
  mocks.conectar.mockResolvedValue(LIGADA);
  mocks.desconectar.mockResolvedValue({ conectada: false });
  mocks.operation.mockResolvedValue({ ...OPERACAO_DE_EXEMPLO, pagamentos: ['DINHEIRO'] });
  mocks.updatePayments.mockImplementation((_token: string, bloco: object) =>
    Promise.resolve({ ...OPERACAO_DE_EXEMPLO, ...bloco }),
  );
});

describe('Recebimento online pelo Asaas', () => {
  it('ligar manda a chave colada e o ambiente; ligada, mostra de quem é a conta', async () => {
    abrir(<ContaAsaas />);

    fireEvent.change(await screen.findByLabelText('Chave da API do Asaas'), {
      target: { value: '  $aact_prod_chave_da_loja  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Ligar a conta' }));

    await waitFor(() =>
      expect(mocks.conectar).toHaveBeenCalledWith('token', {
        chaveDaApi: '$aact_prod_chave_da_loja',
        ambiente: 'PRODUCAO',
      }),
    );
    expect(await screen.findByText('Açaí do Zé')).toBeInTheDocument();
    expect(screen.getByText('Conta de produção')).toBeInTheDocument();
    // A chave nunca volta para a tela.
    expect(screen.queryByDisplayValue(/aact/)).not.toBeInTheDocument();
  });

  it('conta de testes avisa que o Pix é de mentira; sem chave Pix, diz o que falta', async () => {
    mocks.conta.mockResolvedValue({ ...LIGADA, ambiente: 'SANDBOX', temChavePix: false });
    abrir(<ContaAsaas />);

    expect(await screen.findByText(/o Pix dos pedidos é de mentira/)).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('não tem chave Pix ativa');
  });

  it('desligar pede confirmação e manda desligar', async () => {
    mocks.conta.mockResolvedValue(LIGADA);
    abrir(<ContaAsaas />);

    fireEvent.click(await screen.findByRole('button', { name: 'Desligar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Desligar a conta' }));

    await waitFor(() => expect(mocks.desconectar).toHaveBeenCalledWith('token'));
    expect(await screen.findByLabelText('Chave da API do Asaas')).toBeInTheDocument();
  });

  it('a mensagem do servidor aparece quando o Asaas não reconhece a chave', async () => {
    mocks.conectar.mockRejectedValue(
      Object.assign(new Error('recusada'), {
        status: 400,
        body: { message: 'O Asaas não reconheceu essa chave na conta de produção.' },
      }),
    );
    abrir(<ContaAsaas />);

    fireEvent.change(await screen.findByLabelText('Chave da API do Asaas'), {
      target: { value: '$aact_chave_errada_000' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Ligar a conta' }));

    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
});

describe('Formas de pagamento com a conta Asaas', () => {
  it('sem a conta, o Pix fica travado; com a conta e chave Pix, entra; cartão, ainda não', async () => {
    abrir(<PagamentosDaLoja />);
    expect(await screen.findByLabelText('Pix')).toHaveAttribute('aria-disabled', 'true');
  });

  it('com a conta ligada, o Pix é gravado junto com as formas na entrega', async () => {
    mocks.conta.mockResolvedValue(LIGADA);
    abrir(<PagamentosDaLoja />);

    await waitFor(() =>
      expect(screen.getByLabelText('Pix')).not.toHaveAttribute('aria-disabled', 'true'),
    );
    expect(screen.getByLabelText('Cartão de crédito')).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(screen.getByLabelText('Pix'));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar formas de pagamento' }));

    await waitFor(() =>
      expect(mocks.updatePayments).toHaveBeenCalledWith('token', {
        pagamentos: ['DINHEIRO', 'PIX_ONLINE'],
      }),
    );
  });
});
