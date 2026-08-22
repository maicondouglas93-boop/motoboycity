import { isSurchargeActiveAt, type SurchargeRule } from './surcharge-window';
import { saoPauloLocalToUtc } from '../common/sao-paulo-time';

/** Instante UTC correspondente a uma hora do relógio de Lajinha. */
function em(ano: number, mes: number, dia: number, hora: number, minuto = 0): Date {
  return saoPauloLocalToUtc(ano, mes, dia, hora, minuto);
}

function taxa(over: Partial<SurchargeRule> = {}): SurchargeRule {
  return { active: true, manuallyActive: false, schedules: [], ...over };
}

const noite = {
  weekday: null,
  startDate: null,
  endDate: null,
  startMinute: 18 * 60,
  endMinute: 23 * 60,
};

describe('isSurchargeActiveAt', () => {
  describe('interruptor manual', () => {
    it('vale a qualquer hora quando ligado, mesmo sem janela nenhuma', () => {
      const chuva = taxa({ manuallyActive: true });

      expect(isSurchargeActiveAt(chuva, em(2026, 8, 22, 3))).toBe(true);
      expect(isSurchargeActiveAt(chuva, em(2026, 8, 22, 15))).toBe(true);
    });

    it('o interruptor geral vence o manual', () => {
      // Desativar precisa desligar tudo, ou uma taxa "arquivada" com o manual
      // esquecido em ligado voltaria a cobrar sozinha.
      const chuva = taxa({ active: false, manuallyActive: true });

      expect(isSurchargeActiveAt(chuva, em(2026, 8, 22, 15))).toBe(false);
    });

    it('desativada não vale nem pela janela agendada', () => {
      const feriado = taxa({ active: false, schedules: [noite] });

      expect(isSurchargeActiveAt(feriado, em(2026, 8, 22, 20))).toBe(false);
    });
  });

  describe('janela por horário', () => {
    const comNoite = taxa({ schedules: [noite] });

    it('vale dentro da faixa', () => {
      expect(isSurchargeActiveAt(comNoite, em(2026, 8, 22, 20))).toBe(true);
    });

    it('não vale fora da faixa', () => {
      expect(isSurchargeActiveAt(comNoite, em(2026, 8, 22, 12))).toBe(false);
    });

    it('inclui o minuto de início e exclui o de fim', () => {
      // Fechada no início, aberta no fim: sem isso, duas janelas encostadas
      // (18h-23h e 23h-02h) se sobreporiam exatamente as 23h.
      expect(isSurchargeActiveAt(comNoite, em(2026, 8, 22, 18, 0))).toBe(true);
      expect(isSurchargeActiveAt(comNoite, em(2026, 8, 22, 22, 59))).toBe(true);
      expect(isSurchargeActiveAt(comNoite, em(2026, 8, 22, 23, 0))).toBe(false);
    });

    it('lê a hora no relógio da operação, não em UTC', () => {
      // 20h em Lajinha e 23h em UTC. Contado em UTC, o pico da janta cairia
      // fora de uma janela que termina as 23h.
      const instante = new Date('2026-08-22T23:00:00.000Z');

      expect(instante.getUTCHours()).toBe(23);
      expect(isSurchargeActiveAt(comNoite, instante)).toBe(true);
    });

    it('janela de tamanho zero não vale nunca', () => {
      const vazia = taxa({
        schedules: [{ ...noite, startMinute: 10 * 60, endMinute: 10 * 60 }],
      });

      expect(isSurchargeActiveAt(vazia, em(2026, 8, 22, 10))).toBe(false);
    });
  });

  describe('janela que atravessa a meia-noite', () => {
    const madrugada = taxa({
      schedules: [
        { weekday: null, startDate: null, endDate: null, startMinute: 22 * 60, endMinute: 2 * 60 },
      ],
    });

    it('vale antes e depois da virada', () => {
      expect(isSurchargeActiveAt(madrugada, em(2026, 8, 22, 23))).toBe(true);
      expect(isSurchargeActiveAt(madrugada, em(2026, 8, 23, 1))).toBe(true);
    });

    it('não vale no meio do dia', () => {
      expect(isSurchargeActiveAt(madrugada, em(2026, 8, 22, 12))).toBe(false);
      expect(isSurchargeActiveAt(madrugada, em(2026, 8, 23, 3))).toBe(false);
    });
  });

  describe('janela por dia da semana', () => {
    // 21/08/2026 e uma sexta-feira.
    const sextaANoite = taxa({
      schedules: [
        { weekday: 5, startDate: null, endDate: null, startMinute: 18 * 60, endMinute: 23 * 60 },
      ],
    });

    it('vale na sexta e não no sábado', () => {
      expect(isSurchargeActiveAt(sextaANoite, em(2026, 8, 21, 20))).toBe(true);
      expect(isSurchargeActiveAt(sextaANoite, em(2026, 8, 22, 20))).toBe(false);
    });

    it('a madrugada de sexta ainda conta como sexta', () => {
      // Uma janela de sexta 22h as 2h: o pedido da 1h ja e sabado no
      // calendario, mas pertence a noite de sexta, que e o que a operacao quis
      // dizer ao marcar "sexta a noite".
      const viradaDeSexta = taxa({
        schedules: [
          { weekday: 5, startDate: null, endDate: null, startMinute: 22 * 60, endMinute: 2 * 60 },
        ],
      });

      expect(isSurchargeActiveAt(viradaDeSexta, em(2026, 8, 21, 23))).toBe(true);
      expect(isSurchargeActiveAt(viradaDeSexta, em(2026, 8, 22, 1))).toBe(true);
      // Madrugada de domingo nao: essa e a virada do sabado.
      expect(isSurchargeActiveAt(viradaDeSexta, em(2026, 8, 23, 1))).toBe(false);
    });
  });

  describe('janela por data', () => {
    const natal = taxa({
      schedules: [
        {
          weekday: null,
          startDate: '2026-12-24',
          endDate: '2026-12-26',
          startMinute: 0,
          endMinute: 24 * 60,
        },
      ],
    });

    it('vale dentro do período e nas duas pontas', () => {
      expect(isSurchargeActiveAt(natal, em(2026, 12, 24, 10))).toBe(true);
      expect(isSurchargeActiveAt(natal, em(2026, 12, 25, 10))).toBe(true);
      expect(isSurchargeActiveAt(natal, em(2026, 12, 26, 23, 59))).toBe(true);
    });

    it('não vale fora do período', () => {
      expect(isSurchargeActiveAt(natal, em(2026, 12, 23, 23, 59))).toBe(false);
      expect(isSurchargeActiveAt(natal, em(2026, 12, 27, 0, 1))).toBe(false);
    });

    it('a data é a civil da operação, não a de UTC', () => {
      // 22h de 23/12 em Lajinha ja e dia 24 em UTC. Se a comparacao fosse em
      // UTC, o feriado comecaria tres horas cedo demais.
      expect(isSurchargeActiveAt(natal, new Date('2026-12-24T01:00:00.000Z'))).toBe(false);
    });
  });

  it('sem janela e sem interruptor, não vale', () => {
    expect(isSurchargeActiveAt(taxa(), em(2026, 8, 22, 20))).toBe(false);
  });

  it('basta uma janela entre várias', () => {
    const duas = taxa({
      schedules: [
        { weekday: 1, startDate: null, endDate: null, startMinute: 0, endMinute: 60 },
        noite,
      ],
    });

    expect(isSurchargeActiveAt(duas, em(2026, 8, 22, 20))).toBe(true);
  });
});
