import { ApiError } from '@motoboycity/api-client';
import type { StoreCatalog, StoreProduct } from '@motoboycity/types';
import { describe, expect, it } from 'vitest';
import {
  comProdutoSalvo,
  comProdutosReordenados,
  faixaDePreco,
  mensagemDoErro,
  mover,
  ordenarPelasCategorias,
  pendenciasParaMostrar,
  semProduto,
} from './catalogo';

function produto(id: string, categoryId: string | null, extra: Partial<StoreProduct> = {}) {
  return {
    id,
    categoryId,
    name: id,
    description: '',
    imageUrl: null,
    price: 10,
    status: 'DRAFT',
    sizes: [],
    optionGroups: [],
    updatedAt: '2026-09-25T12:00:00.000Z',
    ...extra,
  } satisfies StoreProduct;
}

const CATALOGO: StoreCatalog = {
  categories: [
    { id: 'lanches', name: 'Lanches' },
    { id: 'bebidas', name: 'Bebidas' },
  ],
  products: [
    produto('x-burger', 'lanches'),
    produto('x-salada', 'lanches'),
    produto('suco', 'bebidas'),
    produto('solto', null),
  ],
};

const ids = (catalogo: StoreCatalog) => catalogo.products.map((item) => item.id);

describe('ordem do catálogo na tela', () => {
  it('produtos seguem a ordem nova das categorias; os sem categoria, no fim', () => {
    const categorias = [...CATALOGO.categories].reverse();
    expect(ordenarPelasCategorias(CATALOGO.products, categorias).map((item) => item.id)).toEqual([
      'suco',
      'x-burger',
      'x-salada',
      'solto',
    ]);
  });

  it('reordenar uma categoria não mexe nas outras', () => {
    expect(ids(comProdutosReordenados(CATALOGO, 'lanches', ['x-salada', 'x-burger']))).toEqual([
      'x-salada',
      'x-burger',
      'suco',
      'solto',
    ]);
  });

  it('produto salvo na mesma categoria fica no lugar', () => {
    const salvo = produto('x-burger', 'lanches', { name: 'X-Burger duplo' });
    const depois = comProdutoSalvo(CATALOGO, salvo);
    expect(ids(depois)).toEqual(ids(CATALOGO));
    expect(depois.products[0]!.name).toBe('X-Burger duplo');
  });

  it('produto novo, ou que mudou de categoria, vai para o fim dela — como no servidor', () => {
    expect(ids(comProdutoSalvo(CATALOGO, produto('refri', 'bebidas')))).toEqual([
      'x-burger',
      'x-salada',
      'suco',
      'refri',
      'solto',
    ]);
    expect(ids(comProdutoSalvo(CATALOGO, produto('x-burger', 'bebidas')))).toEqual([
      'x-salada',
      'suco',
      'x-burger',
      'solto',
    ]);
  });

  it('excluído sai da lista', () => {
    expect(ids(semProduto(CATALOGO, 'suco'))).toEqual(['x-burger', 'x-salada', 'solto']);
  });

  it('mover devolve uma cópia; fora do intervalo, igual', () => {
    const lista = ['a', 'b', 'c'];
    expect(mover(lista, 2, 1)).toEqual(['a', 'c', 'b']);
    expect(mover(lista, 0, -1)).toEqual(lista);
    expect(lista).toEqual(['a', 'b', 'c']);
  });
});

describe('textos da tela', () => {
  it('faixa de preço: único, sem preço, e de/até nos tamanhos', () => {
    expect(faixaDePreco(produto('a', null, { price: 22 }))).toBe('R$ 22,00');
    expect(faixaDePreco(produto('a', null, { price: null }))).toBe('Sem preço');
    expect(
      faixaDePreco(
        produto('a', null, {
          price: null,
          sizes: [
            { id: 'p', name: 'P', price: 12, available: true },
            { id: 'g', name: 'G', price: 18.5, available: true },
          ],
        }),
      ),
    ).toBe('R$ 12,00 a R$ 18,50');
  });

  it('erro de validação diz o que estava inválido', () => {
    const validacao = new ApiError(400, {
      message: 'Dados inválidos.',
      issues: [{ path: 'name', message: 'Use no máximo 60 caracteres.' }],
    });
    expect(mensagemDoErro(validacao, 'x')).toBe('Dados inválidos. Use no máximo 60 caracteres.');

    // Quando a mensagem já traz o detalhe, ele não se repete.
    const publicar = new ApiError(400, {
      message: 'Não dá para publicar: sem preço.',
      issues: [{ path: 'status', message: 'sem preço' }],
    });
    expect(mensagemDoErro(publicar, 'x')).toBe('Não dá para publicar: sem preço.');

    expect(mensagemDoErro(new Error('rede'), 'Não foi possível salvar.')).toBe(
      'Não foi possível salvar.',
    );
  });

  it('"sem foto" não aparece enquanto não há como enviar foto', () => {
    expect(
      pendenciasParaMostrar([
        { text: 'sem foto', blocking: false },
        { text: 'sem descrição', blocking: false },
      ]),
    ).toEqual([{ text: 'sem descrição', blocking: false }]);
  });
});
