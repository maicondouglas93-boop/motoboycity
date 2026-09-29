import type { DestaquePublico } from '@motoboycity/types';
import {
  MAXIMO_DE_DESTAQUES,
  MAXIMO_DE_PRODUTOS_NO_DESTAQUE,
  destaqueVigente,
  destaquesDaVitrine,
  storeHighlightOrderSchema,
  storeHighlightSchema,
  type StoreHighlightInput,
} from '@motoboycity/validation';

/**
 * Os destaques: o que a página mostra é decidido por estas regras, e o que a loja
 * cadastra por este schema. Um destaque errado é um bloco vazio ou vencido no alto
 * do cardápio, que o cliente vê antes de qualquer produto.
 */

/** Quarta-feira, 23/09/2026, meio-dia na hora da loja (UTC-3). */
const QUARTA = new Date('2026-09-23T12:00:00-03:00');

const P1 = '0b0d9e2c-1f0a-4d6b-8f6e-1a2b3c4d5e6f';
const P2 = '7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
const P3 = '9d8c7b6a-5e4f-4a3b-8c2d-1e0f9a8b7c6d';

function destaque(mudancas: Partial<DestaquePublico> = {}): DestaquePublico {
  return {
    id: 'd1',
    titulo: 'Mais pedidos',
    produtoIds: ['a', 'b', 'c'],
    inicio: null,
    fim: null,
    ...mudancas,
  };
}

const TODOS = new Set(['a', 'b', 'c']);

describe('destaqueVigente', () => {
  it('sem datas vale sempre; com elas, no calendário da loja e com as duas pontas dentro', () => {
    expect(destaqueVigente({ inicio: null, fim: null }, QUARTA)).toBe(true);
    expect(destaqueVigente({ inicio: '2026-09-23', fim: '2026-09-23' }, QUARTA)).toBe(true);
    expect(destaqueVigente({ inicio: '2026-09-24', fim: null }, QUARTA)).toBe(false);
    expect(destaqueVigente({ inicio: null, fim: '2026-09-22' }, QUARTA)).toBe(false);
  });
});

describe('destaquesDaVitrine', () => {
  it('mostra os destaques na ordem da loja, cada um com os produtos na ordem dele', () => {
    const lista = [
      destaque({ id: 'novidades', titulo: 'Novidades', produtoIds: ['c', 'a'] }),
      destaque({ id: 'mais-pedidos', produtoIds: ['b', 'a', 'c'] }),
    ];

    expect(destaquesDaVitrine(lista, TODOS, QUARTA)).toEqual([
      { id: 'novidades', titulo: 'Novidades', produtoIds: ['c', 'a'] },
      { id: 'mais-pedidos', titulo: 'Mais pedidos', produtoIds: ['b', 'a', 'c'] },
    ]);
  });

  it('só entra o produto que está à venda: o pausado, o rascunho e o que sumiu ficam de fora', () => {
    const aVenda = new Set(['a', 'c']);

    expect(destaquesDaVitrine([destaque()], aVenda, QUARTA)[0]!.produtoIds).toEqual(['a', 'c']);
  });

  it('o destaque sem nenhum produto à venda não aparece', () => {
    expect(destaquesDaVitrine([destaque()], new Set(), QUARTA)).toEqual([]);
    expect(destaquesDaVitrine([destaque()], new Set(['z']), QUARTA)).toEqual([]);
  });

  it('o produto repetido entra uma vez só', () => {
    const repetido = destaque({ produtoIds: ['a', 'b', 'a'] });

    expect(destaquesDaVitrine([repetido], TODOS, QUARTA)[0]!.produtoIds).toEqual(['a', 'b']);
  });

  it('fora das datas some: o que ainda não começou e o que já acabou', () => {
    const lista = [
      destaque({ id: 'futuro', inicio: '2026-10-01' }),
      destaque({ id: 'passado', fim: '2026-09-01' }),
      destaque({ id: 'hoje', inicio: '2026-09-23', fim: '2026-09-30' }),
    ];

    expect(destaquesDaVitrine(lista, TODOS, QUARTA).map((item) => item.id)).toEqual(['hoje']);
  });

  it('antes de a página saber a hora, só valem os destaques sem datas', () => {
    const lista = [
      destaque({ id: 'sempre' }),
      destaque({ id: 'com-fim', fim: '2026-09-30' }),
      destaque({ id: 'com-inicio', inicio: '2026-09-01' }),
    ];

    expect(destaquesDaVitrine(lista, TODOS, null).map((item) => item.id)).toEqual(['sempre']);
    // Com a hora, os três de hoje aparecem.
    expect(destaquesDaVitrine(lista, TODOS, QUARTA).map((item) => item.id)).toEqual([
      'sempre',
      'com-fim',
      'com-inicio',
    ]);
  });

  it('sem destaque nenhum, não há nada a mostrar', () => {
    expect(destaquesDaVitrine([], TODOS, QUARTA)).toEqual([]);
  });
});

