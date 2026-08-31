import {
  parseWithdrawalAmount,
  rotuloDoBotaoFechado,
  tituloDaRegra,
} from '../src/lib/withdrawal';

describe('withdrawal helpers', () => {
  it.each([
    ['1234,56', 1234.56],
    ['1.234,56', 1234.56],
    ['1234.56', 1234.56],
    [' 100 ', 100],
  ])('converte %s para %d', (input, expected) => {
    expect(parseWithdrawalAmount(input)).toBe(expected);
  });

  /**
   * O teste antigo verificava a cópia local da regra ("é segunda?"). Essa cópia
   * foi removida: com o dia virando configuração do administrador, ela passaria
   * a mentir na primeira troca. O que sobrou para testar é a EXIBIÇÃO da
   * decisão que o servidor manda.
   */
  describe('exibição da política que vem do servidor', () => {
    it('enquanto a carteira não chegou, não afirma dia nenhum', () => {
      expect(tituloDaRegra(null)).toBe('Confirmando o dia com o servidor...');
      expect(rotuloDoBotaoFechado(null)).toBe('Confirmando o dia...');
    });

    it('aberto hoje', () => {
      expect(tituloDaRegra({ openToday: true, weekdayLabel: 'quarta-feira' })).toBe(
        'Solicitações abertas hoje',
      );
    });

    it('fechado diz qual é o dia, e não "segunda" fixo', () => {
      expect(tituloDaRegra({ openToday: false, weekdayLabel: 'quarta-feira' })).toBe(
        'Solicitações disponíveis às quarta-feiras',
      );
      expect(rotuloDoBotaoFechado({ openToday: false, weekdayLabel: 'quarta-feira' })).toBe(
        'Disponível às quarta-feiras',
      );
    });

    /** "aos sábados", e não "às sábados". */
    it('acerta a preposição de sábado e domingo', () => {
      expect(tituloDaRegra({ openToday: false, weekdayLabel: 'sábado' })).toBe(
        'Solicitações disponíveis aos sábados',
      );
      expect(tituloDaRegra({ openToday: false, weekdayLabel: 'domingo' })).toBe(
        'Solicitações disponíveis aos domingos',
      );
    });

    /** Sem restrição de dia, `openToday` é sempre true — mas o texto não pode quebrar. */
    it('não quebra quando não há dia definido', () => {
      expect(tituloDaRegra({ openToday: false, weekdayLabel: null })).toBe(
        'Solicitações fechadas hoje',
      );
      expect(rotuloDoBotaoFechado({ openToday: false, weekdayLabel: null })).toBe(
        'Indisponível hoje',
      );
    });
  });
});
