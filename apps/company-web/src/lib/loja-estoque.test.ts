import { describe, expect, it } from 'vitest';
import {
  avisoDeEstoque,
  rotuloDeRestam,
  unidadesNaSacola,
  unidadesQueAindaCabem,
} from './loja-estoque';

/**
 * O estoque opcional do produto, olhado da sacola do cliente. A página só sabe se o produto
 * esgotou e, com poucas unidades, quantas restam; o servidor é quem decide, no pedido.
 */

const sacola = [
  { produtoId: 'p1', quantidade: 2 },
  { produtoId: 'p2', quantidade: 1 },
  { produtoId: 'p1', quantidade: 1 },
];

describe('unidadesNaSacola', () => {
  it('soma as linhas do mesmo produto, de tamanhos e escolhas diferentes', () => {
    expect(unidadesNaSacola(sacola, 'p1')).toBe(3);
    expect(unidadesNaSacola(sacola, 'p2')).toBe(1);
    expect(unidadesNaSacola(sacola, 'nenhum')).toBe(0);
  });
});

describe('unidadesQueAindaCabem', () => {
  it('produto sem controle, ou desconhecido da página, não tem limite', () => {
    expect(unidadesQueAindaCabem({}, sacola, 'p1')).toBeNull();
    expect(unidadesQueAindaCabem({ esgotado: false, restam: null }, sacola, 'p1')).toBeNull();
    expect(unidadesQueAindaCabem(undefined, sacola, 'p1')).toBeNull();
  });

  it('com poucas unidades, cabe o que sobra depois do que já está na sacola', () => {
    expect(unidadesQueAindaCabem({ esgotado: false, restam: 5 }, sacola, 'p1')).toBe(2);
    expect(unidadesQueAindaCabem({ esgotado: false, restam: 3 }, sacola, 'p1')).toBe(0);
    expect(unidadesQueAindaCabem({ esgotado: false, restam: 1 }, sacola, 'p1')).toBe(0);
  });

  it('esgotado não cabe nada', () => {
    expect(unidadesQueAindaCabem({ esgotado: true, restam: null }, [], 'p1')).toBe(0);
  });
});

describe('rotuloDeRestam', () => {
  it('no singular e no plural', () => {
    expect(rotuloDeRestam(1)).toBe('Resta 1 unidade');
    expect(rotuloDeRestam(3)).toBe('Restam 3 unidades');
  });
});

describe('avisoDeEstoque', () => {
  it('nada a dizer com estoque suficiente, sem controle, ou produto desconhecido', () => {
    expect(avisoDeEstoque({ nome: 'Açaí', esgotado: false, restam: null }, 30)).toBeNull();
    expect(avisoDeEstoque({ nome: 'Açaí', esgotado: false, restam: 3 }, 3)).toBeNull();
    expect(avisoDeEstoque(undefined, 4)).toBeNull();
  });

  it('o produto que esgotou depois de entrar na sacola pede para tirar', () => {
    expect(avisoDeEstoque({ nome: 'Açaí', esgotado: true, restam: null }, 1)).toBe(
      'Açaí esgotou. Tire da sacola para continuar.',
    );
  });

  it('a sacola com mais do que resta pede para diminuir, dizendo quantas restam', () => {
    expect(avisoDeEstoque({ nome: 'Açaí', esgotado: false, restam: 2 }, 3)).toBe(
      'Só restam 2 unidades de Açaí. Diminua a quantidade.',
    );
    expect(avisoDeEstoque({ nome: 'Açaí', esgotado: false, restam: 1 }, 2)).toBe(
      'Só resta 1 unidade de Açaí. Diminua a quantidade.',
    );
  });
});
