import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { StoreCatalog, StoreProduct } from '@motoboycity/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import LojaProdutosPage from '@/app/(app)/loja/produtos/page';

/** A lista de Produtos fica atrás do login do painel; este teste confere o que ela lê e manda. */

const mocks = vi.hoisted(() => ({ catalog: vi.fn(), updateProductStatus: vi.fn() }));

vi.mock('@/lib/api-client', () => ({ companyStoreCatalogApi: mocks }));

const LANCHES = { id: 'lanches', name: 'Lanches' };

function produto(extra: Partial<StoreProduct> & Pick<StoreProduct, 'id'>): StoreProduct {
  return {
    categoryId: LANCHES.id,
    name: extra.id,
    description: 'Descrição',
    imageUrl: null,
    price: 22,
    status: 'PUBLISHED',
    stock: null,
    kind: 'PRODUCT',
    comboItems: [],
    sizes: [],
    optionGroups: [],
    updatedAt: '2026-09-25T12:00:00.000Z',
    ...extra,
  };
}

function renderizar(catalogo: StoreCatalog) {
  mocks.catalog.mockResolvedValue(catalogo);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <LojaProdutosPage />
    </QueryClientProvider>,
  );
}

describe('Produtos', () => {
  beforeEach(() => {
    window.localStorage.setItem('motoboycity.accessToken', 'token');
    mocks.catalog.mockReset();
    mocks.updateProductStatus.mockReset();
  });

  it('pausar grava na API e a lista mostra a situação nova', async () => {
    const burger = produto({ id: 'X-Burger' });
    mocks.updateProductStatus.mockResolvedValue({ ...burger, status: 'PAUSED' });
    renderizar({ categories: [LANCHES], products: [burger] });

    fireEvent.click(await screen.findByRole('button', { name: 'Pausar' }));

    expect(await screen.findByRole('button', { name: 'Voltar a vender' })).toBeEnabled();
    expect(mocks.updateProductStatus).toHaveBeenCalledWith('token', 'X-Burger', {
      status: 'PAUSED',
    });
  });

  it('rascunho que o cliente não conseguiria comprar não se publica', async () => {
    renderizar({
      categories: [LANCHES],
      products: [produto({ id: 'Pizza', status: 'DRAFT', price: null })],
    });

    expect(await screen.findByRole('button', { name: 'Publicar' })).toBeDisabled();
    expect(screen.getByText('sem preço')).toBeInTheDocument();
    // Sem foto não trava a venda: vai na linha das recomendações.
    expect(screen.getByText('Falta ainda: sem foto.')).toBeInTheDocument();
  });

  it('loja nova começa pelas seções', async () => {
    renderizar({ categories: [], products: [] });

    expect(await screen.findByText('Nenhum produto cadastrado ainda.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Criar seções' })).toHaveAttribute(
      'href',
      '/loja/produtos/organizar',
    );
  });

  it('diz que os publicados aparecem na página da loja, sem afirmar que ela não recebe pedido', async () => {
    renderizar({ categories: [LANCHES], products: [produto({ id: 'X-Burger' })] });
    await waitFor(() => expect(mocks.catalog).toHaveBeenCalled());
    expect(screen.getByText(/Os publicados aparecem na página da loja/)).toBeInTheDocument();
    // A página recebe pedidos desde 26/09: o aviso antigo estava errado.
    expect(screen.queryByText(/ainda não recebe pedidos/)).not.toBeInTheDocument();
  });
});

