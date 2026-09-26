import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { OperacaoDaLoja, PedidoDaLoja, StoreSettings } from '@motoboycity/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import LojaVendasPage from '@/app/(app)/loja/vendas/page';
import { OPERACAO_DE_EXEMPLO } from '@/lib/loja-mock';

/**
 * A tela de Vendas fica atrás do login do painel; este teste confere o que ela
 * manda para a API em cada ação, o pedido da loja que entrega com motoboy
 * próprio, a corrida do MOTOboyCity, a impressão e a chave dos pedidos pela
 * página.
 */

const mocks = vi.hoisted(() => ({
  vendas: vi.fn(),
  avancar: vi.fn(),
  cancelar: vi.fn(),
  chamarMotoboyCity: vi.fn(),
  chamarDeNovo: vi.fn(),
  entregarComALoja: vi.fn(),
  operation: vi.fn(),
  settings: vi.fn(),
  updateAcceptsOrders: vi.fn(),
}));

vi.mock('@/lib/api-client', () => ({
  companyStoreOrdersApi: {
    vendas: mocks.vendas,
    avancar: mocks.avancar,
    cancelar: mocks.cancelar,
    chamarMotoboyCity: mocks.chamarMotoboyCity,
    chamarDeNovo: mocks.chamarDeNovo,
    entregarComALoja: mocks.entregarComALoja,
  },
  companyStoreOperationApi: { operation: mocks.operation },
  companyStoreSettingsApi: {
    settings: mocks.settings,
    updateAcceptsOrders: mocks.updateAcceptsOrders,
  },
}));

const AGORA = new Date();

function pedido(mudancas: Partial<PedidoDaLoja> = {}): PedidoDaLoja {
  return {
    id: 'pedido-1',
    numero: 42,
    criadoEm: AGORA.toISOString(),
    modalidade: 'ENTREGA',
    etapa: 'PRONTO',
    historico: [
      { etapa: 'NOVO', em: AGORA.toISOString() },
      { etapa: 'ACEITO', em: AGORA.toISOString() },
      { etapa: 'EM_PREPARO', em: AGORA.toISOString() },
      { etapa: 'PRONTO', em: AGORA.toISOString() },
    ],
    janela: null,
    minutosDePreparo: 20,
    minutosDeEntrega: 15,
    cancelamento: null,
    entregaPor: 'LOJA',
    cliente: { nome: 'Ana', telefone: '33999887766' },
    itens: [
      {
        produtoId: 'p1',
        nome: 'Açaí',
        tamanho: '500ml',
        escolhas: [],
        quantidade: 1,
        unitario: 18,
        total: 18,
      },
    ],
    subtotal: 18,
    taxaDeEntrega: 5,
    total: 23,
    pagamento: 'DINHEIRO',
    trocoPara: null,
    entrega: {
      rua: 'Rua A',
      numero: '10',
      complemento: null,
      bairro: 'Centro',
      cidade: 'Lajinha',
      estado: 'MG',
      cep: '',
      referencia: null,
    },
    observacao: null,
    corrida: null,
    avisoDaCorrida: null,
    pagamentoOnline: null,
    ...mudancas,
  };
}

const LOJA: StoreSettings = {
  slug: 'acai-do-ze',
  name: 'Açaí do Zé',
  suggestedSlug: 'acai-do-ze',
  identity: { theme: 'CLARO', brandColor: '#c2410c', actionColor: '#15803d', logoUrl: null },
  recebePedidos: false,
};

function operacaoQueEntrega(): OperacaoDaLoja {
  return {
    ...OPERACAO_DE_EXEMPLO,
    entrega: { ...OPERACAO_DE_EXEMPLO.entrega, quemEntrega: 'LOJA' },
  };
}

function abrir() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <LojaVendasPage />
    </QueryClientProvider>,
  );
}

async function cartao(numero: number): Promise<HTMLElement> {
  const elemento = (await screen.findByText(`#${numero}`)).closest<HTMLElement>(
    '[data-slot="card"]',
  );
  if (!elemento) throw new Error(`Cartão do pedido ${numero} não encontrado`);
  return elemento;
}

beforeEach(() => {
  window.localStorage.setItem('motoboycity.accessToken', 'token');
  mocks.vendas.mockResolvedValue([pedido()]);
  mocks.operation.mockResolvedValue(operacaoQueEntrega());
  mocks.settings.mockResolvedValue(LOJA);
});

