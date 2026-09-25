import type { ReactNode } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { LojaPublica } from '@/components/loja-online/loja-publica';
import type { CardapioDaPagina } from '@/lib/loja-publica';

/**
 * A loja de verdade na página do cliente: o cardápio publicado, e nada que dê
 * a entender que dá para pedir — o pedido ainda não chega à loja.
 */

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({ userId: null, isLoaded: true }),
  SignInButton: ({ children }: { children: ReactNode }) => children,
  SignUpButton: ({ children }: { children: ReactNode }) => children,
  UserButton: () => null,
}));

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

const VITRINE: CardapioDaPagina = {
  vitrine: true,
  identidade: { nome: 'Lanches do Zé', tema: 'CLARO', corDaMarca: '#c2410c', corDeAcao: '#15803d' },
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
};

describe('Loja pública — vitrine', () => {
  it('mostra o cardápio da loja e diz que ainda não recebe pedido', () => {
    render(<LojaPublica slug="lanches-do-ze" cardapio={VITRINE} />);

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Lanches do Zé');
    expect(screen.getByText('Cardápio · pedidos por aqui em breve')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(
      'Esta loja ainda não recebe pedidos por aqui.',
    );
    expect(screen.getByText('X-Burger')).toBeInTheDocument();
    // Nada do exemplo como se fosse da loja: taxa, pagamento, "Meus pedidos".
    expect(screen.queryByText(/Entrega/)).not.toBeInTheDocument();
    expect(screen.queryByText('Meus pedidos')).not.toBeInTheDocument();
  });

  it('o produto abre, mas o botão não deixa pedir', () => {
    render(<LojaPublica slug="lanches-do-ze" cardapio={VITRINE} />);

    fireEvent.click(screen.getByText('X-Burger'));

    // O nome do botão leva o preço junto: "Pedidos em breve R$ 22,00".
    expect(screen.getByRole('button', { name: /Pedidos em breve/ })).toBeDisabled();
  });
});