describe('Produtos — estoque', () => {
  beforeEach(() => {
    window.localStorage.setItem('motoboycity.accessToken', 'token');
    mocks.catalog.mockReset();
    mocks.updateProductStatus.mockReset();
  });

  it('mostra o estoque de quem controla, e nada de quem não controla', async () => {
    renderizar({
      categories: [LANCHES],
      products: [
        produto({ id: 'Com-estoque', stock: 40 }),
        produto({ id: 'Sem-controle', stock: null }),
      ],
    });

    expect(await screen.findByText(/Estoque: 40/)).toBeInTheDocument();
    expect(screen.queryByText(/Estoque:/, { selector: 'p' })).toBeInTheDocument();
    // Só um dos dois tem estoque na linha.
    expect(screen.getAllByText(/Estoque:/)).toHaveLength(1);
  });

  it('estoque zerado: o produto aparece como Esgotado, ainda que esteja no ar', async () => {
    renderizar({ categories: [LANCHES], products: [produto({ id: 'Acabou', stock: 0 })] });

    expect(await screen.findByText('Esgotado')).toBeInTheDocument();
    expect(screen.getByText('No ar')).toBeInTheDocument();
    expect(screen.getByText(/Estoque zerado/)).toBeInTheDocument();
  });

  it('poucas unidades avisam "Estoque baixo"; muitas, não', async () => {
    renderizar({
      categories: [LANCHES],
      products: [
        produto({ id: 'Quase-acabando', stock: 3 }),
        produto({ id: 'Bastante', stock: 60 }),
      ],
    });

    expect(await screen.findByText('Estoque baixo')).toBeInTheDocument();
    expect(screen.getAllByText('Estoque baixo')).toHaveLength(1);
    expect(screen.queryByText('Esgotado')).not.toBeInTheDocument();
  });
});

describe('Produtos — combos', () => {
  const BURGER = produto({ id: 'b1', name: 'X-Burger', stock: 6 });
  const SUCO = produto({ id: 's1', name: 'Suco', price: 8, stock: 20 });
  const combo = (mudancas: Partial<StoreProduct> = {}): StoreProduct =>
    produto({
      id: 'c1',
      name: 'Combo Casal',
      kind: 'COMBO',
      price: 30,
      comboItems: [
        { productId: 'b1', sizeId: null, quantity: 2 },
        { productId: 's1', sizeId: null, quantity: 1 },
      ],
      ...mudancas,
    });

  beforeEach(() => {
    window.localStorage.setItem('motoboycity.accessToken', 'token');
    mocks.catalog.mockReset();
    mocks.updateProductStatus.mockReset();
  });

  it('o combo aparece com o selo, o preço dele e o que leva; e há atalho para cadastrar outro', async () => {
    renderizar({ categories: [LANCHES], products: [BURGER, SUCO, combo()] });

    expect(await screen.findByText('Combo Casal')).toBeInTheDocument();
    expect(screen.getByText('Combo')).toBeInTheDocument();
    expect(screen.getByText('Leva: 2× X-Burger, 1× Suco')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Cadastrar combo/ })).toHaveAttribute(
      'href',
      '/loja/produtos/novo?tipo=combo',
    );
    expect(screen.getByRole('link', { name: /Cadastrar produto/ })).toHaveAttribute(
      'href',
      '/loja/produtos/novo',
    );
  });

  it('o estoque do combo é quantos dá para montar com o dos produtos que ele leva', async () => {
    // 6 hambúrgueres, 2 por combo, dão 3 combos — e o suco (20) não limita.
    renderizar({ categories: [LANCHES], products: [BURGER, SUCO, combo()] });

    expect(await screen.findByText(/Dá para montar 3/)).toBeInTheDocument();
    expect(screen.getByText('Estoque baixo')).toBeInTheDocument();
  });

  it('sem o que montar, o combo aparece como esgotado', async () => {
    renderizar({
      categories: [LANCHES],
      products: [{ ...BURGER, stock: 1 }, SUCO, combo()],
    });

    expect(await screen.findByText(/Não dá para montar/)).toBeInTheDocument();
    expect(screen.getAllByText('Esgotado')).toHaveLength(1);
  });

  it('item pausado tira o combo do ar: a lista diz qual, e conta como produto que não pode ser comprado', async () => {
    renderizar({
      categories: [LANCHES],
      products: [{ ...BURGER, status: 'PAUSED' }, SUCO, combo({ status: 'PUBLISHED' })],
    });

    expect(await screen.findByText(/"X-Burger" está pausado/)).toBeInTheDocument();
    expect(screen.getByText(/1 produto está no ar e não pode ser comprado/)).toBeInTheDocument();
  });

  it('o combo cujo item some do cardápio também aparece com o problema, e não quebra a lista', async () => {
    renderizar({ categories: [LANCHES], products: [SUCO, combo({ status: 'PUBLISHED' })] });

    expect(await screen.findByText('Leva: 2× (removido), 1× Suco')).toBeInTheDocument();
    expect(screen.getByText(/foi removido do cardápio/)).toBeInTheDocument();
  });
});
