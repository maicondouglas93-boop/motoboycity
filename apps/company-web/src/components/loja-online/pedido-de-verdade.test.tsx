import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ApiError } from '@motoboycity/api-client';
import type { OperacaoPublica, PedidoDaLoja } from '@motoboycity/types';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Sacola } from '@/app/(loja)/pedir/[slug]/sacola/sacola';
import { OPERACAO_DE_EXEMPLO } from '@/lib/loja-mock';
import type { CardapioDaPagina } from '@/lib/loja-publica';

/**
 * A sacola da loja de verdade: o pedido vai para a API com os ids do que foi
 * escolhido e o total que o cliente viu, e a recusa do servidor aparece na
 * tela com a frase dele.
 */

const mocks = vi.hoisted(() => ({
  checkout: vi.fn(),
  pedidos: vi.fn(),
  push: vi.fn(),
}));

vi.mock('@/lib/conta-da-loja', () => ({
  CONTA_DISPONIVEL: true,
  CONFIGURACAO_DO_FIREBASE: { apiKey: 'x', authDomain: 'x', projectId: 'x', appId: 'x' },
}));
vi.mock('@/lib/firebase-da-loja', () => ({
  aoMudarOCliente: (ouvinte: (usuario: unknown) => void) => {
    ouvinte({ uid: 'user_1', displayName: 'Ana', photoURL: null });
    return () => {};
  },
  entrarComGoogle: vi.fn(),
  sair: vi.fn(),
  tokenDoCliente: () => Promise.resolve('token-do-google'),
}));
vi.mock('@/lib/api-client', () => ({
  publicStoreOrdersApi: { checkout: mocks.checkout, pedidos: mocks.pedidos },
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push }),
  useSearchParams: () => new URLSearchParams(),
}));

const SLUG = 'lanches-do-ze';

beforeAll(() => {
  window.matchMedia ??= ((consulta: string) => ({
    matches: false,
    media: consulta,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    onchange: null,
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});

const OPERACAO: OperacaoPublica = {
  funcionamento: {
    semana: [0, 1, 2, 3, 4, 5, 6].map((dia) => ({
      dia,
      faixas: [{ abre: '11:00', fecha: '14:00' }],
    })),
    excecoes: [],
    ajuste: null,
    mensagemFechada: '',
  },
  recebimento: OPERACAO_DE_EXEMPLO.recebimento,
  entrega: { ...OPERACAO_DE_EXEMPLO.entrega, pedidoMinimo: null },
  retirada: { ...OPERACAO_DE_EXEMPLO.retirada, ativa: false },
  agendamento: { ...OPERACAO_DE_EXEMPLO.agendamento, permitir: false },
  pagamentos: ['DINHEIRO'],
  bairros: [{ id: 'b1', nome: 'Centro', taxa: 5 }],
};

function cardapio(mudancas: Partial<CardapioDaPagina> = {}): CardapioDaPagina {
  return {
    vitrine: false,
    identidade: {
      nome: 'Lanches do Zé',
      tema: 'CLARO',
      corDaMarca: '#c2410c',
      corDeAcao: '#15803d',
      logoUrl: null,
    },
    categorias: [],
    produtos: [],
    operacao: OPERACAO,
    enderecoDeRetirada: null,
    ...mudancas,
  };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  // Quarta, meio-dia: a loja está aberta.
  vi.setSystemTime(new Date('2026-09-23T12:00:00-03:00'));
  window.localStorage.clear();
  window.localStorage.setItem(
    `loja:${SLUG}:sacola`,
    JSON.stringify([
      {
        produtoId: 'p1',
        nome: 'Açaí',
        tamanho: '500ml',
        escolhas: ['Morango'],
        tamanhoId: 't1',
        escolhaIds: ['e1'],
        quantidade: 2,
        unitario: 21,
      },
    ]),
  );
  // O cliente já pediu antes: o formulário nasce preenchido pela conta.
  window.localStorage.setItem(
    `loja:${SLUG}:user_1:cliente`,
    JSON.stringify({
      nome: 'Ana',
      telefone: '33999887766',
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
    }),
  );
});

afterEach(() => {
  vi.useRealTimers();
});

describe('Sacola da loja de verdade', () => {
  it('manda o pedido à API com os ids e o total visto, e abre "Meus pedidos"', async () => {
    mocks.checkout.mockResolvedValue({ numero: 7 } as PedidoDaLoja);
    render(<Sacola slug={SLUG} cardapio={cardapio()} />);

    fireEvent.click(await screen.findByRole('button', { name: /Fazer pedido/ }));

    await waitFor(() => expect(mocks.checkout).toHaveBeenCalledOnce());
    expect(mocks.checkout).toHaveBeenCalledWith(
      SLUG,
      'token-do-google',
      expect.objectContaining({
        modalidade: 'ENTREGA',
        itens: [{ produtoId: 'p1', tamanhoId: 't1', escolhas: ['e1'], quantidade: 2 }],
        entrega: expect.objectContaining({ bairroId: 'b1', rua: 'Rua A' }),
        pagamento: 'DINHEIRO',
        agendadoPara: null,
        totalVisto: 47,
      }),
    );
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith(`/pedir/${SLUG}/pedidos?novo=7`));
  });

  it('no Pix, pede o CPF de quem paga e o manda junto; sem ele, não segue', async () => {
    mocks.checkout.mockResolvedValue({ numero: 8 } as PedidoDaLoja);
    render(
      <Sacola
        slug={SLUG}
        cardapio={cardapio({ operacao: { ...OPERACAO, pagamentos: ['PIX_ONLINE', 'DINHEIRO'] } })}
      />,
    );

    const seguir = await screen.findByRole('button', { name: /Ir para o pagamento/ });
    expect(seguir).toBeDisabled();
    fireEvent.change(screen.getByLabelText('CPF de quem paga o Pix'), {
      target: { value: '529.982.247-25' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Ir para o pagamento/ }));

    await waitFor(() =>
      expect(mocks.checkout).toHaveBeenCalledWith(
        SLUG,
        'token-do-google',
        expect.objectContaining({ pagamento: 'PIX_ONLINE', cpf: '52998224725' }),
      ),
    );
  });

  it('a recusa do servidor aparece com a frase dele, e a sacola fica', async () => {
    mocks.checkout.mockRejectedValue(
      new ApiError(409, { message: 'O total mudou para R$ 52,00. Confira a sacola.' }),
    );
    render(<Sacola slug={SLUG} cardapio={cardapio()} />);

    fireEvent.click(await screen.findByRole('button', { name: /Fazer pedido/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent('O total mudou para R$ 52,00.');
    expect(mocks.push).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(`loja:${SLUG}:sacola`)).toContain('Açaí');
  });

  it('loja que ainda é vitrine diz isso antes do formulário', async () => {
    render(<Sacola slug={SLUG} cardapio={cardapio({ vitrine: true })} />);
    expect(
      await screen.findByText('Esta loja ainda não recebe pedidos por aqui'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Fazer pedido/ })).not.toBeInTheDocument();
  });
});
