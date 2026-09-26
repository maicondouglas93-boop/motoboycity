import { Test, type TestingModule } from '@nestjs/testing';
import type { OperacaoPublica, PublicStoreProduct } from '@motoboycity/types';
import type { StoreCheckoutPayload } from '@motoboycity/validation';
import { Prisma } from '@prisma/client';
import { DeliveriesService } from '../../deliveries/deliveries.service';
import { PrismaService } from '../../prisma/prisma.service';
import { StoreCatalogService } from '../store-catalog/store-catalog.service';
import {
  OPERACAO_INICIAL,
  StoreOperationService,
} from '../store-operation/store-operation.service';
import { StoreOrderNotificationsService } from './store-order-notifications.service';
import { StoreOrdersService } from './store-orders.service';

const EMPRESA = 'empresa-1';
const CLIENTE = 'user_cliente';

/** Quarta-feira, meio-dia na hora da loja. */
const MEIO_DIA = new Date('2026-09-23T12:00:00-03:00');

const ACAI: PublicStoreProduct = {
  id: 'p1',
  categoryId: 'c1',
  name: 'Açaí',
  description: '',
  imageUrl: null,
  price: null,
  sizes: [
    { id: 't1', name: '500ml', price: 18, available: true },
    { id: 't2', name: '700ml', price: 24, available: false },
  ],
  optionGroups: [
    {
      id: 'g1',
      name: 'Adicionais',
      minChoices: 0,
      maxChoices: 2,
      options: [
        { id: 'e1', name: 'Morango', price: 3, available: true },
        { id: 'e2', name: 'Kiwi', price: 4, available: false },
      ],
    },
    {
      id: 'g2',
      name: 'Calda',
      minChoices: 1,
      maxChoices: 1,
      options: [{ id: 'c1', name: 'Chocolate', price: 0.1, available: true }],
    },
  ],
};

const SUCO: PublicStoreProduct = {
  ...ACAI,
  id: 'p2',
  name: 'Suco',
  price: 7.2,
  sizes: [],
  optionGroups: [],
};

function operacao(mudancas: Partial<OperacaoPublica> = {}): OperacaoPublica {
  const { notificacoes: _avisos, ...base } = OPERACAO_INICIAL;
  return {
    ...base,
    funcionamento: {
      ...base.funcionamento,
      semana: [0, 1, 2, 3, 4, 5, 6].map((dia) => ({
        dia,
        faixas: [{ abre: '11:00', fecha: '14:00' }],
      })),
    },
    entrega: { ...base.entrega, pedidoMinimo: 10, agendamento: true },
    agendamento: { ...base.agendamento, permitir: true, antecedenciaMinimaMin: 0 },
    pagamentos: ['DINHEIRO', 'PIX_MAQUININHA'],
    bairros: [{ id: 'b1', nome: 'Centro', taxa: 6 }],
    ...mudancas,
  };
}

/** Açaí 500ml com morango e chocolate (18 + 3 + 0,10) x 2, mais 6 de entrega. */
function pedido(mudancas: Partial<StoreCheckoutPayload> = {}): StoreCheckoutPayload {
  return {
    modalidade: 'ENTREGA',
    itens: [{ produtoId: 'p1', tamanhoId: 't1', escolhas: ['e1', 'c1'], quantidade: 2 }],
    agendadoPara: null,
    cliente: { nome: 'Ana', telefone: '33999887766' },
    entrega: {
      rua: 'Rua A',
      numero: '10',
      complemento: null,
      bairroId: 'b1',
      cidade: 'Lajinha',
      estado: 'MG',
      cep: '',
      referencia: null,
    },
    pagamento: 'DINHEIRO',
    trocoPara: null,
    observacao: null,
    totalVisto: 48.2,
    ...mudancas,
  };
}

