import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ApiError } from '@motoboycity/api-client';
import type { StoreCatalog, StoreProduct } from '@motoboycity/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import LojaOrganizarPage from '@/app/(app)/loja/produtos/organizar/page';

/**
 * A tela Organizar fica atrás do login do painel; este teste confere o que ela
 * manda para a API e o que mostra enquanto espera.
 */

const mocks = vi.hoisted(() => ({
  catalog: vi.fn(),
  createCategory: vi.fn(),
  renameCategory: vi.fn(),
  deleteCategory: vi.fn(),
  reorderCategories: vi.fn(),
  reorderProducts: vi.fn(),
}));

vi.mock('@/lib/api-client', () => ({ companyStoreCatalogApi: mocks }));

function produto(id: string, categoryId: string | null): StoreProduct {
  return {
    id,
    categoryId,
    name: id,
    description: '',
    imageUrl: null,
    price: 10,
    status: 'PUBLISHED',
    sizes: [],
    optionGroups: [],
    updatedAt: '2026-09-25T12:00:00.000Z',
  };
}

const CATALOGO: StoreCatalog = {
  categories: [
    { id: 'lanches', name: 'Lanches' },
    { id: 'bebidas', name: 'Bebidas' },
    { id: 'vazia', name: 'Promoções' },
  ],
  products: [
    produto('X-Burger', 'lanches'),
    produto('X-Salada', 'lanches'),
    produto('X-Tudo', 'lanches'),
    produto('Suco', 'bebidas'),
  ],
};

function renderizar() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <LojaOrganizarPage />
    </QueryClientProvider>,
  );
  return queryClient;
}

/** O que o servidor devolve ao reler o catálogo depois da gravação. */
function servidorDepois(catalogo: StoreCatalog) {
  mocks.catalog.mockResolvedValueOnce(CATALOGO).mockResolvedValue(catalogo);
}

/** Os nomes na ordem em que aparecem na tela. */
function ordemDosProdutos(): string[] {
  return screen.getAllByRole('listitem').map((item) => item.textContent ?? '');
}

function ordemDasCategorias(): string[] {
  return screen
    .getAllByLabelText(/^Nome da categoria /)
    .map((campo) => (campo as HTMLInputElement).value);
}

