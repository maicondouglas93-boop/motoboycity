import { computePeakHours } from './delivery-peak-hours';
import { endOfDayInSaoPaulo, startOfDayInSaoPaulo } from '../../common/sao-paulo-time';

/** Agosto de 2026 começa num sábado: 5 sábados, 5 domingos e 4 de cada resto. */
const periodo = {
  from: startOfDayInSaoPaulo('2026-08-01'),
  to: endOfDayInSaoPaulo('2026-08-30'),
};

/** Instante UTC correspondente a uma hora do relógio de São Paulo. */
function em(dateOnly: string, horaLocal: number): Date {
  return new Date(startOfDayInSaoPaulo(dateOnly).getTime() + horaLocal * 60 * 60 * 1000);
}

function repetir(datas: string[], horaLocal: number, vezesPorData: number): Date[] {
  return datas.flatMap((data) => Array.from({ length: vezesPorData }, () => em(data, horaLocal)));
}

describe('horários de pico', () => {
  it('agrupa pela hora do relógio local, e não pela hora em UTC', () => {
    // 22:00 de São Paulo é 01:00 do dia seguinte em UTC. Contado em UTC, o
    // pico da janta viraria pico de madrugada.
    const resultado = computePeakHours([em('2026-08-10', 22)], periodo);

    expect(resultado.busiestHour).toBe(22);
    expect(resultado.byHour[22]?.count).toBe(1);
    expect(resultado.byHour[1]?.count).toBe(0);
  });

  it('não deixa o calendário inventar movimento no dia da semana', () => {
    // Mesmo volume bruto em sábados e segundas. Só que o período tem 5
    // sábados e 4 segundas, então a segunda é o dia realmente mais pesado —
    // a contagem crua diria empate.
    const sabados = ['2026-08-01', '2026-08-08', '2026-08-15', '2026-08-22', '2026-08-29'];
    const segundas = ['2026-08-03', '2026-08-10', '2026-08-17', '2026-08-24'];
    const resultado = computePeakHours(
      [...repetir(sabados, 12, 4), ...repetir(segundas, 12, 5)],
      periodo,
    );

    expect(resultado.byWeekday[6]?.count).toBe(20);
    expect(resultado.byWeekday[1]?.count).toBe(20);
    expect(resultado.byWeekday[6]?.occurrences).toBe(5);
    expect(resultado.byWeekday[1]?.occurrences).toBe(4);
    expect(resultado.byWeekday[6]?.averagePerOccurrence).toBe(4);
    expect(resultado.byWeekday[1]?.averagePerOccurrence).toBe(5);
    expect(resultado.busiestWeekday).toBe(1);
  });

  it('conta o período pelos dias civis das pontas, incluindo as duas', () => {
    expect(computePeakHours([], periodo).daysInPeriod).toBe(30);
  });

  it('não aponta pico quando não houve pedido', () => {
    const vazio = computePeakHours([], periodo);

    expect(vazio.totalConsidered).toBe(0);
    expect(vazio.busiestHour).toBeNull();
    expect(vazio.busiestWeekday).toBeNull();
    expect(vazio.byHour).toHaveLength(24);
    expect(vazio.byWeekday).toHaveLength(7);
    expect(vazio.byHour.every((bucket) => bucket.averagePerDay === 0)).toBe(true);
  });

  it('divide a hora pelos dias do período, não pelos dias com movimento', () => {
    // 15 pedidos às 19h em 30 dias é meio pedido por dia. Dividir só pelos
    // dias em que houve pedido daria 1,0 e superestimaria a demanda.
    const resultado = computePeakHours(repetir(['2026-08-05'], 19, 15), periodo);

    expect(resultado.byHour[19]?.averagePerDay).toBe(0.5);
  });

  it('resolve empate de hora pela mais cedo, para a resposta não oscilar', () => {
    const resultado = computePeakHours([em('2026-08-05', 11), em('2026-08-05', 20)], periodo);

    expect(resultado.busiestHour).toBe(11);
  });
});
