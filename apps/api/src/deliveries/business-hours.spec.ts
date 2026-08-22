import { checkBusinessHours, describeNextOpening, isOpenAt } from './business-hours';
import { saoPauloLocalToUtc } from '../common/sao-paulo-time';

/** Instante UTC correspondente a uma hora do relógio de Lajinha. */
function em(ano: number, mes: number, dia: number, hora: number, minuto = 0): Date {
  return saoPauloLocalToUtc(ano, mes, dia, hora, minuto);
}

const h = (hora: number, minuto = 0) => hora * 60 + minuto;

/** Segunda a sexta, 08:00–12:00 e 13:30–18:00. Sábado só de manhã. */
const comercial = [
  ...[1, 2, 3, 4, 5].flatMap((weekday) => [
    { weekday, startMinute: h(8), endMinute: h(12) },
    { weekday, startMinute: h(13, 30), endMinute: h(18) },
  ]),
  { weekday: 6, startMinute: h(8), endMinute: h(12) },
];

// 24/08/2026 e uma segunda-feira; 22/08 e sabado; 23/08 e domingo.
describe('horário de funcionamento', () => {
  describe('aberto ou fechado', () => {
    it('sem horário configurado, está aberto', () => {
      // Quem nunca configurou nao pode ter pedido recusado por omissao — quem
      // liga o bloqueio e o interruptor em PlatformSettings.
      expect(isOpenAt([], em(2026, 8, 23, 3))).toBe(true);
    });

    it('aberto dentro da faixa da manhã', () => {
      expect(isOpenAt(comercial, em(2026, 8, 24, 9))).toBe(true);
    });

    it('fechado na pausa do almoço', () => {
      // A pausa e o vao entre duas faixas, e nao um campo de intervalo.
      expect(isOpenAt(comercial, em(2026, 8, 24, 12, 30))).toBe(false);
    });

    it('aberto de novo à tarde', () => {
      expect(isOpenAt(comercial, em(2026, 8, 24, 14))).toBe(true);
    });

    it('fechado antes de abrir e depois de fechar', () => {
      expect(isOpenAt(comercial, em(2026, 8, 24, 7, 59))).toBe(false);
      expect(isOpenAt(comercial, em(2026, 8, 24, 18))).toBe(false);
    });

    it('fechado no domingo, que não tem faixa nenhuma', () => {
      expect(isOpenAt(comercial, em(2026, 8, 23, 10))).toBe(false);
    });

    it('sábado fecha ao meio-dia', () => {
      expect(isOpenAt(comercial, em(2026, 8, 22, 10))).toBe(true);
      expect(isOpenAt(comercial, em(2026, 8, 22, 14))).toBe(false);
    });

    it('lê a hora no relógio da operação, não em UTC', () => {
      // 21h em Lajinha e meia-noite do dia seguinte em UTC. Avaliado em UTC, um
      // pedido das 21h de segunda cairia na terça e no horario errado.
      const instante = new Date('2026-08-25T00:00:00.000Z');

      expect(instante.getUTCHours()).toBe(0);
      expect(isOpenAt(comercial, instante)).toBe(false);
    });

    it('faixa que atravessa a meia-noite mantém aberto depois da virada', () => {
      // Um bar que abre sexta as 18h e fecha as 2h.
      const bar = [{ weekday: 5, startMinute: h(18), endMinute: h(2) }];

      expect(isOpenAt(bar, em(2026, 8, 21, 23))).toBe(true);
      expect(isOpenAt(bar, em(2026, 8, 22, 1))).toBe(true);
      expect(isOpenAt(bar, em(2026, 8, 22, 3))).toBe(false);
    });
  });

  describe('quando abre de novo', () => {
    it('diz a próxima faixa do mesmo dia', () => {
      // 12h30 de segunda: a proxima e a tarde do mesmo dia.
      expect(describeNextOpening(comercial, em(2026, 8, 24, 12, 30))).toBe('hoje às 13:30');
    });

    it('passa para amanhã quando o dia já acabou', () => {
      expect(describeNextOpening(comercial, em(2026, 8, 24, 19))).toBe('amanhã às 08:00');
    });

    it('nomeia o dia da semana quando é mais longe', () => {
      // Sabado a tarde: so abre na segunda.
      expect(describeNextOpening(comercial, em(2026, 8, 22, 14))).toBe('segunda-feira às 08:00');
    });

    it('devolve null quando não há horário configurado', () => {
      expect(describeNextOpening([], em(2026, 8, 24, 19))).toBeNull();
    });
  });

  describe('checkBusinessHours', () => {
    it('aberto não sugere próxima abertura', () => {
      expect(checkBusinessHours(comercial, em(2026, 8, 24, 9))).toEqual({
        open: true,
        nextOpeningLabel: null,
      });
    });

    it('fechado diz quando abre — a recusa vira instrução', () => {
      // Domingo: segunda e amanha, e "amanha" informa melhor que o nome do dia.
      expect(checkBusinessHours(comercial, em(2026, 8, 23, 10))).toEqual({
        open: false,
        nextOpeningLabel: 'amanhã às 08:00',
      });
    });
  });
});