describe('Organizar o catálogo', () => {
  beforeEach(() => {
    window.localStorage.setItem('motoboycity.accessToken', 'token');
    for (const mock of Object.values(mocks)) mock.mockReset();
    mocks.catalog.mockResolvedValue(CATALOGO);
  });

  it('mostra a ordem nova na hora e grava a lista inteira', async () => {
    mocks.reorderCategories.mockResolvedValue([]);
    const [lanches, bebidas, vazia] = CATALOGO.categories;
    servidorDepois({ ...CATALOGO, categories: [bebidas!, lanches!, vazia!] });
    renderizar();
    await screen.findByDisplayValue('Lanches');

    fireEvent.click(screen.getByRole('button', { name: 'Descer a categoria Lanches' }));

    expect(ordemDasCategorias()).toEqual(['Bebidas', 'Lanches', 'Promoções']);
    await waitFor(() =>
      expect(mocks.reorderCategories).toHaveBeenCalledWith('token', {
        ids: ['bebidas', 'lanches', 'vazia'],
      }),
    );
  });

  it('cliques seguidos vão ao servidor um de cada vez, na ordem do clique', async () => {
    let liberar!: () => void;
    mocks.reorderProducts.mockImplementationOnce(
      () => new Promise((resolve) => (liberar = () => resolve([]))),
    );
    mocks.reorderProducts.mockResolvedValue([]);
    renderizar();
    await screen.findByDisplayValue('Lanches');

    fireEvent.click(screen.getByRole('button', { name: 'Descer o produto X-Burger' }));
    fireEvent.click(screen.getByRole('button', { name: 'Descer o produto X-Burger' }));

    // A tela já mostra os dois passos...
    expect(ordemDosProdutos().slice(0, 3)).toEqual(['X-Salada', 'X-Tudo', 'X-Burger']);
    // ...mas a segunda lista só sai depois de a primeira ser respondida.
    await waitFor(() => expect(mocks.reorderProducts).toHaveBeenCalledTimes(1));
    expect(mocks.reorderProducts).toHaveBeenLastCalledWith('token', {
      categoryId: 'lanches',
      ids: ['X-Salada', 'X-Burger', 'X-Tudo'],
    });

    liberar();
    await waitFor(() => expect(mocks.reorderProducts).toHaveBeenCalledTimes(2));
    expect(mocks.reorderProducts).toHaveBeenLastCalledWith('token', {
      categoryId: 'lanches',
      ids: ['X-Salada', 'X-Tudo', 'X-Burger'],
    });
  });

  it('recusada, a tela diz o motivo e volta ao que ficou gravado', async () => {
    mocks.reorderCategories.mockRejectedValue(
      new ApiError(409, {
        message: 'A lista de categorias mudou enquanto você mexia. Recarregue e tente de novo.',
        code: 'STORE_CATALOG_STALE',
      }),
    );
    renderizar();
    await screen.findByDisplayValue('Lanches');

    fireEvent.click(screen.getByRole('button', { name: 'Descer a categoria Lanches' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'A lista de categorias mudou enquanto você mexia.',
    );
    await waitFor(() => expect(ordemDasCategorias()).toEqual(['Lanches', 'Bebidas', 'Promoções']));
    expect(mocks.catalog).toHaveBeenCalledTimes(2);
  });

  it('renomeia ao sair do campo; vazio volta o nome de antes', async () => {
    mocks.renameCategory.mockResolvedValue({ id: 'bebidas', name: 'Bebidas geladas' });
    servidorDepois({
      ...CATALOGO,
      categories: CATALOGO.categories.map((categoria) =>
        categoria.id === 'bebidas' ? { ...categoria, name: 'Bebidas geladas' } : categoria,
      ),
    });
    renderizar();
    const campo = await screen.findByDisplayValue('Bebidas');

    fireEvent.change(campo, { target: { value: '   ' } });
    fireEvent.blur(campo);
    expect(campo).toHaveValue('Bebidas');
    expect(mocks.renameCategory).not.toHaveBeenCalled();

    fireEvent.change(campo, { target: { value: ' Bebidas geladas ' } });
    fireEvent.blur(campo);
    expect(campo).toHaveValue('Bebidas geladas');
    await waitFor(() =>
      expect(mocks.renameCategory).toHaveBeenCalledWith('token', 'bebidas', {
        name: 'Bebidas geladas',
      }),
    );
  });

  it('só a categoria vazia pode ser excluída', async () => {
    mocks.deleteCategory.mockResolvedValue({ deleted: true });
    servidorDepois({
      ...CATALOGO,
      categories: CATALOGO.categories.filter((categoria) => categoria.id !== 'vazia'),
    });
    renderizar();
    await screen.findByDisplayValue('Lanches');

    expect(screen.getByRole('button', { name: 'Excluir a categoria Lanches' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Excluir a categoria Promoções' }));

    expect(screen.queryByDisplayValue('Promoções')).not.toBeInTheDocument();
    await waitFor(() => expect(mocks.deleteCategory).toHaveBeenCalledWith('token', 'vazia'));
  });

  it('cria a categoria no fim', async () => {
    const sobremesas = { id: 'sobremesas', name: 'Sobremesas' };
    mocks.createCategory.mockResolvedValue(sobremesas);
    servidorDepois({ ...CATALOGO, categories: [...CATALOGO.categories, sobremesas] });
    renderizar();
    await screen.findByDisplayValue('Lanches');

    fireEvent.change(screen.getByLabelText('Nome da nova categoria'), {
      target: { value: 'Sobremesas' },
    });
    fireEvent.keyDown(screen.getByLabelText('Nome da nova categoria'), { key: 'Enter' });

    await waitFor(() =>
      expect(ordemDasCategorias()).toEqual(['Lanches', 'Bebidas', 'Promoções', 'Sobremesas']),
    );
    expect(mocks.createCategory).toHaveBeenCalledWith('token', { name: 'Sobremesas' });
    expect(screen.getByLabelText('Nome da nova categoria')).toHaveValue('');
  });

  it('produto sem categoria aparece à parte, com o caminho para resolver', async () => {
    mocks.catalog.mockResolvedValue({
      ...CATALOGO,
      products: [...CATALOGO.products, produto('Pastel', null)],
    });
    renderizar();

    expect(await screen.findByText('Fora de qualquer seção')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Escolher categoria' })).toHaveAttribute(
      'href',
      '/loja/produtos/Pastel/editar',
    );
  });
});
