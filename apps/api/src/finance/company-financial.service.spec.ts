import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CompanyFinancialService } from './company-financial.service';
import { FinancialClock } from './financial-clock.service';
import { InvoiceService } from './invoice.service';

/** Um agregado do Prisma, no formato que o service consome. */
function agregado(count: number, total: number | null) {
  return { _count: { _all: count }, _sum: { totalValue: total } };
}

describe('CompanyFinancialService.position', () => {
  let service: CompanyFinancialService;
  let prisma: {
    companyTeamMember: { findFirst: jest.Mock };
    invoice: { aggregate: jest.Mock; findFirst: jest.Mock };
    delivery: { aggregate: jest.Mock; findMany: jest.Mock };
  };
  let invoiceService: { refreshOverdueInvoices: jest.Mock };

  const lojista = { id: 'user-1', type: 'COMPANY_MEMBER' } as User;

  beforeEach(async () => {
    prisma = {
      companyTeamMember: { findFirst: jest.fn().mockResolvedValue({ companyId: 'empresa-1' }) },
      invoice: {
        aggregate: jest.fn().mockResolvedValue(agregado(0, null)),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      delivery: {
        aggregate: jest.fn().mockResolvedValue(agregado(0, null)),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    invoiceService = { refreshOverdueInvoices: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CompanyFinancialService,
        { provide: PrismaService, useValue: prisma },
        { provide: InvoiceService, useValue: invoiceService },
        // Segunda-feira, 24/08/2026, meio-dia em São Paulo.
        { provide: FinancialClock, useValue: { now: () => new Date('2026-08-24T15:00:00Z') } },
      ],
    }).compile();

    service = module.get(CompanyFinancialService);
  });

  it('lê a empresa do TOKEN, nunca de parâmetro', async () => {
    /**
     * O teste que protege o painel inteiro. Se a empresa viesse da requisição,
     * uma loja leria o financeiro de outra — e o vazamento seria silencioso,
     * porque a tela funcionaria normalmente.
     */
    await service.position(lojista);

    expect(prisma.companyTeamMember.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user-1', active: true } }),
    );
    for (const chamada of prisma.invoice.aggregate.mock.calls) {
      expect(chamada[0].where.companyId).toBe('empresa-1');
    }
    expect(prisma.delivery.aggregate.mock.calls[0]?.[0].where.companyId).toBe('empresa-1');
  });

  it('recusa quem não é empresa', async () => {
    const motoboy = { id: 'user-9', type: 'DRIVER' } as User;

    await expect(service.position(motoboy)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.invoice.aggregate).not.toHaveBeenCalled();
  });

  it('recusa usuário de empresa sem vínculo', async () => {
    prisma.companyTeamMember.findFirst.mockResolvedValue(null);

    await expect(service.position(lojista)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('atualiza o vencimento ANTES de somar', async () => {
    // Sem isto, fatura vencida hoje ainda contaria como "a vencer" — e a loja
    // veria zero em atraso justamente no dia em que precisa agir.
    await service.position(lojista);

    expect(invoiceService.refreshOverdueInvoices).toHaveBeenCalled();
  });

  it('soma as três partes no total em aberto', async () => {
    prisma.invoice.aggregate
      .mockResolvedValueOnce(agregado(2, 100.1)) // a vencer
      .mockResolvedValueOnce(agregado(1, 50.2)); // vencido
    prisma.delivery.aggregate.mockResolvedValue(agregado(3, 25.3)); // sem fatura

    const posicao = await service.position(lojista);

    expect(posicao.notDue).toEqual({ count: 2, value: 100.1 });
    expect(posicao.overdue.value).toBe(50.2);
    expect(posicao.unbilled).toEqual({ count: 3, value: 25.3 });
    // 100.1 + 50.2 + 25.3 em float dá 175.60000000000002.
    expect(posicao.totalOpen).toBe(175.6);
  });

  it('conta os dias de atraso da fatura mais antiga', async () => {
    prisma.invoice.aggregate
      .mockResolvedValueOnce(agregado(0, null))
      .mockResolvedValueOnce(agregado(1, 80));
    prisma.invoice.findFirst.mockResolvedValue({ dueDate: new Date('2026-08-14T03:00:00Z') });

    const posicao = await service.position(lojista);

    expect(posicao.overdue.maxOverdueDays).toBe(10);
  });

  it('sem nada lançado devolve zero, e não nulo', async () => {
    const posicao = await service.position(lojista);

    expect(posicao.totalOpen).toBe(0);
    expect(posicao.overdue.maxOverdueDays).toBe(0);
    expect(posicao.unbilled.value).toBe(0);
  });

  it('na segunda de manhã, o próximo fechamento é a segunda SEGUINTE', async () => {
    // O fechamento roda às 00:05. Quem abre a tela na segunda de manhã quer
    // saber que é hoje, não daqui a uma semana.
    const posicao = await service.position(lojista);

    expect(posicao.nextClosingDate).toBe('2026-08-31');
  });

  it('só conta como "sem fatura" pedido concluído e faturado', async () => {
    // Pedido pago online nunca vira fatura: incluí-lo faria a loja ver dívida
    // por algo que ela já pagou.
    await service.position(lojista);

    expect(prisma.delivery.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: 'COMPLETED',
          paymentMethod: 'BILLED',
          invoiceId: null,
        }),
      }),
    );
  });
});

