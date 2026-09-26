import { Test, type TestingModule } from '@nestjs/testing';
import type { User } from '@prisma/client';
import { Prisma, type StoreOrder } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { StoreCatalogService } from '../store-catalog/store-catalog.service';
import { StoreOperationService } from '../store-operation/store-operation.service';
import { StoreOrdersService } from './store-orders.service';

/**
 * O lado da loja: a fila de Vendas e o que a loja faz com cada pedido. Cada
 * mudança só grava se o pedido ainda estiver como foi lido.
 */

const EMPRESA = 'empresa-1';
const membro = { id: 'user-1', type: 'COMPANY_MEMBER' } as User;
const RECEBIDO = new Date('2026-09-23T15:00:00.000Z');

function linha(mudancas: Partial<StoreOrder> = {}): StoreOrder {
  return {
    id: 'pedido-1',
    companyId: EMPRESA,
    number: 42,
    customerAuthId: 'uid-1',
    customerName: 'Ana',
    customerPhone: '33999887766',
    modality: 'ENTREGA',
    stage: 'NOVO',
    courier: 'MOTOBOYCITY',
    history: [{ etapa: 'NOVO', em: RECEBIDO.toISOString() }],
    scheduledStart: null,
    scheduledEnd: null,
    prepMinutes: 20,
    deliveryMinutes: 15,
    acceptDeadline: new Date(RECEBIDO.getTime() + 10 * 60_000),
    address: null,
    items: [],
    subtotal: new Prisma.Decimal(40),
    deliveryFee: new Prisma.Decimal(5),
    total: new Prisma.Decimal(45),
    paymentMethod: 'DINHEIRO',
    changeFor: null,
    note: null,
    cancelReason: null,
    cancelledBy: null,
    createdAt: RECEBIDO,
    updatedAt: RECEBIDO,
    ...mudancas,
  };
}

describe('StoreOrdersService — Vendas', () => {
  let service: StoreOrdersService;
  let prisma: {
    storeOrder: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      findFirstOrThrow: jest.Mock;
      updateMany: jest.Mock;
    };
  };

  beforeEach(async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
    jest.setSystemTime(new Date(RECEBIDO.getTime() + 2 * 60_000));
    prisma = {
      storeOrder: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(linha()),
        findFirstOrThrow: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    // Depois de gravar, a releitura devolve a linha com o que foi gravado.
    prisma.storeOrder.findFirstOrThrow.mockImplementation(() =>
      Promise.resolve(linha(prisma.storeOrder.updateMany.mock.calls.at(-1)?.[0].data)),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StoreOrdersService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: StoreCatalogService,
          useValue: { resolveCompanyId: jest.fn().mockResolvedValue(EMPRESA) },
        },
        { provide: StoreOperationService, useValue: {} },
      ],
    }).compile();
    service = module.get(StoreOrdersService);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('aceitar grava a etapa, a hora, o preparo escolhido e tira o prazo', async () => {
    const aceito = await service.avancarEtapa(membro, 'pedido-1', {
      para: 'ACEITO',
      minutosDePreparo: 40,
    });

    const { where, data } = prisma.storeOrder.updateMany.mock.calls[0]![0];
    expect(where).toEqual({ id: 'pedido-1', companyId: EMPRESA, updatedAt: RECEBIDO });
    expect(data).toMatchObject({ stage: 'ACEITO', acceptDeadline: null, prepMinutes: 40 });
    expect(aceito.historico.map((passo) => passo.etapa)).toEqual(['NOVO', 'ACEITO']);
  });

  it('pedir a etapa em que o pedido já está não grava nada; pular etapa é recusado', async () => {
    prisma.storeOrder.findFirst.mockResolvedValue(linha({ stage: 'ACEITO' }));
    await service.avancarEtapa(membro, 'pedido-1', { para: 'ACEITO' });
    expect(prisma.storeOrder.updateMany).not.toHaveBeenCalled();

    await expect(
      service.avancarEtapa(membro, 'pedido-1', { para: 'PRONTO' }),
    ).rejects.toMatchObject({ response: { code: 'STORE_ORDER_STAGE_INVALID' } });
  });

  it('se outra aba mudou o pedido no meio, relê e decide de novo', async () => {
    prisma.storeOrder.updateMany.mockResolvedValueOnce({ count: 0 });
    prisma.storeOrder.findFirst
      .mockResolvedValueOnce(linha())
      // Na releitura, a outra aba já tinha aceitado.
      .mockResolvedValueOnce(linha({ stage: 'ACEITO', updatedAt: new Date() }));

    const pedido = await service.avancarEtapa(membro, 'pedido-1', { para: 'ACEITO' });

    expect(pedido.etapa).toBe('ACEITO');
    expect(prisma.storeOrder.updateMany).toHaveBeenCalledTimes(1);
  });

  it('cancelar grava o motivo e quem cancelou; depois de pronto, pelo MOTOboyCity, não dá', async () => {
    await service.cancelar(membro, 'pedido-1', 'Item em falta');
    expect(prisma.storeOrder.updateMany.mock.calls[0]![0].data).toMatchObject({
      stage: 'CANCELADO',
      cancelReason: 'Item em falta',
      cancelledBy: 'LOJA',
    });

    prisma.storeOrder.findFirst.mockResolvedValue(linha({ stage: 'PRONTO' }));
    await expect(service.cancelar(membro, 'pedido-1', 'Tarde demais')).rejects.toMatchObject({
      response: { code: 'STORE_ORDER_STAGE_INVALID' },
    });
  });

  it('o pedido do entregador da loja passa para o MOTOboyCity', async () => {
    prisma.storeOrder.findFirst.mockResolvedValue(linha({ stage: 'EM_PREPARO', courier: 'LOJA' }));
    await service.chamarMotoboy(membro, 'pedido-1');
    expect(prisma.storeOrder.updateMany.mock.calls[0]![0].data).toEqual({
      courier: 'MOTOBOYCITY',
    });
  });

  it('a fila cancela, pelo sistema, o pedido que passou do prazo do aceite', async () => {
    jest.setSystemTime(new Date(RECEBIDO.getTime() + 11 * 60_000));
    prisma.storeOrder.findMany
      .mockResolvedValueOnce([{ id: 'pedido-1' }])
      .mockResolvedValueOnce([]);

    await service.vendas(membro);

    expect(prisma.storeOrder.updateMany.mock.calls[0]![0].data).toMatchObject({
      stage: 'CANCELADO',
      cancelledBy: 'SISTEMA',
      cancelReason: 'A loja não confirmou a tempo',
    });
  });
});
