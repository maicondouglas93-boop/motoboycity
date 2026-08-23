import { checkRetroactiveMarking, describeRetroactiveProblem } from './retroactive-marking';

const agora = new Date('2026-08-23T15:00:00.000Z');
const anterior = new Date('2026-08-23T14:00:00.000Z');

function minutosAntesDeAgora(minutos: number): Date {
  return new Date(agora.getTime() - minutos * 60_000);
}

describe('checkRetroactiveMarking', () => {
  it('aceita um horário entre a etapa anterior e agora', () => {
    expect(
      checkRetroactiveMarking({
        declaredAt: minutosAntesDeAgora(20),
        previousAt: anterior,
        now: agora,
        minMinutes: 5,
      }),
    ).toBeNull();
  });

  it('recusa horário no futuro', () => {
    // Declarar o futuro nao e engano de digitacao inofensivo: e a forma mais
    // simples de "adiantar" uma etapa que ainda nao aconteceu.
    expect(
      checkRetroactiveMarking({
        declaredAt: new Date(agora.getTime() + 60_000),
        previousAt: anterior,
        now: agora,
        minMinutes: null,
      }),
    ).toEqual({ kind: 'FUTURE' });
  });

  it('aceita exatamente agora', () => {
    // O limite superior e semiaberto do lado certo: "agora" e passado no
    // instante em que a requisicao chega.
    expect(
      checkRetroactiveMarking({
        declaredAt: agora,
        previousAt: anterior,
        now: agora,
        minMinutes: null,
      }),
    ).toBeNull();
  });

  it('recusa horário anterior à etapa anterior', () => {
    expect(
      checkRetroactiveMarking({
        declaredAt: new Date(anterior.getTime() - 1),
        previousAt: anterior,
        now: agora,
        minMinutes: null,
      }),
    ).toEqual({ kind: 'BEFORE_PREVIOUS' });
  });

  it('recusa quando a diferença fica abaixo do mínimo', () => {
    const problema = checkRetroactiveMarking({
      declaredAt: new Date(anterior.getTime() + 2 * 60_000),
      previousAt: anterior,
      now: agora,
      minMinutes: 5,
    });

    expect(problema).toEqual({ kind: 'TOO_SOON', minMinutes: 5, declaredMinutes: 2 });
  });

  it('aceita exatamente o mínimo — o intervalo é semiaberto', () => {
    // Quem digitou 5 na configuracao espera que 5 passe. Recusar o valor exato
    // obrigaria a pessoa a entender que o sistema na verdade quer 6.
    expect(
      checkRetroactiveMarking({
        declaredAt: new Date(anterior.getTime() + 5 * 60_000),
        previousAt: anterior,
        now: agora,
        minMinutes: 5,
      }),
    ).toBeNull();
  });

  it('sem mínimo configurado, aceita até o mesmo instante da etapa anterior', () => {
    // Null e "o admin nao restringiu", nao "restrinja com um valor padrao" — a
    // mesma convencao do resto de PlatformSettings.
    expect(
      checkRetroactiveMarking({
        declaredAt: anterior,
        previousAt: anterior,
        now: agora,
        minMinutes: null,
      }),
    ).toBeNull();
  });

  it('com mínimo configurado, o mesmo instante da etapa anterior é recusado', () => {
    // E o caso que a funcionalidade existe para barrar: coleta e entrega
    // declaradas no mesmo minuto, corrida faturada sem sair do lugar.
    expect(
      checkRetroactiveMarking({
        declaredAt: anterior,
        previousAt: anterior,
        now: agora,
        minMinutes: 1,
      }),
    ).toEqual({ kind: 'TOO_SOON', minMinutes: 1, declaredMinutes: 0 });
  });

  it('o futuro é checado antes do mínimo', () => {
    // Um horario futuro que tambem viola o minimo deve reclamar do futuro: e o
    // problema que a pessoa consegue entender e corrigir.
    expect(
      checkRetroactiveMarking({
        declaredAt: new Date(agora.getTime() + 60_000),
        previousAt: new Date(agora.getTime() - 1000),
        now: agora,
        minMinutes: 30,
      }),
    ).toEqual({ kind: 'FUTURE' });
  });

  it('aceita declaração de horas atrás desde que caiba na janela', () => {
    // Nao ha limite arbitrario de "ate quantas horas atras": o piso e a etapa
    // anterior do proprio pedido, e ele ja fecha a janela sozinho.
    const anteriorDistante = new Date('2026-08-23T06:00:00.000Z');
    expect(
      checkRetroactiveMarking({
        declaredAt: new Date('2026-08-23T07:30:00.000Z'),
        previousAt: anteriorDistante,
        now: agora,
        minMinutes: 5,
      }),
    ).toBeNull();
  });
});

describe('describeRetroactiveProblem', () => {
  it('diz quanto falta quando o mínimo não foi respeitado', () => {
    const mensagem = describeRetroactiveProblem({
      kind: 'TOO_SOON',
      minMinutes: 5,
      declaredMinutes: 2.6,
    });

    expect(mensagem).toContain('5');
    // Arredonda para baixo: dizer "voce informou 3" quando foram 2min36 daria a
    // impressao de que faltavam so 2 minutos.
    expect(mensagem).toContain('2');
  });

  it('explica o horário futuro sem jargão', () => {
    expect(describeRetroactiveProblem({ kind: 'FUTURE' })).toContain('futuro');
  });
});
