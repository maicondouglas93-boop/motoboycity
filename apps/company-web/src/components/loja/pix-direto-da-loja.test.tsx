import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ContaAsaasDaLoja } from '@motoboycity/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PagamentosDaLoja } from '@/components/loja/pagamentos-da-loja';
import { OPERACAO_DE_EXEMPLO } from '@/lib/loja-mock';

/**
 * O Pix direto em Configurações: a loja marca a forma, digita a chave, o nome e o
 * WhatsApp, e o servidor grava. É um Pix ou o outro — o do Asaas e este não
 * convivem —, e a chave só é pedida (e conferida) com a forma marcada.
 */

const mocks = vi.hoisted(() => ({
  conta: vi.fn(),
  operation: vi.fn(),
  updatePayments: vi.fn(),
}));

vi.mock('@/lib/api-client', () => ({
  companyStoreAsaasApi: { conta: mocks.conta },
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

const CHAVE = {
  tipoDeChave: 'CELULAR' as const,
  chave: '(33) 99988-7766',
  nomeDoRecebedor: 'Lanches do Ze',
  cidade: 'Lajinha',
  whatsapp: '33988776655',
};

function abrir() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <PagamentosDaLoja />
    </QueryClientProvider>,
  );
}

const marcada = (nome: string) => screen.getByLabelText(nome).getAttribute('aria-checked');

function preencher(dados: Partial<Record<string, string>> = {}) {
  const valores = {
    'Chave Pix': '(33) 99988-7766',
    'Nome que aparece no banco': 'Lanches do Ze',
    Cidade: 'Lajinha',
    'WhatsApp da loja': '(33) 98877-6655',
    ...dados,
  };
  for (const [rotulo, valor] of Object.entries(valores)) {
    fireEvent.change(screen.getByLabelText(rotulo), { target: { value: valor } });
  }
}

beforeEach(() => {
  window.localStorage.clear();
  window.localStorage.setItem('motoboycity.accessToken', 'token');
  mocks.conta.mockResolvedValue({ conectada: false });
  mocks.operation.mockResolvedValue({
    ...OPERACAO_DE_EXEMPLO,
    pagamentos: ['DINHEIRO'],
    pixDireto: null,
  });
  mocks.updatePayments.mockImplementation((_token: string, bloco: object) =>
    Promise.resolve({ ...OPERACAO_DE_EXEMPLO, ...bloco }),
  );
});

describe('Pix direto nas formas de pagamento', () => {
  it('não precisa da conta Asaas: fica liberado, e marcado mostra os campos da chave', async () => {
    abrir();

    const direto = await screen.findByLabelText('Pix direto na sua chave');
    expect(direto).not.toHaveAttribute('aria-disabled', 'true');
    expect(screen.queryByLabelText('Chave Pix')).not.toBeInTheDocument();

    fireEvent.click(direto);

    expect(await screen.findByLabelText('Chave Pix')).toBeInTheDocument();
    expect(screen.getByLabelText('Tipo da chave')).toBeInTheDocument();
    expect(screen.getByLabelText('Nome que aparece no banco')).toBeInTheDocument();
    expect(screen.getByLabelText('Cidade')).toBeInTheDocument();
    expect(screen.getByLabelText('WhatsApp da loja')).toBeInTheDocument();
    // O que a loja precisa saber antes de ligar: ninguém confirma sozinho.
    expect(screen.getByText(/nada confirma o pagamento sozinho/)).toBeInTheDocument();
  });

  it('é um Pix ou o outro: marcar um desmarca o outro', async () => {
    mocks.conta.mockResolvedValue(LIGADA);
    abrir();

    await waitFor(() =>
      expect(screen.getByLabelText('Pix pelo Asaas')).not.toHaveAttribute('aria-disabled', 'true'),
    );
    fireEvent.click(screen.getByLabelText('Pix pelo Asaas'));
    expect(marcada('Pix pelo Asaas')).toBe('true');

    fireEvent.click(screen.getByLabelText('Pix direto na sua chave'));
    expect(marcada('Pix direto na sua chave')).toBe('true');
    expect(marcada('Pix pelo Asaas')).toBe('false');

    fireEvent.click(screen.getByLabelText('Pix pelo Asaas'));
    expect(marcada('Pix pelo Asaas')).toBe('true');
    expect(marcada('Pix direto na sua chave')).toBe('false');
    // Sem o Pix direto marcado, os campos dele recolhem.
    expect(screen.queryByLabelText('Chave Pix')).not.toBeInTheDocument();
  });

  it('salvar sem os dados: cada campo mostra o seu erro, o primeiro recebe o foco e nada é enviado', async () => {
    abrir();
    fireEvent.click(await screen.findByLabelText('Pix direto na sua chave'));

    fireEvent.click(screen.getByRole('button', { name: 'Salvar formas de pagamento' }));

    expect(await screen.findByText('Informe a chave Pix.')).toBeInTheDocument();
    expect(
      screen.getByText('Informe o nome que o cliente vê no banco ao pagar.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Informe a cidade.')).toBeInTheDocument();
    expect(screen.getByText('Informe o WhatsApp com DDD.')).toBeInTheDocument();
    expect(screen.getByLabelText('Chave Pix')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Chave Pix')).toHaveFocus();
    expect(mocks.updatePayments).not.toHaveBeenCalled();
  });

  it('a chave é conferida pelo tipo escolhido: CPF de fora não passa como celular', async () => {
    abrir();
    fireEvent.click(await screen.findByLabelText('Pix direto na sua chave'));
    preencher({ 'Chave Pix': '111.111.111-11' });
    fireEvent.change(screen.getByLabelText('Tipo da chave'), { target: { value: 'CPF_CNPJ' } });

    fireEvent.click(screen.getByRole('button', { name: 'Salvar formas de pagamento' }));

    expect(
      await screen.findByText('CPF ou CNPJ inválido. Confira os números.'),
    ).toBeInTheDocument();
    expect(mocks.updatePayments).not.toHaveBeenCalled();
  });

  it('com os dados certos, grava as formas e a chave — o WhatsApp só com os dígitos', async () => {
    abrir();
    fireEvent.click(await screen.findByLabelText('Pix direto na sua chave'));
    preencher();

    fireEvent.click(screen.getByRole('button', { name: 'Salvar formas de pagamento' }));

    await waitFor(() =>
      expect(mocks.updatePayments).toHaveBeenCalledWith('token', {
        pagamentos: ['DINHEIRO', 'PIX_DIRETO'],
        pixDireto: CHAVE,
      }),
    );
  });

  it('a chave gravada volta preenchida; desmarcar a forma salva sem mexer na chave', async () => {
    mocks.operation.mockResolvedValue({
      ...OPERACAO_DE_EXEMPLO,
      pagamentos: ['DINHEIRO', 'PIX_DIRETO'],
      pixDireto: CHAVE,
    });
    abrir();

    expect(await screen.findByLabelText('Chave Pix')).toHaveValue('(33) 99988-7766');
    expect(screen.getByLabelText('Nome que aparece no banco')).toHaveValue('Lanches do Ze');
    expect(screen.getByLabelText('WhatsApp da loja')).toHaveValue('33988776655');

    fireEvent.click(screen.getByLabelText('Pix direto na sua chave'));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar formas de pagamento' }));

    await waitFor(() =>
      expect(mocks.updatePayments).toHaveBeenCalledWith('token', { pagamentos: ['DINHEIRO'] }),
    );
  });

  it('mexer só nos dados do Pix já marcado habilita salvar', async () => {
    mocks.operation.mockResolvedValue({
      ...OPERACAO_DE_EXEMPLO,
      pagamentos: ['DINHEIRO', 'PIX_DIRETO'],
      pixDireto: CHAVE,
    });
    abrir();
    const salvar = await screen.findByRole('button', { name: 'Salvar formas de pagamento' });
    expect(salvar).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Cidade'), { target: { value: 'Ipatinga' } });

    expect(salvar).toBeEnabled();
    expect(screen.getByText('Há alterações não salvas.')).toBeInTheDocument();
  });
});