const base: StoreHighlightInput = {
  titulo: 'Mais pedidos',
  produtoIds: [P1, P2],
  inicio: null,
  fim: null,
  ativo: true,
};

/** Os campos com erro, do jeito que a tela os mostra. */
function erros(mudancas: Partial<StoreHighlightInput>): Record<string, string> {
  const resultado = storeHighlightSchema.safeParse({ ...base, ...mudancas });
  if (resultado.success) return {};
  return Object.fromEntries(
    resultado.error.issues.map((problema) => [String(problema.path[0]), problema.message]),
  );
}

describe('storeHighlightSchema', () => {
  it('o destaque completo passa, e nasce ligado e sem datas', () => {
    const resultado = storeHighlightSchema.parse({ titulo: '  Novidades ', produtoIds: [P1] });

    expect(resultado).toEqual({
      titulo: 'Novidades',
      produtoIds: [P1],
      inicio: null,
      fim: null,
      ativo: true,
    });
  });

  it('a ordem dos produtos é a que a loja mandou', () => {
    expect(storeHighlightSchema.parse({ ...base, produtoIds: [P3, P1, P2] }).produtoIds).toEqual([
      P3,
      P1,
      P2,
    ]);
  });

  it('o título tem de 2 a 40 caracteres', () => {
    expect(erros({ titulo: 'Ab' })).toEqual({});
    expect(erros({ titulo: 'T'.repeat(40) })).toEqual({});
    expect(erros({ titulo: '   ' })).toHaveProperty('titulo');
    expect(erros({ titulo: 'A' })).toHaveProperty('titulo');
    expect(erros({ titulo: 'T'.repeat(41) })).toEqual({
      titulo: 'Use no máximo 40 caracteres no título.',
    });
  });

  it('pede ao menos um produto, no máximo doze, e sem repetir', () => {
    expect(erros({ produtoIds: [] })).toEqual({ produtoIds: 'Escolha ao menos um produto.' });
    expect(erros({ produtoIds: [P1, P1] })).toEqual({
      produtoIds: 'Cada produto entra uma vez só.',
    });
    expect(erros({ produtoIds: ['acai'] })).toHaveProperty('produtoIds');

    const muitos = Array.from(
      { length: MAXIMO_DE_PRODUTOS_NO_DESTAQUE + 1 },
      (_, indice) => `00000000-0000-4000-8000-${String(indice).padStart(12, '0')}`,
    );
    expect(erros({ produtoIds: muitos.slice(0, MAXIMO_DE_PRODUTOS_NO_DESTAQUE) })).toEqual({});
    expect(erros({ produtoIds: muitos })).toEqual({
      produtoIds: `Use no máximo ${MAXIMO_DE_PRODUTOS_NO_DESTAQUE} produtos num destaque.`,
    });
  });

  it('as datas, com a final depois da inicial, e uma ponta só vale', () => {
    expect(erros({ inicio: '2026-10-01', fim: '2026-10-31' })).toEqual({});
    expect(erros({ inicio: '2026-10-01', fim: '2026-10-01' })).toEqual({});
    expect(erros({ inicio: '2026-10-01' })).toEqual({});
    expect(erros({ fim: '2026-10-31' })).toEqual({});
    expect(erros({ inicio: '2026-10-31', fim: '2026-10-01' })).toEqual({
      fim: 'A data final vem antes da inicial.',
    });
    expect(erros({ inicio: '01/10/2026' })).toHaveProperty('inicio');
    expect(erros({ fim: '2026-13-45' })).toHaveProperty('fim');
  });
});

describe('storeHighlightOrderSchema', () => {
  it('pede os ids na ordem, sem repetir', () => {
    expect(storeHighlightOrderSchema.safeParse({ ids: [P1, P2, P3] }).success).toBe(true);
    expect(storeHighlightOrderSchema.safeParse({ ids: [] }).success).toBe(false);
    expect(storeHighlightOrderSchema.safeParse({ ids: [P1, P1] }).success).toBe(false);
    expect(storeHighlightOrderSchema.safeParse({ ids: ['x'] }).success).toBe(false);
  });

  it('aceita a lista de uma loja que passou do limite de criação, para ela poder reordenar', () => {
    const uuid = (indice: number) => `00000000-0000-4000-8000-${String(indice).padStart(12, '0')}`;
    const ids = (quantos: number) => Array.from({ length: quantos }, (_, indice) => uuid(indice));

    expect(storeHighlightOrderSchema.safeParse({ ids: ids(MAXIMO_DE_DESTAQUES) }).success).toBe(
      true,
    );
    // O limite é da criação: uma corrida rara pode deixar a loja com 11, e ela ainda reordena.
    expect(storeHighlightOrderSchema.safeParse({ ids: ids(MAXIMO_DE_DESTAQUES + 1) }).success).toBe(
      true,
    );
    expect(storeHighlightOrderSchema.safeParse({ ids: ids(101) }).success).toBe(false);
  });
});
