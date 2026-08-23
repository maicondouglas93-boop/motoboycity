import type { DeliveryStatus } from '@prisma/client';
import { computeStageTimes, type StatusTransition } from './delivery-stage-times';

const BASE = new Date('2026-08-22T12:00:00.000Z').getTime();

function at(minutes: number): Date {
  return new Date(BASE + minutes * 60_000);
}

function transition(toStatus: DeliveryStatus, minutes: number): StatusTransition {
  return { fromStatus: null, toStatus, changedAt: at(minutes) };
}

/** Entrega saudavel: fila 5min, coleta 10min, entrega 20min, total 35min. */
function healthy(offset = 0): StatusTransition[] {
  return [
    transition('AWAITING_DRIVER', offset),
    transition('ACCEPTED', offset + 5),
    transition('COLLECTED', offset + 15),
    transition('DELIVERED', offset + 35),
  ];
}

describe('computeStageTimes', () => {
  it('separa as etapas do ciclo', () => {
    const result = computeStageTimes([healthy()]);

    expect(result.aceite.averageMinutes).toBe(5);
    expect(result.coleta.averageMinutes).toBe(10);
    expect(result.entrega.averageMinutes).toBe(20);
    expect(result.total.averageMinutes).toBe(35);
  });

  it('nao inventa numero quando nao ha amostra', () => {
    expect(computeStageTimes([])).toEqual({
      aceite: { samples: 0, averageMinutes: null, medianMinutes: null, p90Minutes: null },
      coleta: { samples: 0, averageMinutes: null, medianMinutes: null, p90Minutes: null },
      entrega: { samples: 0, averageMinutes: null, medianMinutes: null, p90Minutes: null },
      total: { samples: 0, averageMinutes: null, medianMinutes: null, p90Minutes: null },
    });
  });

  it('ignora a etapa que nao chegou ao fim, sem descartar as anteriores', () => {
    // Coletado mas ainda em rota: aceite e coleta contam, entrega nao.
    const emRota = [
      transition('AWAITING_DRIVER', 0),
      transition('ACCEPTED', 4),
      transition('COLLECTED', 12),
    ];

    const result = computeStageTimes([emRota]);

    expect(result.aceite.samples).toBe(1);
    expect(result.coleta.samples).toBe(1);
    expect(result.entrega.samples).toBe(0);
    expect(result.total.samples).toBe(0);
  });

  it('usa a PRIMEIRA entrada na fila, nao a ultima', () => {
    // Oferta expirou e o pedido voltou para a fila aos 8min. Usar a segunda
    // entrada faria o tempo de fila cair de 20 para 12 e esconderia o pedido
    // que rodou a fila inteira — que e exatamente o caso a investigar.
    const requeued = [
      transition('AWAITING_DRIVER', 0),
      transition('AWAITING_DRIVER', 8),
      transition('ACCEPTED', 20),
      transition('COLLECTED', 30),
      transition('DELIVERED', 50),
    ];

    expect(computeStageTimes([requeued]).aceite.averageMinutes).toBe(20);
  });

  it('ordena por horario, mesmo se o historico vier fora de ordem', () => {
    const shuffled = [
      transition('DELIVERED', 35),
      transition('AWAITING_DRIVER', 0),
      transition('COLLECTED', 15),
      transition('ACCEPTED', 5),
    ];

    expect(computeStageTimes([shuffled]).total.averageMinutes).toBe(35);
  });

  it('cai para SCHEDULED quando o pedido nasceu agendado', () => {
    const agendado = [
      transition('SCHEDULED', 0),
      transition('ACCEPTED', 6),
      transition('COLLECTED', 16),
      transition('DELIVERED', 36),
    ];

    expect(computeStageTimes([agendado]).aceite.averageMinutes).toBe(6);
  });

  it('descarta duracao negativa em vez de deixar puxar a media', () => {
    const relogioTorto = [transition('AWAITING_DRIVER', 10), transition('ACCEPTED', 2)];

    expect(computeStageTimes([relogioTorto]).aceite.samples).toBe(0);
  });

  describe('media, mediana e p90', () => {
    it('mostra que a media esconde o caso ruim', () => {
      // Oito entregas de 10min e duas de 120min — dois clientes por dia
      // esperando duas horas, num dia de dez pedidos.
      const rapidas = Array.from({ length: 8 }, (_, index) => [
        transition('AWAITING_DRIVER', index * 200),
        transition('DELIVERED', index * 200 + 10),
      ]);
      const lentas = Array.from({ length: 2 }, (_, index) => [
        transition('AWAITING_DRIVER', 5000 + index * 200),
        transition('DELIVERED', 5000 + index * 200 + 120),
      ]);

      const { total } = computeStageTimes([...rapidas, ...lentas]);

      expect(total.samples).toBe(10);
      // A mediana diz o dia normal, a media suaviza, o p90 denuncia a cauda.
      expect(total.medianMinutes).toBe(10);
      expect(total.averageMinutes).toBe(32);
      expect(total.p90Minutes).toBe(120);
    });

    it('com um unico caso lento em dez, o p90 ainda fica perto da media', () => {
      // Limite honesto da metrica: com uma amostra so na cauda, a interpolacao
      // do p90 cai na fronteira e ele deixa de destacar o caso ruim. E preciso
      // volume para o p90 dizer algo — por isso `samples` vai no retorno.
      const rapidas = Array.from({ length: 9 }, (_, index) => [
        transition('AWAITING_DRIVER', index * 200),
        transition('DELIVERED', index * 200 + 10),
      ]);
      const lenta = [transition('AWAITING_DRIVER', 5000), transition('DELIVERED', 5120)];

      const { total } = computeStageTimes([...rapidas, lenta]);

      expect(total.averageMinutes).toBe(21);
      expect(total.p90Minutes).toBe(21);
    });

    it('funciona com uma amostra so', () => {
      const { total } = computeStageTimes([healthy()]);

      expect(total).toEqual({
        samples: 1,
        averageMinutes: 35,
        medianMinutes: 35,
        p90Minutes: 35,
      });
    });

    it('interpola a mediana entre dois vizinhos', () => {
      const dez = [transition('AWAITING_DRIVER', 0), transition('DELIVERED', 10)];
      const vinte = [transition('AWAITING_DRIVER', 100), transition('DELIVERED', 120)];

      expect(computeStageTimes([dez, vinte]).total.medianMinutes).toBe(15);
    });
  });

  describe('marcacao retroativa', () => {
    /** Coletou as 14h15 mas so tocou o botao as 15h. */
    const declaradaDepois: StatusTransition[] = [
      transition('AWAITING_DRIVER', 0),
      transition('ACCEPTED', 5),
      { fromStatus: 'ACCEPTED', toStatus: 'COLLECTED', changedAt: at(60), occurredAt: at(15) },
      transition('DELIVERED', 35),
    ];

    it('mede pelo horario declarado, nao pelo do toque', () => {
      // Pelo toque, a coleta teria levado 55min e a entrega teria dado negativo
      // (entregue antes de coletar). Pelo declarado, a entrega e a que foi.
      const resultado = computeStageTimes([declaradaDepois]);

      expect(resultado.coleta.averageMinutes).toBe(10);
      expect(resultado.entrega.averageMinutes).toBe(20);
    });

    it('ordena pelo horario efetivo, e nao pela ordem de escrita', () => {
      // A linha da coleta foi escrita DEPOIS da entrega. Ordenar por `changedAt`
      // faria a coleta parecer a ultima etapa do pedido.
      const resultado = computeStageTimes([declaradaDepois]);

      expect(resultado.total.averageMinutes).toBe(35);
    });

    it('exclui a entrega inteira quando pedido', () => {
      // Um SLA calculado sobre horario declarado pelo proprio interessado nao e
      // medicao — quem for cobrar meta precisa poder tirar essas do meio.
      const resultado = computeStageTimes([declaradaDepois, healthy(1000)], {
        excludeRetroactive: true,
      });

      expect(resultado.total.samples).toBe(1);
    });

    it('por padrao inclui — o declarado e a melhor aproximacao disponivel', () => {
      expect(computeStageTimes([declaradaDepois, healthy(1000)]).total.samples).toBe(2);
    });

    it('excluir nao derruba quem nunca teve declaracao', () => {
      const resultado = computeStageTimes([healthy(), healthy(1000)], {
        excludeRetroactive: true,
      });

      expect(resultado.total.samples).toBe(2);
    });
  });
});
