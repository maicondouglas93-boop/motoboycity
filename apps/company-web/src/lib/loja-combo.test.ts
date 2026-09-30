import { describe, expect, it } from 'vitest';
import { descricaoDoCombo, economiaDoComboNaPagina, rotuloDeEconomia } from './loja-combo';

describe('o texto do combo na página', () => {
  it('lista o que ele leva, com a quantidade e o tamanho fixo', () => {
    expect(
      descricaoDoCombo([
        { nome: 'X-Burger', tamanho: null, quantidade: 1 },
        { nome: 'Batata', tamanho: 'Média', quantidade: 2 },
      ]),
    ).toBe('1× X-Burger, 2× Batata (Média)');
  });

  it('a economia é o que os itens custariam separados menos o preço do combo', () => {
    const combo = {
      precoUnico: 30,
      combo: { itens: [], valorSeparado: 41 },
    };

    expect(economiaDoComboNaPagina(combo)).toBe(11);
    expect(rotuloDeEconomia(11)).toMatch(/^Economize R\$\s*11,00$/);
  });

  it('sem economia — combo no mesmo preço ou mais caro, produto comum, sem preço — é zero', () => {
    expect(
      economiaDoComboNaPagina({ precoUnico: 41, combo: { itens: [], valorSeparado: 41 } }),
    ).toBe(0);
    expect(
      economiaDoComboNaPagina({ precoUnico: 50, combo: { itens: [], valorSeparado: 41 } }),
    ).toBe(0);
    expect(economiaDoComboNaPagina({ precoUnico: 30 })).toBe(0);
    expect(economiaDoComboNaPagina({ precoUnico: 30, combo: null })).toBe(0);
    expect(
      economiaDoComboNaPagina({ precoUnico: null, combo: { itens: [], valorSeparado: 41 } }),
    ).toBe(0);
  });
});
