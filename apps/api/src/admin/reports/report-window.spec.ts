import { isLiveWindow, percentChange, previousComparableWindow } from './report-window';

describe('previousComparableWindow', () => {
  it('devolve uma janela da mesma duração, colada antes da atual', () => {
    const atual = {
      from: new Date('2026-08-01T03:00:00.000Z'),
      to: new Date('2026-08-31T03:00:00.000Z'),
    };

    const anterior = previousComparableWindow(atual);

    expect(anterior.to.toISOString()).toBe(atual.from.toISOString());
    expect(anterior.to.getTime() - anterior.from.getTime()).toBe(
      atual.to.getTime() - atual.from.getTime(),
    );
  });

  it('com o dia corrente pela metade, as duas janelas têm as mesmas horas', () => {
    /**
     * E o caso que a funcao existe para acertar: 29 dias inteiros mais as horas
     * ja decorridas de hoje. Comparar isso com 30 dias civis completos faria
     * todo indicador parecer em queda, todo dia, ate a noite.
     */
    const atual = {
      from: new Date('2026-07-25T03:00:00.000Z'),
      to: new Date('2026-08-23T17:30:00.000Z'),
    };

    const anterior = previousComparableWindow(atual);

    expect(anterior.to.getTime() - anterior.from.getTime()).toBe(
      atual.to.getTime() - atual.from.getTime(),
    );
    expect(anterior.from.toISOString()).toBe('2026-06-25T12:30:00.000Z');
  });

  it('atravessa virada de mês e de ano sem aritmética de calendário', () => {
    // Sem somar mes: e exatamente onde o indice base zero de `Date.UTC` ja
    // produziu o mes errado neste repositorio.
    const atual = {
      from: new Date('2027-01-01T03:00:00.000Z'),
      to: new Date('2027-01-31T03:00:00.000Z'),
    };

    const anterior = previousComparableWindow(atual);

    expect(anterior.from.toISOString()).toBe('2026-12-02T03:00:00.000Z');
    expect(anterior.to.toISOString()).toBe('2027-01-01T03:00:00.000Z');
  });

  it('janela de duração zero devolve duração zero', () => {
    const instante = new Date('2026-08-23T12:00:00.000Z');

    const anterior = previousComparableWindow({ from: instante, to: instante });

    expect(anterior.from.toISOString()).toBe(instante.toISOString());
    expect(anterior.to.toISOString()).toBe(instante.toISOString());
  });
});

describe('isLiveWindow', () => {
  // 23/08/2026 as 14h em Sao Paulo (UTC-3).
  const agora = new Date('2026-08-23T17:00:00.000Z');

  it('recorte terminando hoje é ao vivo', () => {
    expect(isLiveWindow({ from: agora, to: agora }, agora)).toBe(true);
  });

  it('recorte terminando ontem não é ao vivo', () => {
    expect(isLiveWindow({ from: agora, to: new Date('2026-08-22T23:00:00.000Z') }, agora)).toBe(
      false,
    );
  });

  it('fim do dia de hoje ainda é ao vivo', () => {
    // `endOfDayInSaoPaulo(hoje)` cai as 23:59:59.999 locais, que em UTC ja e o
    // dia seguinte — comparar em UTC diria "nao e hoje" e esconderia o feed.
    expect(isLiveWindow({ from: agora, to: new Date('2026-08-24T02:59:59.999Z') }, agora)).toBe(
      true,
    );
  });

  it('meia-noite local de hoje é ao vivo', () => {
    // 00:00 de 23/08 em Sao Paulo e 03:00Z do mesmo dia — a comparacao precisa
    // acontecer no relogio da operacao, nao no UTC cru.
    expect(isLiveWindow({ from: agora, to: new Date('2026-08-23T03:00:00.000Z') }, agora)).toBe(
      true,
    );
  });
});

describe('percentChange', () => {
  it('calcula a variação com uma casa decimal', () => {
    expect(percentChange(110, 100)).toBe(10);
    expect(percentChange(90.5, 100)).toBe(-9.5);
  });

  it('base zero não vira percentual', () => {
    // Sair de nenhuma entrega para dez nao e crescimento percentual, e um
    // comeco — qualquer numero ali sugeriria uma tendencia que nao existe.
    expect(percentChange(10, 0)).toBeNull();
  });

  it('zero contra zero também é nulo, não 0%', () => {
    expect(percentChange(0, 0)).toBeNull();
  });

  it('queda a zero é -100%', () => {
    expect(percentChange(0, 40)).toBe(-100);
  });
});