describe('StoreOrdersService', () => {
  let service: StoreOrdersService;
  let prisma: {
    storeSlug: { findUnique: jest.Mock };
    storeOrder: {
      aggregate: jest.Mock;
      create: jest.Mock;
      findMany: jest.Mock;
      findFirst: jest.Mock;
      updateMany: jest.Mock;
    };
    companyAddress: { findFirst: jest.Mock };
    $transaction: jest.Mock;
  };
  let catalogo: { publicCatalog: jest.Mock };
  let operacaoDaLoja: { publicOperation: jest.Mock; tipoDeServicoDaCorrida: jest.Mock };
  let entregas: { createFromStoreOrder: jest.Mock };
  let avisos: { pedidoNovo: jest.Mock; etapaMudou: jest.Mock };

  const lojaQueRecebe = (acceptsOrders = true) => ({
    company: { id: EMPRESA, status: 'ACTIVE', storeSettings: { acceptsOrders } },
  });

  beforeEach(async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
    jest.setSystemTime(MEIO_DIA);
    prisma = {
      storeSlug: { findUnique: jest.fn().mockResolvedValue(lojaQueRecebe()) },
      storeOrder: {
        aggregate: jest.fn().mockResolvedValue({ _max: { number: 41 } }),
        create: jest.fn().mockImplementation(({ data }) =>
          Promise.resolve({
            id: 'pedido-1',
            createdAt: new Date(),
            updatedAt: new Date(),
            cancelReason: null,
            cancelledBy: null,
            deliveryId: null,
            rideAttempt: 0,
            rideIssue: null,
            ...data,
            address: data.address === Prisma.DbNull ? null : data.address,
            subtotal: new Prisma.Decimal(data.subtotal),
            deliveryFee: new Prisma.Decimal(data.deliveryFee),
            total: new Prisma.Decimal(data.total),
            changeFor: data.changeFor === null ? null : new Prisma.Decimal(data.changeFor),
          }),
        ),
        findMany: jest.fn().mockResolvedValue([]),
        // A corrida relê o pedido recém-gravado.
        findFirst: jest.fn().mockImplementation(async () => ({
          ...(await prisma.storeOrder.create.mock.results.at(-1)?.value),
          delivery: null,
        })),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      companyAddress: {
        findFirst: jest.fn().mockResolvedValue({ zip: '36980-000', state: 'MG' }),
      },
      $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation((fn: (tx: typeof prisma) => unknown) => fn(prisma));
    catalogo = {
      publicCatalog: jest.fn().mockResolvedValue({ categories: [], products: [ACAI, SUCO] }),
    };
    operacaoDaLoja = {
      publicOperation: jest.fn().mockResolvedValue(operacao()),
      tipoDeServicoDaCorrida: jest.fn().mockResolvedValue('6f1c1d52-8a0e-4b8e-9d1a-3c2b1a0f9e8d'),
    };
    entregas = { createFromStoreOrder: jest.fn().mockResolvedValue({ id: 'corrida-1' }) };
    avisos = { pedidoNovo: jest.fn(), etapaMudou: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StoreOrdersService,
        { provide: PrismaService, useValue: prisma },
        { provide: StoreCatalogService, useValue: catalogo },
        { provide: StoreOperationService, useValue: operacaoDaLoja },
        { provide: DeliveriesService, useValue: entregas },
        { provide: StoreOrderNotificationsService, useValue: avisos },
      ],
    }).compile();
    service = module.get(StoreOrdersService);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('calcula o preço pelo cardápio, a taxa pelo bairro, e numera em sequência', async () => {
    const feito = await service.checkout('acai', CLIENTE, pedido());

    expect(feito).toMatchObject({
      numero: 42,
      etapa: 'ACEITO',
      subtotal: 42.2,
      taxaDeEntrega: 6,
      total: 48.2,
      entregaPor: 'MOTOBOYCITY',
      entrega: { rua: 'Rua A', bairro: 'Centro' },
      itens: [
        {
          nome: 'Açaí',
          tamanho: '500ml',
          escolhas: ['Morango', 'Chocolate'],
          quantidade: 2,
          unitario: 21.1,
          total: 42.2,
        },
      ],
    });
    // No aceite automático, o "recebido" e o "aceito" ficam no histórico.
    expect(feito.historico.map((passo) => passo.etapa)).toEqual(['NOVO', 'ACEITO']);
    expect(prisma.storeOrder.create.mock.calls[0][0].data).toMatchObject({
      companyId: EMPRESA,
      customerAuthId: CLIENTE,
      acceptDeadline: null,
    });
  });

  it('loja que não ligou os pedidos recusa', async () => {
    prisma.storeSlug.findUnique.mockResolvedValue(lojaQueRecebe(false));
    await expect(service.checkout('acai', CLIENTE, pedido())).rejects.toMatchObject({
      response: { code: 'STORE_NOT_ACCEPTING_ORDERS' },
    });
    expect(prisma.storeOrder.create).not.toHaveBeenCalled();
  });

  it('fechada, recusa o pedido para agora — e aceita o agendado numa janela que vale', async () => {
    jest.setSystemTime(new Date('2026-09-23T20:00:00-03:00'));
    await expect(service.checkout('acai', CLIENTE, pedido())).rejects.toMatchObject({
      response: { code: 'STORE_CLOSED' },
    });

    // Amanhã às 12:00: aberta, e o preparo mais o caminho (35 min) cabem.
    const amanha = '2026-09-24T12:00:00-03:00';
    const agendado = await service.checkout('acai', CLIENTE, pedido({ agendadoPara: amanha }));
    expect(agendado.janela).toEqual({
      inicio: new Date(amanha).toISOString(),
      fim: new Date('2026-09-24T12:30:00-03:00').toISOString(),
    });

    await expect(
      service.checkout('acai', CLIENTE, pedido({ agendadoPara: '2026-09-24T12:07:00-03:00' })),
    ).rejects.toMatchObject({ response: { code: 'STORE_ORDER_SLOT_UNAVAILABLE' } });
  });

  it('tamanho ou escolha que acabou é recusado pelo nome', async () => {
    await expect(
      service.checkout(
        'acai',
        CLIENTE,
        pedido({
          itens: [{ produtoId: 'p1', tamanhoId: 't2', escolhas: ['c1'], quantidade: 1 }],
        }),
      ),
    ).rejects.toMatchObject({ response: { message: 'O tamanho 700ml de Açaí acabou.' } });
    await expect(
      service.checkout(
        'acai',
        CLIENTE,
        pedido({
          itens: [{ produtoId: 'p1', tamanhoId: 't1', escolhas: ['e2', 'c1'], quantidade: 1 }],
        }),
      ),
    ).rejects.toMatchObject({ response: { code: 'STORE_ORDER_ITEM_UNAVAILABLE' } });
  });

  it('grupo obrigatório sem escolha, e escolha de outro produto, são recusados', async () => {
    await expect(
      service.checkout(
        'acai',
        CLIENTE,
        pedido({ itens: [{ produtoId: 'p1', tamanhoId: 't1', escolhas: [], quantidade: 1 }] }),
      ),
    ).rejects.toMatchObject({
      response: { message: 'Em Açaí, escolha pelo menos 1 em "Calda".' },
    });
    await expect(
      service.checkout(
        'acai',
        CLIENTE,
        pedido({
          itens: [{ produtoId: 'p1', tamanhoId: 't1', escolhas: ['c1', 'x9'], quantidade: 1 }],
        }),
      ),
    ).rejects.toMatchObject({ response: { code: 'STORE_ORDER_ITEM_UNAVAILABLE' } });
  });

  it('se o total mudou desde a sacola, recusa dizendo o novo', async () => {
    await expect(
      service.checkout('acai', CLIENTE, pedido({ totalVisto: 45 })),
    ).rejects.toMatchObject({ response: { code: 'STORE_ORDER_TOTAL_CHANGED', total: 48.2 } });
  });

  it('bairro fora da lista, forma de pagamento que a loja não aceita e pedido abaixo do mínimo', async () => {
    const entrega = pedido().entrega!;
    await expect(
      service.checkout('acai', CLIENTE, pedido({ entrega: { ...entrega, bairroId: 'b9' } })),
    ).rejects.toMatchObject({ response: { code: 'STORE_ORDER_AREA_UNAVAILABLE' } });
    await expect(
      service.checkout('acai', CLIENTE, pedido({ pagamento: 'PIX_ONLINE' })),
    ).rejects.toMatchObject({ response: { code: 'STORE_ORDER_PAYMENT_UNAVAILABLE' } });
    await expect(
      service.checkout(
        'acai',
        CLIENTE,
        pedido({
          itens: [{ produtoId: 'p2', tamanhoId: null, escolhas: [], quantidade: 1 }],
          totalVisto: 13.2,
        }),
      ),
    ).rejects.toMatchObject({ response: { code: 'STORE_ORDER_BELOW_MINIMUM' } });
  });

  it('retirada não tem taxa nem mínimo, e o troco tem que cobrir o total', async () => {
    const retirada = operacao({ retirada: { ...operacao().retirada, ativa: true } });
    operacaoDaLoja.publicOperation.mockResolvedValue(retirada);
    const suco = [{ produtoId: 'p2', tamanhoId: null, escolhas: [], quantidade: 1 }];

    const feito = await service.checkout(
      'acai',
      CLIENTE,
      pedido({
        modalidade: 'RETIRADA',
        entrega: null,
        itens: suco,
        totalVisto: 7.2,
        trocoPara: 10,
      }),
    );
    expect(feito).toMatchObject({ taxaDeEntrega: 0, total: 7.2, entrega: null, entregaPor: null });

    await expect(
      service.checkout(
        'acai',
        CLIENTE,
        pedido({
          modalidade: 'RETIRADA',
          entrega: null,
          itens: suco,
          totalVisto: 7.2,
          trocoPara: 5,
        }),
      ),
    ).rejects.toMatchObject({ response: { code: 'STORE_ORDER_CHANGE_TOO_LOW' } });
  });

  it('no aceite automático, a corrida nasce junto, agendada para o fim do preparo', async () => {
    await service.checkout('acai', CLIENTE, pedido());

    const [empresa, chave, payload] = entregas.createFromStoreOrder.mock.calls[0]!;
    expect(empresa).toBe(EMPRESA);
    expect(chave).toBe('pedido-1:0');
    const preparo = OPERACAO_INICIAL.recebimento.minutosDePreparo;
    expect(payload).toMatchObject({
      externalOrderNumber: 'Loja #42',
      requiresReturn: true,
      scheduledAt: new Date(MEIO_DIA.getTime() + preparo * 60_000).toISOString(),
    });
    expect(prisma.storeOrder.updateMany).toHaveBeenCalledWith({
      where: { id: 'pedido-1', companyId: EMPRESA },
      data: { deliveryId: 'corrida-1', rideIssue: null },
    });
  });

  it('o pedido novo avisa a loja (e o cliente) pelo serviço de avisos', async () => {
    const feito = await service.checkout('acai', CLIENTE, pedido());
    expect(avisos.pedidoNovo).toHaveBeenCalledWith(EMPRESA, feito);
  });

  it('no aceite manual, o pedido espera como novo, com prazo para cair', async () => {
    const manual = operacao();
    manual.recebimento = { ...manual.recebimento, modo: 'MANUAL', prazoDoAceiteMin: 10 };
    operacaoDaLoja.publicOperation.mockResolvedValue(manual);

    const feito = await service.checkout('acai', CLIENTE, pedido());

    expect(feito.etapa).toBe('NOVO');
    // Sem aceite, sem corrida: ela nasce quando a loja aceitar.
    expect(entregas.createFromStoreOrder).not.toHaveBeenCalled();
    expect(prisma.storeOrder.create.mock.calls[0][0].data.acceptDeadline).toEqual(
      new Date(MEIO_DIA.getTime() + 10 * 60_000),
    );
  });

  it('dois pedidos com o mesmo número: o segundo tenta de novo', async () => {
    prisma.storeOrder.create.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('Unique constraint', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );
    const feito = await service.checkout('acai', CLIENTE, pedido());
    expect(feito.numero).toBe(42);
    expect(prisma.storeOrder.create).toHaveBeenCalledTimes(2);
  });

  it('cada cliente vê só os pedidos dele', async () => {
    prisma.storeSlug.findUnique.mockResolvedValue({ companyId: EMPRESA });
    await service.pedidosDoCliente('acai', CLIENTE);
    expect(prisma.storeOrder.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { companyId: EMPRESA, customerAuthId: CLIENTE } }),
    );
  });
});
