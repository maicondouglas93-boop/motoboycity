import { fireEvent, render, screen } from '@testing-library/react';
import type { OperacaoPublica } from '@motoboycity/types';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { PorteiraDeLogin } from '@/components/loja-online/conta';
import { LojaPublica } from '@/components/loja-online/loja-publica';
import { paletaDoTema } from '@/components/loja-online/paleta';
import { OPERACAO_DE_EXEMPLO } from '@/lib/loja-mock';
import type { CardapioDaPagina } from '@/lib/loja-publica';

/**
 * A loja de verdade na página do cliente: o cardápio publicado, o horário e a
 * situação dela, e nada que dê a entender que dá para pedir — o pedido ainda
 * não chega à loja.
 */

// Nos testes não há configuração do Firebase — é o caso de produção antes de
// ela existir. Se algum componente tentar usar o login mesmo assim, o teste
// acusa.
vi.mock('@/lib/firebase-da-loja', () => {
  const proibido = () => {
    throw new Error('Login do Firebase usado sem configuração');
  };
  return {
    aoMudarOCliente: proibido,
    entrarComGoogle: proibido,
    sair: proibido,
    tokenDoCliente: proibido,
  };
});

beforeAll(() => {
  // O jsdom não tem estes; a barra de categorias, a sacola e o movimento usam.
  HTMLElement.prototype.scrollTo = () => {};
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  window.IntersectionObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof IntersectionObserver;
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

afterEach(() => {
  vi.useRealTimers();
});

/** Uma quarta-feira, na hora da loja (Brasília, UTC-3). */
function naQuarta(horaNaLoja: string) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(`2026-09-23T${horaNaLoja}:00-03:00`));
}

/**
 * Do banco: todo dia das 11h às 14h, com recado para quando está fechada, dois
 * bairros e pagamento na entrega.
 */
const OPERACAO: OperacaoPublica = {
  funcionamento: {
    semana: [0, 1, 2, 3, 4, 5, 6].map((dia) => ({
      dia,
      faixas: [{ abre: '11:00', fecha: '14:00' }],
    })),
    excecoes: [],
    ajuste: null,
    mensagemFechada: 'Voltamos amanhã no almoço.',
  },
  recebimento: OPERACAO_DE_EXEMPLO.recebimento,
  entrega: OPERACAO_DE_EXEMPLO.entrega,
  retirada: OPERACAO_DE_EXEMPLO.retirada,
  agendamento: OPERACAO_DE_EXEMPLO.agendamento,
  pagamentos: ['DINHEIRO', 'DEBITO_MAQUININHA'],
  bairros: [
    { id: 'b1', nome: 'Centro', taxa: 6 },
    { id: 'b2', nome: 'Vila Nova', taxa: 9 },
  ],
};

const VITRINE: CardapioDaPagina = {
  vitrine: true,
  identidade: {
    nome: 'Lanches do Zé',
    tema: 'CLARO',
    corDaMarca: '#c2410c',
    corDeAcao: '#15803d',
    logoUrl: null,
  },
  categorias: [{ id: 'c1', nome: 'Lanches' }],
  produtos: [
    {
      id: 'p1',
      nome: 'X-Burger',
      descricao: 'Pão, carne e queijo',
      categoriaId: 'c1',
      imagemUrl: null,
      precoUnico: 22,
      situacao: 'publicado',
      tamanhos: [],
      grupos: [],
    },
  ],
  operacao: OPERACAO,
  enderecoDeRetirada: null,
};

