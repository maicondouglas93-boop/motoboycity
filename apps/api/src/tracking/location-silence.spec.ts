import { shouldAlertSilence, silentMinutes } from './location-silence';

const agora = new Date('2026-08-23T15:00:00.000Z');

function minutosAtras(minutos: number): Date {
  return new Date(agora.getTime() - minutos * 60_000);
}

describe('silentMinutes', () => {
  it('conta os minutos desde o último contato', () => {
    expect(silentMinutes(minutosAtras(14), agora)).toBe(14);
  });

  it('não devolve negativo quando o carimbo está à frente do relógio', () => {
    // Relogio do aparelho adiantado nao pode virar "silencio negativo" e
    // atravessar a comparacao de limite por baixo.
    expect(silentMinutes(new Date(agora.getTime() + 60_000), agora)).toBe(0);
  });
});

describe('shouldAlertSilence', () => {
  it('avisa quando o silêncio passa do limite', () => {
    expect(
      shouldAlertSilence({
        lastContactAt: minutosAtras(14),
        alertedAt: null,
        now: agora,
        thresholdMinutes: 10,
      }),
    ).toBe(true);
  });

  it('não avisa antes do limite', () => {
    expect(
      shouldAlertSilence({
        lastContactAt: minutosAtras(9),
        alertedAt: null,
        now: agora,
        thresholdMinutes: 10,
      }),
    ).toBe(false);
  });

  it('avisa exatamente no limite', () => {
    // Semiaberto do mesmo lado que o resto do sistema: quem configurou 10
    // espera aviso aos 10.
    expect(
      shouldAlertSilence({
        lastContactAt: minutosAtras(10),
        alertedAt: null,
        now: agora,
        thresholdMinutes: 10,
      }),
    ).toBe(true);
  });

  it('sem limite configurado, o detector fica desligado', () => {
    // Mesma convencao do resto de PlatformSettings: campo nulo nao inventa
    // valor, e uma operacao que nunca configurou nao pode acordar um dia
    // mandando aviso sozinha.
    expect(
      shouldAlertSilence({
        lastContactAt: minutosAtras(600),
        alertedAt: null,
        now: agora,
        thresholdMinutes: null,
      }),
    ).toBe(false);
  });

  it('não repete o aviso dentro do mesmo episódio', () => {
    // O detector roda de dois em dois minutos. Sem esta trava, o motoboy
    // receberia o mesmo aviso trinta vezes e aprenderia a ignorar todos.
    expect(
      shouldAlertSilence({
        lastContactAt: minutosAtras(30),
        alertedAt: minutosAtras(20),
        now: agora,
        thresholdMinutes: 10,
      }),
    ).toBe(false);
  });

  it('avisa de novo quando a posição volta e some outra vez', () => {
    // Chegou posicao DEPOIS do aviso: o episodio anterior terminou, e este e
    // um silencio novo.
    expect(
      shouldAlertSilence({
        lastContactAt: minutosAtras(12),
        alertedAt: minutosAtras(40),
        now: agora,
        thresholdMinutes: 10,
      }),
    ).toBe(true);
  });

  it('posição no mesmo instante do aviso ainda é o mesmo episódio', () => {
    // Empate nao conta como volta: e o ponto que disparou o aviso, nao um
    // sinal de vida posterior a ele.
    const instante = minutosAtras(15);
    expect(
      shouldAlertSilence({
        lastContactAt: instante,
        alertedAt: instante,
        now: agora,
        thresholdMinutes: 10,
      }),
    ).toBe(false);
  });

  it('limite zero avisa imediatamente', () => {
    // Configuracao esquisita, mas coerente: zero e "qualquer silencio conta".
    expect(
      shouldAlertSilence({
        lastContactAt: agora,
        alertedAt: null,
        now: agora,
        thresholdMinutes: 0,
      }),
    ).toBe(true);
  });
});