describe('CompanyFinancialService.unbilledDeliveries', () => {
  let service: CompanyFinancialService;
  let prisma: {
    companyTeamMember: { findFirst: jest.Mock };
    delivery: { findMany: jest.Mock };
  };

  const lojista = { id: 'user-1', type: 'COMPANY_MEMBER' } as User;

  function pedido(extra: Record<string, unknown> = {}) {
    return {
      id: 'ped-1',
      displayNumber: 1173,
      statusChangedAt: new Date('2026-08-20T18:00:00Z'),
      totalValue: 12.5,
      serviceType: { name: 'Padrão' },
      addresses: [{ street: 'Rua Sete', number: '120', city: 'Lajinha' }],
      ...extra,
    };
  }

  beforeEach(async () => {
    prisma = {
      companyTeamMember: { findFirst: jest.fn().mockResolvedValue({ companyId: 'empresa-1' }) },
      delivery: { findMany: jest.fn().mockResolvedValue([]) },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CompanyFinancialService,
        { provide: PrismaService, useValue: prisma },
        { provide: InvoiceService, useValue: { refreshOverdueInvoices: jest.fn() } },
        { provide: FinancialClock, useValue: { now: () => new Date('2026-08-24T15:00:00Z') } },
      ],
    }).compile();

    service = module.get(CompanyFinancialService);
  });

  it('só busca pedidos da empresa do token', async () => {
    await service.unbilledDeliveries(lojista);

    expect(prisma.delivery.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          companyId: 'empresa-1',
          status: 'COMPLETED',
          paymentMethod: 'BILLED',
          invoiceId: null,
        }),
      }),
    );
  });

  it('recusa quem não é empresa', async () => {
    const motoboy = { id: 'user-9', type: 'DRIVER' } as User;

    await expect(service.unbilledDeliveries(motoboy)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.delivery.findMany).not.toHaveBeenCalled();
  });

  it('monta o endereço em uma linha', async () => {
    prisma.delivery.findMany.mockResolvedValue([pedido()]);

    const { items } = await service.unbilledDeliveries(lojista);

    expect(items[0]?.dropoffAddress).toBe('Rua Sete, 120 - Lajinha');
  });

  it('avisa quando o destino foi capturado por GPS', async () => {
    // Entrega sem destino informado guarda só lat/lng. Deixar a linha vazia
    // pareceria defeito da tela.
    prisma.delivery.findMany.mockResolvedValue([
      pedido({ addresses: [{ street: null, number: null, city: null }] }),
    ]);

    const { items } = await service.unbilledDeliveries(lojista);

    expect(items[0]?.dropoffAddress).toBe('Destino informado na entrega');
  });

  it('soma o total em centavos, sem sobra de float', async () => {
    prisma.delivery.findMany.mockResolvedValue([
      pedido({ id: 'a', totalValue: 10.1 }),
      pedido({ id: 'b', totalValue: 20.2 }),
      pedido({ id: 'c', totalValue: 0.7 }),
    ]);

    const { total, count } = await service.unbilledDeliveries(lojista);

    // Em float, 10.1 + 20.2 + 0.7 dá 30.999999999999996.
    expect(total).toBe(31);
    expect(count).toBe(3);
  });

  it('sem pedidos, devolve lista vazia e total zero', async () => {
    const resultado = await service.unbilledDeliveries(lojista);

    expect(resultado.items).toEqual([]);
    expect(resultado.total).toBe(0);
    expect(resultado.closingDate).toBe('2026-08-31');
  });
});

