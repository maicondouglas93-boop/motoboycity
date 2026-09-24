import { describe, expect, it } from 'vitest';
import { LOJA_DE_EXEMPLO, situacaoDaLoja, type LojaDeExemplo } from '@/lib/loja-mock';

/**
 * `situacaoDaLoja` decide se a página aceita pedido. Errar aqui tem duas
 * consequências opostas e ambas ruins: recusar venda de loja aberta, ou aceitar
 * pedido com a cozinha apagada e chamar motoboy para porta fechada.
 *
 * Os casos abaixo são os que não dá para conferir abrindo o navegador — não se
 * espera até o Natal, nem até as três da manhã, para saber se funciona.
 */

function lojaCom(mudancas: Partial<LojaDeExemplo>): LojaDeExemplo {
  return { ...LOJA_DE_EXEMPLO, ...mudancas };
}

/** Terça-feira, que no exemplo abre 11h–14h e 18h–22h. */
const terca = (hora: number, minuto = 0) => new Date(2026, 8, 22, hora, minuto);

describe('situacaoDaLoja', () => {
  it('abre dentro da faixa e diz até quando', () => {
    expect(situacaoDaLoja(LOJA_DE_EXEMPLO, terca(12))).toEqual({
      aberta: true,
      texto: 'Aberto até 14:00',
    });
  });

  it('fecha no intervalo entre almoço e janta, e diz quando volta', () => {
    expect(situacaoDaLoja(LOJA_DE_EXEMPLO, terca(15, 30))).toEqual({
      aberta: false,
      texto: 'Fechado · abre às 18:00',
    });
  });

  it('depois da última faixa, aponta para o dia seguinte', () => {
    expect(situacaoDaLoja(LOJA_DE_EXEMPLO, terca(23))).toEqual({
      aberta: false,
      texto: 'Fechado · abre amanhã às 11:00',
    });
  });

  it('no domingo sem horário, procura o próximo dia que abre', () => {
    const domingo = new Date(2026, 8, 20, 12);
    expect(situacaoDaLoja(LOJA_DE_EXEMPLO, domingo)).toEqual({
      aberta: false,
      texto: 'Fechado · abre amanhã às 11:00',
    });
  });

  it('a pausa manual vence o horário', () => {
    const loja = lojaCom({ pausadaManualmente: true });
    expect(situacaoDaLoja(loja, terca(12))).toEqual({
      aberta: false,
      texto: 'Fechada no momento',
    });
  });

  it('o feriado vence o horário e diz o motivo', () => {
    const loja = lojaCom({ diasFechados: [{ data: '2026-09-22', motivo: 'Reforma' }] });
    expect(situacaoDaLoja(loja, terca(12))).toEqual({
      aberta: false,
      texto: 'Fechado hoje · Reforma',
    });
  });

  it('o feriado de outro dia não fecha hoje', () => {
    const loja = lojaCom({ diasFechados: [{ data: '2026-12-25', motivo: 'Natal' }] });
    expect(situacaoDaLoja(loja, terca(12)).aberta).toBe(true);
  });

  it('fecha exatamente no minuto de fechar, e não um minuto depois', () => {
    expect(situacaoDaLoja(LOJA_DE_EXEMPLO, terca(13, 59)).aberta).toBe(true);
    expect(situacaoDaLoja(LOJA_DE_EXEMPLO, terca(14, 0)).aberta).toBe(false);
  });

  it('sem nenhum dia com horário, não diz que abre algum dia', () => {
    const loja = lojaCom({ semana: LOJA_DE_EXEMPLO.semana.map((dia) => ({ ...dia, faixas: [] })) });
    expect(situacaoDaLoja(loja, terca(12))).toEqual({ aberta: false, texto: 'Fechada' });
  });
});
