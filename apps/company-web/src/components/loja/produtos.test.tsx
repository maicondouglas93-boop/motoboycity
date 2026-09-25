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
    // Sem envio de foto, "sem foto" não é cobrado.
    expect(screen.queryByText(/sem foto/)).not.toBeInTheDocument();
  });

  it('loja nova começa pelas seções', async () => {
    renderizar({ categories: [], products: [] });

    expect(await screen.findByText('Nenhum produto cadastrado ainda.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Criar seções' })).toHaveAttribute(
      'href',
      '/loja/produtos/organizar',
    );
  });

  it('diz que a página do cliente ainda não usa o cadastro', async () => {
    renderizar({ categories: [LANCHES], products: [produto({ id: 'X-Burger' })] });
    await waitFor(() => expect(mocks.catalog).toHaveBeenCalled());
    expect(screen.getByText(/ainda mostra o cardápio de exemplo/)).toBeInTheDocument();
  });
});