describe('CompanyFinancialService.summary', () => {
  let service: CompanyFinancialService;
  let prisma: {
    companyTeamMember: { findFirst: jest.Mock };
    delivery: {
      aggregate: jest.Mock;
      count: jest.Mock;
      groupBy: jest.Mock;
      findMany: jest.Mock;
    };
    serviceType: { findUnique: jest.Mock };
  };

  const lojista = { id: 'user-1', type: 'COMPANY_MEMBER' } as User;
  const periodo = { from: '2026-08-10', to: '2026-08-16' };

  beforeEach(async () => {
    prisma = {
      companyTeamMember: { findFirst: jest.fn().mockResolvedValue({ companyId: 'empresa-1' }) },
      delivery: {
        aggregate: jest.fn().mockResolvedValue(agregado(0, null)),
        count: jest.fn().mockResolvedValue(0),
        groupBy: jest.fn().mockResolvedValue([]),
        findMany: jest.fn().mockResolvedValue([]),
      },
      serviceType: { findUnique: jest.fn().mockResolvedValue({ name: 'Padrão' }) },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CompanyFinancialService,
        { provide: PrismaService, useValue: prisma },
        { provide: InvoiceService, useValue: { refreshOverdueInvoices: jest.fn() } },
        { provide: FinancialClock, useValue: { now: () => new Date('2026-08-24T15:00:00Z') } },
      ],
    }).compile();

    service = module.get(CompanyFinancialService);
  });

  it('recusa quem não é empresa', async () => {
    const motoboy = { id: 'user-9', type: 'DRIVER' } as User;

    await expect(service.summary(motoboy, periodo)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('agrega no banco, não no navegador', async () => {
    // A razão de existir deste endpoint: a tela de indicadores baixava a lista
    // inteira de entregas para somar em JavaScript.
    await service.summary(lojista, periodo);

    expect(prisma.delivery.aggregate).toHaveBeenCalled();
    expect(prisma.delivery.groupBy).toHaveBeenCalled();
    expect(prisma.delivery.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { id: 'asc' }, take: 500 }),
    );
  });

  it('o período anterior tem a mesma duração, encostado no atual', async () => {
    await service.summary(lojista, periodo);

    // Varias consultas usam a mesma janela; interessa o conjunto distinto
    // delas, nao a ordem em que o Promise.all as disparou.
    const janelas = [
      ...new Map(
        prisma.delivery.aggregate.mock.calls
          .map((chamada) => chamada[0].where.createdAt)
          .map((janela) => [`${janela.gte.getTime()}-${janela.lt.getTime()}`, janela]),
      ).values(),
    ].sort((esquerda, direita) => direita.gte.getTime() - esquerda.gte.getTime());
    const [atual, anterior] = janelas;
    const duracaoAtual = atual.lt.getTime() - atual.gte.getTime();
    const duracaoAnterior = anterior.lt.getTime() - anterior.gte.getTime();

    expect(duracaoAnterior).toBe(duracaoAtual);
    // O anterior termina exatamente onde o atual começa.
    expect(anterior.lt.getTime()).toBe(atual.gte.getTime());
  });

  it('sem movimento antes, "anterior" é nulo e não zero', async () => {
    // Zeros fariam a tela mostrar "+100%" na primeira semana de uso da loja.
    const resumo = await service.summary(lojista, periodo);

    expect(resumo.previous).toBeNull();
  });

  it('ticket médio é zero quando não há pedido', async () => {
    const resumo = await service.summary(lojista, periodo);

    expect(resumo.current.averageTicket).toBe(0);
    expect(Number.isNaN(resumo.current.averageTicket)).toBe(false);
  });

  it('calcula o ticket médio com duas casas', async () => {
    prisma.delivery.aggregate.mockResolvedValue(agregado(3, 100));

    const resumo = await service.summary(lojista, periodo);

    // 100 / 3 = 33.333..., que precisa parar em centavos.
    expect(resumo.current.averageTicket).toBe(33.33);
  });

  it('agrupa a série diária no fuso de São Paulo', async () => {
    /**
     * Pedido das 22h em São Paulo é 01h do dia seguinte em UTC. Agrupar por
     * data UTC jogaria o horário de pico inteiro para o dia errado.
     */
    prisma.delivery.aggregate.mockResolvedValue(agregado(2, 25));
    prisma.delivery.findMany.mockResolvedValue([
      { createdAt: new Date('2026-08-12T01:30:00Z'), totalValue: 12.5 },
      { createdAt: new Date('2026-08-12T14:00:00Z'), totalValue: 12.5 },
    ]);

    const resumo = await service.summary(lojista, periodo);

    expect(resumo.daily).toEqual([
      { date: '2026-08-11', count: 1, value: 12.5 },
      { date: '2026-08-12', count: 1, value: 12.5 },
    ]);
  });

  it('nomeia a modalidade mais usada', async () => {
    prisma.delivery.groupBy.mockResolvedValue([
      { serviceTypeId: 'srv-1', _count: { _all: 7 } },
    ]);

    const resumo = await service.summary(lojista, periodo);

    expect(resumo.topServiceType).toEqual({ name: 'Padrão', count: 7 });
  });

  it('sem pedidos, não inventa modalidade', async () => {
    const resumo = await service.summary(lojista, periodo);

    expect(resumo.topServiceType).toBeNull();
  });
});
