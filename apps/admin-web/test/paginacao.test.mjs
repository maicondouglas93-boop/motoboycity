import assert from 'node:assert/strict';
import test from 'node:test';
import { paginar } from '../src/lib/paginacao.ts';

test('a primeira página começa no zero', () => {
  assert.deepEqual(paginar(120, 1, 25), { numero: 1, totalPaginas: 5, inicio: 0, fim: 25 });
});

test('a última página para no total, e não no tamanho cheio', () => {
  // 120 pedidos em páginas de 25: a quinta tem 20, não 25.
  assert.deepEqual(paginar(120, 5, 25), { numero: 5, totalPaginas: 5, inicio: 100, fim: 120 });
});

/**
 * A fatura recarrega sozinha depois de marcar como paga ou cancelar. Se ela
 * encolher enquanto alguém está na última página, sem o grampeamento o `slice`
 * devolveria vazio e a tela diria que a fatura não tem pedido nenhum.
 */
test('página além do fim cai na última existente', () => {
  const pagina = paginar(12, 9, 25);
  assert.equal(pagina.numero, 1);
  assert.equal(pagina.inicio, 0);
  assert.equal(pagina.fim, 12);
});

/**
 * `slice(-25)` conta a partir do FIM da lista: uma página zero ou negativa
 * mostraria silenciosamente os últimos pedidos como se fossem os primeiros.
 */
test('página zero ou negativa não vira fatia a partir do fim', () => {
  assert.equal(paginar(120, 0, 25).inicio, 0);
  assert.equal(paginar(120, -3, 25).inicio, 0);
});

test('lista vazia continua tendo uma página', () => {
  assert.deepEqual(paginar(0, 1, 25), { numero: 1, totalPaginas: 1, inicio: 0, fim: 0 });
});

test('total menor que a página cabe inteiro na primeira', () => {
  assert.deepEqual(paginar(8, 1, 25), { numero: 1, totalPaginas: 1, inicio: 0, fim: 8 });
});

test('total múltiplo exato do tamanho não cria página vazia no fim', () => {
  const pagina = paginar(50, 2, 25);
  assert.equal(pagina.totalPaginas, 2);
  assert.equal(pagina.fim, 50);
});

/**
 * Trocar o tamanho da página sem mexer no número: quem estava na página 5 de 25
 * em 25 e escolhe "50 por página" pediria a página 5 de um total de 3.
 */
test('aumentar o tamanho da página não deixa o número para trás', () => {
  assert.equal(paginar(120, 5, 50).numero, 3);
});
