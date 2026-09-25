import type { PublicStoreProduct } from '@motoboycity/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ store: vi.fn() }));

vi.mock('@motoboycity/api-client', async (original) => ({
  ...(await original<typeof import('@motoboycity/api-client')>()),
  createPublicStoreApi: () => ({ store: mocks.store }),
}));

const { ApiError } = await import('@motoboycity/api-client');
const { LINK_DA_DEMONSTRACAO, lojaDoLink, produtoDaVitrine } = await import('./loja-publica');

const ACAI: PublicStoreProduct = {
  id: 'p1',
  categoryId: 'c1',
  name: 'Açaí',
  description: 'Batido na hora',
  imageUrl: 'https://ik.imagekit.io/motoboycity/acai.jpg',
  price: null,
  sizes: [{ id: 't1', name: '500ml', price: 18.5, available: true }],
  optionGroups: [
    {
      id: 'g1',
      name: 'Adicionais',
      minChoices: 0,
      maxChoices: 3,
      options: [{ id: 'e1', name: 'Morango', price: 3, available: false }],
    },
  ],
};

describe('a loja pelo link', () => {
  // Em bloco, sem devolver o mock: o vitest chama o que o beforeEach devolve
  // como limpeza, depois do teste — e chamaria o mock mais uma vez.
  beforeEach(() => {
    mocks.store.mockReset();
  });

  it('o link da demonstração abre o exemplo inteiro, sem ir à API', async () => {
    const achada = await lojaDoLink(LINK_DA_DEMONSTRACAO);
    expect(achada.tipo).toBe('loja');
    if (achada.tipo === 'loja') expect(achada.cardapio.vitrine).toBe(false);
    expect(mocks.store).not.toHaveBeenCalled();
  });

  it('loja de verdade abre como vitrine, com o cardápio dela', async () => {
    mocks.store.mockResolvedValue({
      kind: 'store',
      store: {
        slug: 'acai-do-ze',
        name: 'Açaí do Zé',
        categories: [{ id: 'c1', name: 'Açaí' }],
        products: [ACAI],
      },
    });

    const achada = await lojaDoLink('acai-do-ze');

    expect(achada).toMatchObject({
      tipo: 'loja',
      cardapio: {
        vitrine: true,
        identidade: { nome: 'Açaí do Zé' },
        categorias: [{ id: 'c1', nome: 'Açaí' }],
      },
    });
    expect(mocks.store).toHaveBeenCalledWith('acai-do-ze', { cache: 'no-store' });
  });

  it('link antigo, e link com maiúscula, levam ao endereço atual', async () => {
    mocks.store.mockResolvedValue({ kind: 'moved', slug: 'acai-do-ze' });
    await expect(lojaDoLink('acai')).resolves.toEqual({ tipo: 'mudou', slug: 'acai-do-ze' });

    mocks.store.mockResolvedValue({
      kind: 'store',
      store: { slug: 'acai-do-ze', name: 'Açaí do Zé', categories: [], products: [] },
    });
    await expect(lojaDoLink('Acai-Do-Ze')).resolves.toEqual({ tipo: 'mudou', slug: 'acai-do-ze' });
  });

  it('link sem loja é "não encontrada"', async () => {
    mocks.store.mockRejectedValue(new ApiError(404, { message: 'Loja não encontrada.' }));
    await expect(lojaDoLink('nada')).resolves.toEqual({ tipo: 'nao-existe' });

    mocks.store.mockRejectedValue(new ApiError(400, { message: 'Link inválido.' }));
    await expect(lojaDoLink('ç')).resolves.toEqual({ tipo: 'nao-existe' });
  });

  it('falha da API não se disfarça de "não encontrada"', async () => {
    mocks.store.mockRejectedValue(new ApiError(500, { message: 'Erro' }));
    await expect(lojaDoLink('acai')).rejects.toThrow('Erro');
  });

  it('o produto da API vira o formato da página, com os mesmos ids', () => {
    expect(produtoDaVitrine(ACAI)).toEqual({
      id: 'p1',
      nome: 'Açaí',
      descricao: 'Batido na hora',
      categoriaId: 'c1',
      imagemUrl: 'https://ik.imagekit.io/motoboycity/acai.jpg',
      precoUnico: null,
      situacao: 'publicado',
      tamanhos: [{ id: 't1', nome: '500ml', preco: 18.5, disponivel: true }],
      grupos: [
        {
          id: 'g1',
          nome: 'Adicionais',
          minimo: 0,
          maximo: 3,
          escolhas: [{ id: 'e1', nome: 'Morango', preco: 3, disponivel: false }],
        },
      ],
    });
  });
});