describe('Vendas — entregador da loja', () => {
  it('a loja marca a saída; num aperto, passa o pedido para o MOTOboyCity', async () => {
    mocks.chamarMotoboyCity.mockResolvedValue(
      pedido({
        entregaPor: 'MOTOBOYCITY',
        corrida: { numero: 900, situacao: 'BUSCANDO_MOTOBOY', agendadaPara: null, motoboy: null },
      }),
    );
    abrir();

    const doPedido = within(await cartao(42));
    expect(doPedido.getByText('Entregador da loja')).toBeInTheDocument();
    expect(doPedido.getByRole('button', { name: 'Saiu para entrega' })).toBeInTheDocument();
    // Sem corrida, a loja ainda cancela o pronto.
    expect(doPedido.getByRole('button', { name: 'Cancelar pedido' })).toBeInTheDocument();

    fireEvent.click(doPedido.getByRole('button', { name: 'Chamar motoboy do MOTOboyCity' }));
    // Pronto, o motoboy é chamado na hora: a confirmação diz isso.
    expect(doPedido.getByText(/pronto, o motoboy é chamado na hora/)).toBeInTheDocument();
    fireEvent.click(doPedido.getByRole('button', { name: 'Chamar motoboy' }));

    await waitFor(() => expect(mocks.chamarMotoboyCity).toHaveBeenCalledWith('token', 'pedido-1'));
    const depois = within(await cartao(42));
    expect(await depois.findByText('Motoboy do MOTOboyCity')).toBeInTheDocument();
    expect(depois.getByText('Buscando motoboy · corrida #900')).toBeInTheDocument();
    // A saída vem da corrida: não há botão para marcá-la, nem para cancelar.
    expect(depois.queryByRole('button', { name: 'Motoboy coletou' })).not.toBeInTheDocument();
    expect(depois.queryByRole('button', { name: 'Cancelar pedido' })).not.toBeInTheDocument();
  });

  it('a corrida que não nasceu avisa, e a loja chama de novo ou entrega ela mesma', async () => {
    mocks.vendas.mockResolvedValue([
      pedido({
        etapa: 'EM_PREPARO',
        entregaPor: 'MOTOBOYCITY',
        historico: [
          { etapa: 'NOVO', em: AGORA.toISOString() },
          { etapa: 'ACEITO', em: AGORA.toISOString() },
          { etapa: 'EM_PREPARO', em: AGORA.toISOString() },
        ],
        avisoDaCorrida: 'Não deu para chamar o motoboy: A operação está fora do horário.',
      }),
    ]);
    mocks.chamarDeNovo.mockResolvedValue(
      pedido({
        etapa: 'EM_PREPARO',
        entregaPor: 'MOTOBOYCITY',
        corrida: {
          numero: 901,
          situacao: 'AGENDADA',
          agendadaPara: new Date(AGORA.getTime() + 15 * 60_000).toISOString(),
          motoboy: null,
        },
      }),
    );
    mocks.entregarComALoja.mockResolvedValue(pedido({ etapa: 'EM_PREPARO', entregaPor: 'LOJA' }));
    abrir();

    const doPedido = within(await cartao(42));
    expect(doPedido.getByRole('status')).toHaveTextContent('fora do horário');
    fireEvent.click(doPedido.getByRole('button', { name: /Chamar o motoboy de novo/ }));
    await waitFor(() => expect(mocks.chamarDeNovo).toHaveBeenCalledWith('token', 'pedido-1'));
    expect(
      await within(await cartao(42)).findByText(/Motoboy chamado para as .* · corrida #901/),
    ).toBeInTheDocument();
  });

  it('a corrida cancelada pela central pode passar ao entregador da loja', async () => {
    mocks.vendas.mockResolvedValue([
      pedido({
        entregaPor: 'MOTOBOYCITY',
        corrida: { numero: 900, situacao: 'CANCELADA', agendadaPara: null, motoboy: null },
        avisoDaCorrida: 'A central cancelou a corrida.',
      }),
    ]);
    mocks.entregarComALoja.mockResolvedValue(pedido({ entregaPor: 'LOJA' }));
    abrir();

    const doPedido = within(await cartao(42));
    fireEvent.click(doPedido.getByRole('button', { name: 'Entregar com o entregador da loja' }));
    await waitFor(() => expect(mocks.entregarComALoja).toHaveBeenCalledWith('token', 'pedido-1'));
    expect(
      await within(await cartao(42)).findByRole('button', { name: 'Saiu para entrega' }),
    ).toBeInTheDocument();
  });

  it('aceitar manda o preparo escolhido', async () => {
    mocks.vendas.mockResolvedValue([
      pedido({ etapa: 'NOVO', historico: [{ etapa: 'NOVO', em: AGORA.toISOString() }] }),
    ]);
    mocks.avancar.mockResolvedValue(pedido({ etapa: 'ACEITO' }));
    abrir();

    const doPedido = within(await cartao(42));
    fireEvent.change(doPedido.getByLabelText('Tempo de preparo do pedido 42'), {
      target: { value: '40' },
    });
    fireEvent.click(doPedido.getByRole('button', { name: 'Aceitar' }));
    await waitFor(() =>
      expect(mocks.avancar).toHaveBeenCalledWith('token', 'pedido-1', {
        para: 'ACEITO',
        minutosDePreparo: 40,
      }),
    );
  });

  it('cada pedido tem o botão de imprimir, numa aba nova', async () => {
    abrir();
    const imprimir = within(await cartao(42)).getByRole('link', { name: 'Imprimir' });
    expect(imprimir).toHaveAttribute('href', '/loja/vendas/42/imprimir');
    expect(imprimir).toHaveAttribute('target', '_blank');
  });
});

describe('Vendas — pedidos pela página', () => {
  it('a loja liga os pedidos pela página daqui', async () => {
    mocks.updateAcceptsOrders.mockResolvedValue({ ...LOJA, recebePedidos: true });
    abrir();

    expect(await screen.findByText('Pedidos pela página desligados.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Ligar os pedidos' }));

    await waitFor(() =>
      expect(mocks.updateAcceptsOrders).toHaveBeenCalledWith('token', { recebePedidos: true }),
    );
    expect(await screen.findByText('Pedidos pela página ligados.')).toBeInTheDocument();
  });
});
