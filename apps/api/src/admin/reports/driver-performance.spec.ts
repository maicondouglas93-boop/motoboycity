import { computeDriverPerformance } from './driver-performance';

const entrega = (driverId: string, status: string, minutesToComplete: number | null = null) => ({
  driverId,
  status,
  minutesToComplete,
});

const oferta = (driverId: string, response: 'ACCEPTED' | 'DECLINED' | 'EXPIRED' | 'PENDING') => ({
  driverId,
  response,
});

describe('desempenho do entregador', () => {
  it('conta volume, insucesso e cancelamento depois do aceite', () => {
    const [joao] = computeDriverPerformance(
      [
        entrega('joao', 'COMPLETED'),
        entrega('joao', 'COMPLETED'),
        entrega('joao', 'FAILED'),
        entrega('joao', 'CANCELLED'),
      ],
      [],
    );

    expect(joao).toMatchObject({
      completedCount: 2,
      failedCount: 1,
      cancelledAfterAcceptCount: 1,
    });
  });

  it('a taxa de conclusão olha só o que encerrou', () => {
    // 2 concluidas de 4 encerradas = 50%.
    const [joao] = computeDriverPerformance(
      [
        entrega('joao', 'COMPLETED'),
        entrega('joao', 'COMPLETED'),
        entrega('joao', 'FAILED'),
        entrega('joao', 'CANCELLED'),
      ],
      [],
    );

    expect(joao?.completionRate).toBe(50);
  });

  it('entrega em andamento não conta como falha', () => {
    // Contar o que esta na rua como insucesso puniria quem esta trabalhando no
    // instante do relatorio.
    const [joao] = computeDriverPerformance(
      [entrega('joao', 'COMPLETED'), entrega('joao', 'COLLECTED'), entrega('joao', 'ACCEPTED')],
      [],
    );

    expect(joao?.completionRate).toBe(100);
  });

  it('sem corrida encerrada, a taxa é nula e não zero', () => {
    // Zero por cento diria que ele falhou em tudo; nulo diz que nao houve o que
    // medir, que e diferente.
    const [joao] = computeDriverPerformance([entrega('joao', 'ACCEPTED')], []);

    expect(joao?.completionRate).toBeNull();
  });

  it('calcula a taxa de aceite sobre as ofertas recebidas', () => {
    const [joao] = computeDriverPerformance(
      [],
      [
        oferta('joao', 'ACCEPTED'),
        oferta('joao', 'DECLINED'),
        oferta('joao', 'EXPIRED'),
        oferta('joao', 'ACCEPTED'),
      ],
    );

    expect(joao).toMatchObject({ offersReceived: 4, offersAccepted: 2, acceptanceRate: 50 });
  });

  it('sem oferta recebida, a taxa de aceite é nula', () => {
    const [joao] = computeDriverPerformance([entrega('joao', 'COMPLETED')], []);

    expect(joao?.acceptanceRate).toBeNull();
  });

  it('a média de tempo ignora entrega sem as duas pontas', () => {
    const [joao] = computeDriverPerformance(
      [
        entrega('joao', 'COMPLETED', 20),
        entrega('joao', 'COMPLETED', 40),
        entrega('joao', 'COMPLETED', null),
      ],
      [],
    );

    expect(joao?.averageMinutesToComplete).toBe(30);
    // O denominador fica a vista para ninguem confundir media com cobertura.
    expect(joao?.timedSamples).toBe(2);
  });

  it('sem amostra cronometrada, a média é nula', () => {
    const [joao] = computeDriverPerformance([entrega('joao', 'COMPLETED', null)], []);

    expect(joao?.averageMinutesToComplete).toBeNull();
    expect(joao?.timedSamples).toBe(0);
  });

  it('separa os entregadores e ordena por volume', () => {
    const resultado = computeDriverPerformance(
      [
        entrega('ana', 'COMPLETED'),
        entrega('ana', 'COMPLETED'),
        entrega('ana', 'COMPLETED'),
        entrega('bruno', 'COMPLETED'),
      ],
      [oferta('bruno', 'ACCEPTED')],
    );

    expect(resultado.map((item) => item.driverId)).toEqual(['ana', 'bruno']);
    expect(resultado[0]?.completedCount).toBe(3);
  });

  it('inclui quem só recebeu oferta e não aceitou nada', () => {
    // Quem recusa tudo precisa aparecer: e justamente o caso que o relatorio
    // existe para revelar.
    const resultado = computeDriverPerformance([], [oferta('carlos', 'DECLINED')]);

    expect(resultado).toHaveLength(1);
    expect(resultado[0]).toMatchObject({
      driverId: 'carlos',
      completedCount: 0,
      offersReceived: 1,
      acceptanceRate: 0,
      completionRate: null,
    });
  });

  it('período sem nada devolve lista vazia', () => {
    expect(computeDriverPerformance([], [])).toEqual([]);
  });
});
