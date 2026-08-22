import { AdminReportsService } from './admin-reports.service';

describe('AdminReportsService', () => {
  const prisma = {
    delivery: { findMany: jest.fn() },
    // A terceira consulta e a de desempenho; a quarta, a de ofertas.
    deliveryOffer: { findMany: jest.fn() },
  };
  const service = new AdminReportsService(prisma as never);

  /**
   * As tres consultas de entrega passam pelo mesmo `findMany`, na ordem em que
   * o servico as dispara: criadas, concluidas e as com entregador.
   */
  function comEntregasCriadas(criadas: { status: string; createdAt: Date }[]) {
    prisma.delivery.findMany.mockReset();
    prisma.delivery.findMany
      .mockResolvedValueOnce(
        criadas.map((item) => ({
          ...item,
          company: { id: 'empresa-1', tradeName: 'Lanchonete do Zé' },
          serviceType: { name: 'Padrão' },
        })),
      )
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    prisma.deliveryOffer.findMany.mockResolvedValue([]);
  }

  /** O `where` da consulta de pedidos criados. */
  function periodoConsultado() {
    return prisma.delivery.findMany.mock.calls[0]?.[0]?.where?.createdAt as {
      gte: Date;
      lte: Date;
    };
  }

  beforeEach(() => {
    prisma.delivery.findMany.mockReset();
    prisma.delivery.findMany.mockResolvedValue([]);
    prisma.deliveryOffer.findMany.mockReset();
    prisma.deliveryOffer.findMany.mockResolvedValue([]);
  });

  it('recorta o período no relógio de São Paulo, e não em UTC', async () => {
    // O bug que isso trava: com as pontas em `T00:00:00Z`/`T23:59:59Z`, o
    // pedido das 22h de 31/07 caía no relatório de agosto e o das 22h de 31/08
    // ficava de fora. Três horas de todo dia lançadas no dia errado.
    await service.operations({ from: '2026-08-01', to: '2026-08-31' });

    expect(periodoConsultado().gte.toISOString()).toBe('2026-08-01T03:00:00.000Z');
    expect(periodoConsultado().lte.toISOString()).toBe('2026-09-01T02:59:59.999Z');
  });

  it('devolve o período em datas civis locais, iguais às que o admin digitou', async () => {
    const relatorio = await service.operations({ from: '2026-08-01', to: '2026-08-31' });

    expect(relatorio.period).toEqual({ from: '2026-08-01', to: '2026-08-31' });
  });

  it('sem filtro, abre a janela nos 30 dias que terminam hoje', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-22T15:00:00.000Z'));

    const relatorio = await service.operations({});

    expect(periodoConsultado().gte.toISOString()).toBe('2026-07-24T03:00:00.000Z');
    expect(relatorio.period.from).toBe('2026-07-24');
    expect(relatorio.peakHours.daysInPeriod).toBe(30);

    jest.useRealTimers();
  });

  it('conta os horários de pico pela criação, no fuso operacional', async () => {
    comEntregasCriadas([
      // 22:30 de 04/08 em São Paulo — já é dia 5 em UTC.
      { status: 'COMPLETED', createdAt: new Date('2026-08-05T01:30:00.000Z') },
      { status: 'COMPLETED', createdAt: new Date('2026-08-05T01:45:00.000Z') },
      { status: 'CANCELLED', createdAt: new Date('2026-08-10T15:00:00.000Z') },
    ]);

    const relatorio = await service.operations({ from: '2026-08-01', to: '2026-08-31' });

    expect(relatorio.peakHours.totalConsidered).toBe(3);
    expect(relatorio.peakHours.busiestHour).toBe(22);
    expect(relatorio.peakHours.byHour[22]?.count).toBe(2);
    expect(relatorio.peakHours.byHour[12]?.count).toBe(1);
    // 04/08/2026 é uma terça-feira.
    expect(relatorio.peakHours.byWeekday[2]?.count).toBe(2);
  });

  it('conta o pedido cancelado no pico — ele ocupou a operação do mesmo jeito', async () => {
    comEntregasCriadas([{ status: 'CANCELLED', createdAt: new Date('2026-08-10T15:00:00.000Z') }]);

    const relatorio = await service.operations({ from: '2026-08-01', to: '2026-08-31' });

    expect(relatorio.peakHours.totalConsidered).toBe(1);
    expect(relatorio.ordersCreated.byCurrentStatus.CANCELLED).toBe(1);
  });

  it('não aponta pico em um período sem pedido', async () => {
    const relatorio = await service.operations({ from: '2026-08-01', to: '2026-08-31' });

    expect(relatorio.peakHours.busiestHour).toBeNull();
    expect(relatorio.peakHours.busiestWeekday).toBeNull();
    expect(relatorio.peakHours.daysInPeriod).toBe(31);
  });
});