describe('Loja pública — vitrine', () => {
  it('mostra o cardápio e a situação da loja, e diz que ainda não recebe pedido', () => {
    naQuarta('12:00');
    render(<LojaPublica slug="lanches-do-ze" cardapio={VITRINE} />);

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Lanches do Zé');
    expect(screen.getByText('Aberto até 14:00')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(
      'Esta loja ainda não recebe pedidos por aqui.',
    );
    expect(screen.getByText('X-Burger')).toBeInTheDocument();
    // O tempo, a taxa dos bairros e as formas de pagamento são os dela.
    expect(screen.getByText('35 a 50 min')).toBeInTheDocument();
    expect(screen.getByText('R$ 6,00 a R$ 9,00')).toBeInTheDocument();
    expect(screen.getByText('Retirada sem taxa')).toBeInTheDocument();
    expect(screen.getByText('Na entrega: dinheiro, débito')).toBeInTheDocument();
    expect(screen.queryByText(/Online:/)).not.toBeInTheDocument();
    expect(screen.queryByText('Meus pedidos')).not.toBeInTheDocument();
  });

  it('com logo, a logo entra no lugar da inicial', () => {
    naQuarta('12:00');
    const { container } = render(
      <LojaPublica
        slug="lanches-do-ze"
        cardapio={{
          ...VITRINE,
          identidade: { ...VITRINE.identidade, logoUrl: 'https://ik.imagekit.io/x/logo.png' },
        }}
      />,
    );
    expect(container.querySelector('header img')).toHaveAttribute(
      'src',
      'https://ik.imagekit.io/x/logo.png',
    );
  });

  it('sem bairro cadastrado, não inventa taxa', () => {
    naQuarta('12:00');
    render(
      <LojaPublica
        slug="lanches-do-ze"
        cardapio={{ ...VITRINE, operacao: { ...OPERACAO, bairros: [] } }}
      />,
    );
    // "Entrega", sem valor: a taxa só existe por bairro.
    expect(screen.getByText('Entrega')).toBeInTheDocument();
    expect(screen.queryByText('a combinar')).not.toBeInTheDocument();
  });

  it('fechada, diz quando abre e mostra o recado, sem prometer pedido', () => {
    naQuarta('20:00');
    render(<LojaPublica slug="lanches-do-ze" cardapio={VITRINE} />);

    const [fechada, vitrine] = screen.getAllByRole('status');
    expect(fechada).toHaveTextContent('Fechado · abre amanhã às 11:00');
    expect(fechada).toHaveTextContent('Voltamos amanhã no almoço.');
    expect(fechada).not.toHaveTextContent(/pedir|agendar/);
    expect(vitrine).toHaveTextContent('Esta loja ainda não recebe pedidos por aqui.');
  });

  it('pausada pelo painel, mostra quando os pedidos voltam', () => {
    naQuarta('12:00');
    render(
      <LojaPublica
        slug="lanches-do-ze"
        cardapio={{
          ...VITRINE,
          operacao: {
            ...OPERACAO,
            funcionamento: {
              ...OPERACAO.funcionamento,
              ajuste: {
                estado: 'PAUSADA',
                desde: '2026-09-23T11:50:00-03:00',
                ate: '2026-09-23T12:30:00-03:00',
              },
            },
          },
        }}
      />,
    );

    expect(screen.getAllByRole('status')[0]).toHaveTextContent(
      'Pedidos pausados · voltam às 12:30',
    );
  });

  it('o produto abre, mas o botão não deixa pedir', () => {
    naQuarta('12:00');
    render(<LojaPublica slug="lanches-do-ze" cardapio={VITRINE} />);

    fireEvent.click(screen.getByText('X-Burger'));

    // O nome do botão leva o preço junto: "Pedidos em breve R$ 22,00".
    expect(screen.getByRole('button', { name: /Pedidos em breve/ })).toBeDisabled();
  });
});

describe('Loja pública — sem a configuração do login', () => {
  it('a demonstração abre sem conta, e a sacola diz que ainda não dá para pedir', () => {
    render(
      <LojaPublica
        slug="minha-loja"
        cardapio={{
          ...VITRINE,
          vitrine: false,
          identidade: { ...VITRINE.identidade, nome: 'Demo' },
          operacao: null,
        }}
      />,
    );
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Demo');
    expect(screen.queryByRole('button', { name: 'Entrar' })).not.toBeInTheDocument();
  });

  it('a porteira da sacola não oferece login que não existe', () => {
    render(
      <PorteiraDeLogin
        paleta={paletaDoTema('CLARO')}
        corDeAcao="#15803d"
        textoDoBotao="Entrar e pedir"
        resumo="Seu pedido de R$ 22,00 está aqui."
      />,
    );
    expect(screen.getByText('Pedidos por aqui em breve')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Entrar e pedir' })).not.toBeInTheDocument();
  });
});
