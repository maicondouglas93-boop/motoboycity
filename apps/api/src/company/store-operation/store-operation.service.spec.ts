import { BadRequestException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import {
  storeDeliveryAreasSchema,
  storeManualStatusSchema,
  storeNotificationsSchema,
  storeOrderTypesSchema,
  storePaymentsSchema,
  storeScheduleSchema,
} from '@motoboycity/validation';
import { Prisma, type StoreOperation, type User } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { StoreCatalogService } from '../store-catalog/store-catalog.service';
import {
  OPERACAO_INICIAL,
  StoreOperationService,
  completarOperacao,
} from './store-operation.service';

const EMPRESA = 'empresa-1';
const membro = { id: 'user-1', type: 'COMPANY_MEMBER' } as User;

const SEMANA_DO_ALMOCO = [0, 1, 2, 3, 4, 5, 6].map((dia) => ({
  dia,
  faixas: dia === 0 ? [] : [{ abre: '11:00', fecha: '14:00' }],
}));

function linha(mudancas: Partial<StoreOperation> = {}): StoreOperation {
  return {
    companyId: EMPRESA,
    schedule: { semana: SEMANA_DO_ALMOCO, excecoes: [], mensagemFechada: 'Volte logo' },
    manualStatus: null,
    orderTypes: {},
    notifications: {},
    paymentMethods: null,
    deliveryAreas: null,
    createdAt: new Date('2026-09-25T10:00:00Z'),
    updatedAt: new Date('2026-09-25T10:00:00Z'),
    ...mudancas,
  };
}

describe('StoreOperationService', () => {
  let service: StoreOperationService;
  let prisma: { storeOperation: { findUnique: jest.Mock; upsert: jest.Mock } };

  beforeEach(async () => {
    prisma = { storeOperation: { findUnique: jest.fn(), upsert: jest.fn() } };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StoreOperationService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: StoreCatalogService,
          useValue: { resolveCompanyId: jest.fn().mockResolvedValue(EMPRESA) },
        },
      ],
    }).compile();
    service = module.get(StoreOperationService);
  });

  it('loja nova: sem horário, fechada até a loja dizer quando abre', async () => {
    prisma.storeOperation.findUnique.mockResolvedValue(null);
    const operacao = await service.operation(membro);
    expect(operacao).toEqual(OPERACAO_INICIAL);
    expect(operacao.funcionamento.semana.every((dia) => dia.faixas.length === 0)).toBe(true);
  });

  it('o gravado é completado bloco a bloco com o inicial', () => {
    const operacao = completarOperacao(
      linha({
        // Gravado antes de existir "quem faz a entrega".
        orderTypes: { entrega: { ativa: true, pedidoMinimo: 20, agendamento: true } },
        notifications: { cliente: { EM_PREPARO: true } },
      }),
    );
    expect(operacao.funcionamento.mensagemFechada).toBe('Volte logo');
    expect(operacao.entrega).toEqual({
      ativa: true,
      quemEntrega: 'MOTOBOYCITY',
      pedidoMinimo: 20,
      agendamento: true,
    });
    expect(operacao.notificacoes.cliente.EM_PREPARO).toBe(true);
    expect(operacao.notificacoes.cliente.CANCELADO).toBe(true);
  });

  it('salvar um bloco só mexe nele; a loja nova nasce com o inicial nos outros', async () => {
    prisma.storeOperation.findUnique.mockResolvedValue(linha());
    const horario = {
      semana: SEMANA_DO_ALMOCO,
      excecoes: [],
      mensagemFechada: 'Voltamos às 11h',
    };

    await service.updateSchedule(membro, horario);

    const chamada = prisma.storeOperation.upsert.mock.calls[0]![0];
    expect(chamada.update).toEqual({ schedule: horario });
    expect(chamada.create.orderTypes).toMatchObject({ entrega: { quemEntrega: 'MOTOBOYCITY' } });
    expect(chamada.create.notifications).toEqual(OPERACAO_INICIAL.notificacoes);
  });

  it('o ajuste começa na hora do servidor, e um fim que já passou é recusado', async () => {
    prisma.storeOperation.findUnique.mockResolvedValue(linha());
    const daquiAMeiaHora = new Date(Date.now() + 30 * 60_000).toISOString();

    const antes = Date.now();
    await service.updateStatus(membro, { ajuste: { estado: 'PAUSADA', ate: daquiAMeiaHora } });
    const gravado = prisma.storeOperation.upsert.mock.calls[0]![0].update.manualStatus as {
      desde: string;
    };
    expect(new Date(gravado.desde).getTime()).toBeGreaterThanOrEqual(antes);
    expect(gravado).toMatchObject({ estado: 'PAUSADA', ate: daquiAMeiaHora });

    await expect(
      service.updateStatus(membro, {
        ajuste: { estado: 'PAUSADA', ate: new Date(Date.now() - 60_000).toISOString() },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('voltar ao horário apaga o ajuste', async () => {
    prisma.storeOperation.findUnique.mockResolvedValue(linha());
    await service.updateStatus(membro, { ajuste: null });
    expect(prisma.storeOperation.upsert.mock.calls[0]![0].update.manualStatus).toBe(Prisma.DbNull);
  });

  it('a página do cliente recebe tudo, menos os avisos da loja', async () => {
    prisma.storeOperation.findUnique.mockResolvedValue(linha());
    const publica = await service.publicOperation(EMPRESA);
    expect(publica).not.toHaveProperty('notificacoes');
    expect(publica.funcionamento.mensagemFechada).toBe('Volte logo');
  });

  it('loja nova recebe em dinheiro e não tem bairro: sem bairro, não há entrega', async () => {
    prisma.storeOperation.findUnique.mockResolvedValue(linha());
    const operacao = await service.operation(membro);
    expect(operacao.pagamentos).toEqual(['DINHEIRO']);
    expect(operacao.bairros).toEqual([]);
  });

  it('as formas na entrega são gravadas; as online, recusadas sem a conta Asaas', async () => {
    prisma.storeOperation.findUnique.mockResolvedValue(linha());

    await service.updatePayments(membro, { pagamentos: ['DINHEIRO', 'DEBITO_MAQUININHA'] });
    expect(prisma.storeOperation.upsert.mock.calls[0]![0].update).toEqual({
      paymentMethods: ['DINHEIRO', 'DEBITO_MAQUININHA'],
    });

    await expect(
      service.updatePayments(membro, { pagamentos: ['DINHEIRO', 'PIX_ONLINE'] }),
    ).rejects.toMatchObject({ response: { code: 'STORE_PAYMENT_ONLINE_UNAVAILABLE' } });
    expect(prisma.storeOperation.upsert).toHaveBeenCalledTimes(1);
  });

  it('forma online gravada antes não chega à página do cliente', async () => {
    prisma.storeOperation.findUnique.mockResolvedValue(
      linha({ paymentMethods: ['PIX_ONLINE', 'DINHEIRO'] }),
    );
    const publica = await service.publicOperation(EMPRESA);
    expect(publica.pagamentos).toEqual(['DINHEIRO']);
  });

  it('os bairros são gravados e lidos como a loja salvou', async () => {
    const bairros = [
      { id: 'b1', nome: 'Centro', taxa: 6 },
      { id: 'b2', nome: 'Vila Nova', taxa: 9.5 },
    ];
    prisma.storeOperation.findUnique.mockResolvedValue(linha({ deliveryAreas: bairros }));

    const operacao = await service.updateDeliveryAreas(membro, { bairros });

    expect(prisma.storeOperation.upsert.mock.calls[0]![0].update).toEqual({
      deliveryAreas: bairros,
    });
    expect(operacao.bairros).toEqual(bairros);
  });
});

describe('regras da operação na entrada', () => {
  it('horário: hora no formato certo, sete dias, datas em ordem', () => {
    const horario = { semana: SEMANA_DO_ALMOCO, excecoes: [], mensagemFechada: '' };
    expect(storeScheduleSchema.safeParse(horario).success).toBe(true);
    expect(
      storeScheduleSchema.safeParse({
        ...horario,
        semana: SEMANA_DO_ALMOCO.map((dia) => ({
          ...dia,
          faixas: [{ abre: '25:00', fecha: '14:00' }],
        })),
      }).success,
    ).toBe(false);
    expect(
      storeScheduleSchema.safeParse({ ...horario, semana: SEMANA_DO_ALMOCO.slice(1) }).success,
    ).toBe(false);
    expect(
      storeScheduleSchema.safeParse({
        ...horario,
        excecoes: [
          {
            id: 'x',
            inicio: '2026-12-26',
            fim: '2026-12-24',
            tipo: 'FECHADO',
            motivo: '',
            faixas: [],
          },
        ],
      }).success,
    ).toBe(false);
  });

  it('abrir fora do horário exige hora para terminar', () => {
    expect(
      storeManualStatusSchema.safeParse({ ajuste: { estado: 'ABERTA', ate: null } }).success,
    ).toBe(false);
    expect(
      storeManualStatusSchema.safeParse({ ajuste: { estado: 'PAUSADA', ate: null } }).success,
    ).toBe(true);
  });

  it('o aviso de cancelamento ao cliente não se desliga', () => {
    const avisos = { ...OPERACAO_INICIAL.notificacoes };
    expect(storeNotificationsSchema.safeParse(avisos).success).toBe(true);
    expect(
      storeNotificationsSchema.safeParse({
        ...avisos,
        cliente: { ...avisos.cliente, CANCELADO: false },
      }).success,
    ).toBe(false);
  });

  it('pagamento: pelo menos uma forma, sem repetir', () => {
    expect(storePaymentsSchema.safeParse({ pagamentos: ['DINHEIRO'] }).success).toBe(true);
    expect(storePaymentsSchema.safeParse({ pagamentos: [] }).success).toBe(false);
    expect(storePaymentsSchema.safeParse({ pagamentos: ['DINHEIRO', 'DINHEIRO'] }).success).toBe(
      false,
    );
    expect(storePaymentsSchema.safeParse({ pagamentos: ['CHEQUE'] }).success).toBe(false);
  });

  it('bairros: nome, taxa em reais e nada repetido — nem com acento ou maiúscula', () => {
    const centro = { id: 'b1', nome: 'Centro', taxa: 6 };
    expect(storeDeliveryAreasSchema.safeParse({ bairros: [] }).success).toBe(true);
    expect(storeDeliveryAreasSchema.safeParse({ bairros: [centro] }).success).toBe(true);
    expect(
      storeDeliveryAreasSchema.safeParse({ bairros: [{ ...centro, taxa: 6.555 }] }).success,
    ).toBe(false);
    expect(storeDeliveryAreasSchema.safeParse({ bairros: [{ ...centro, taxa: -1 }] }).success).toBe(
      false,
    );
    expect(
      storeDeliveryAreasSchema.safeParse({ bairros: [{ ...centro, nome: '  ' }] }).success,
    ).toBe(false);
    expect(
      storeDeliveryAreasSchema.safeParse({
        bairros: [centro, { id: 'b2', nome: ' CENTRO ', taxa: 4 }],
      }).success,
    ).toBe(false);
    expect(
      storeDeliveryAreasSchema.safeParse({
        bairros: [
          { id: 'b1', nome: 'São José', taxa: 5 },
          { id: 'b2', nome: 'Sao Jose', taxa: 7 },
        ],
      }).success,
    ).toBe(false);
  });

  it('tipos de pedido: o inicial passa, e o intervalo do agendamento é 15, 30 ou 60', () => {
    const { recebimento, entrega, retirada, agendamento } = OPERACAO_INICIAL;
    const tipos = { recebimento, entrega, retirada, agendamento };
    expect(storeOrderTypesSchema.safeParse(tipos).success).toBe(true);
    expect(
      storeOrderTypesSchema.safeParse({
        ...tipos,
        agendamento: { ...agendamento, intervaloMin: 20 },
      }).success,
    ).toBe(false);
  });
});
