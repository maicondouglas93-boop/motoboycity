import { describe, expect, it } from 'vitest';
import { paginar } from './paginacao';

/**
 * Gêmeo de `apps/admin-web/test/paginacao.test.mjs`. Os dois painéis paginam a
 * fatura com a mesma função, e cada um tem o seu runner — deixar o teste só de
 * um lado faria a cópia do outro apodrecer sem ninguém notar.
 */
describe('paginação no cliente', () => {
  it('a primeira página começa no zero', () => {
    expect(paginar(120, 1, 25)).toEqual({ numero: 1, totalPaginas: 5, inicio: 0, fim: 25 });
  });

  it('a última página para no total, e não no tamanho cheio', () => {
    // 120 pedidos em páginas de 25: a quinta tem 20, não 25.
    expect(paginar(120, 5, 25)).toEqual({ numero: 5, totalPaginas: 5, inicio: 100, fim: 120 });
  });

  /**
   * A fatura recarrega sozinha quando a administração marca como paga ou
   * cancela. Se ela encolher enquanto a loja está na última página, sem o
   * grampeamento o `slice` devolveria vazio e a tela diria que a fatura não tem
   * pedido nenhum.
   */
  it('página além do fim cai na última existente', () => {
    expect(paginar(12, 9, 25)).toMatchObject({ numero: 1, inicio: 0, fim: 12 });
  });

  /**
   * `slice(-25)` conta a partir do FIM da lista: uma página zero ou negativa
   * mostraria em silêncio os últimos pedidos como se fossem os primeiros.
   */
  it('página zero ou negativa não vira fatia a partir do fim', () => {
    expect(paginar(120, 0, 25).inicio).toBe(0);
    expect(paginar(120, -3, 25).inicio).toBe(0);
  });

  it('lista vazia continua tendo uma página', () => {
    expect(paginar(0, 1, 25)).toEqual({ numero: 1, totalPaginas: 1, inicio: 0, fim: 0 });
  });

  it('total menor que a página cabe inteiro na primeira', () => {
    expect(paginar(8, 1, 25)).toEqual({ numero: 1, totalPaginas: 1, inicio: 0, fim: 8 });
  });

  it('total múltiplo exato do tamanho não cria página vazia no fim', () => {
    expect(paginar(50, 2, 25)).toMatchObject({ totalPaginas: 2, fim: 50 });
  });

  /**
   * Quem estava na página 5 de 25 em 25 e escolhe "100 por página" pediria a
   * página 5 de um total de 2.
   */
  it('aumentar o tamanho da página não deixa o número para trás', () => {
    expect(paginar(120, 5, 100).numero).toBe(2);
  });
});
