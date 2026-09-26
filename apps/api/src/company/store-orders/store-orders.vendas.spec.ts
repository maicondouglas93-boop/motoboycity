import { ConflictException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import type { User } from '@prisma/client';
import { Prisma, type DeliveryStatus, type StoreOrder } from '@prisma/client';
import { DeliveriesService } from '../../deliveries/deliveries.service';
import { AsaasProviderError } from '../../finance/asaas/asaas.client';
import { PrismaService } from '../../prisma/prisma.service';
import { StoreCatalogService } from '../store-catalog/store-catalog.service';
import {
  OPERACAO_INICIAL,
  StoreOperationService,
} from '../store-operation/store-operation.service';
import { StoreAsaasAccountService } from '../store-asaas/store-asaas-account.service';
import { StoreAsaasClient } from '../store-asaas/store-asaas.client';
import { StoreOrderNotificationsService } from './store-order-notifications.service';
import { StoreOrdersService } from './store-orders.service';

/**
 * O lado da loja: a fila de Vendas e o que a loja faz com cada pedido. Cada
 * mudança só grava se o pedido ainda estiver como foi lido. E a corrida do
 * MOTOboyCity: nasce no aceite, agendada para quando o pedido fica pronto, é
 * liberada no "Pronto", sai no cancelamento, e o pedido a acompanha.
 */

const EMPRESA = 'empresa-1';
const membro = { id: 'user-1', type: 'COMPANY_MEMBER' } as User;
const RECEBIDO = new Date('2026-09-23T15:00:00.000Z');
const AGORA = new Date(RECEBIDO.getTime() + 2 * 60_000);
const TIPO_DE_SERVICO = '6f1c1d52-8a0e-4b8e-9d1a-3c2b1a0f9e8d';

const ENDERECO = {
  rua: 'Rua A',
  numero: '10',
  complemento: null,
  bairro: 'Centro',
  cidade: 'Lajinha',
  estado: 'MG',
  cep: '',
  referencia: 'Portão azul',
};

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
    address: ENDERECO,
    items: [],
    subtotal: new Prisma.Decimal(40),
    deliveryFee: new Prisma.Decimal(5),
    total: new Prisma.Decimal(45),
    paymentMethod: 'DINHEIRO',
    changeFor: new Prisma.Decimal(50),
    note: null,
    cancelReason: null,
    cancelledBy: null,
    deliveryId: null,
    rideAttempt: 0,
    rideIssue: null,
    paymentStatus: null,
    paymentProviderId: null,
    paymentEnvironment: null,
    pixPayload: null,
    pixQrCode: null,
    paymentDueAt: null,
    paidAt: null,
    paymentIssue: null,
    paymentCheckedAt: null,
    createdAt: RECEBIDO,
    updatedAt: RECEBIDO,
    ...mudancas,
  };
}

interface CorridaFalsa {
  id: string;
  displayNumber: number;
  status: DeliveryStatus;
  scheduledAt: Date | null;
  failedAt: Date | null;
  driver: { user: { name: string } } | null;
}

function corrida(mudancas: Partial<CorridaFalsa> = {}): CorridaFalsa {
  return {
    id: 'corrida-1',
    displayNumber: 900,
    status: 'SCHEDULED',
    scheduledAt: new Date(AGORA.getTime() + 20 * 60_000),
    failedAt: null,
    driver: null,
    ...mudancas,
  };
}

describe('StoreOrdersService — Vendas', () => {
  let service: StoreOrdersService;
  /** O banco em memória: um pedido e, quando há, a corrida dele. */
  let banco: { pedido: StoreOrder; corrida: CorridaFalsa | null };
  let prisma: {
    storeOrder: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      findFirstOrThrow: jest.Mock;
      updateMany: jest.Mock;
    };
    companyAddress: { findFirst: jest.Mock };
  };
  let entregas: {
    createFromStoreOrder: jest.Mock;
    releaseScheduled: jest.Mock;
    cancelFromStoreOrder: jest.Mock;
  };
  let avisos: { pedidoNovo: jest.Mock; etapaMudou: jest.Mock };
  let contasAsaas: { webhookDaLoja: jest.Mock; contaParaCobrar: jest.Mock };
  let asaas: { cobranca: jest.Mock; apagarCobranca: jest.Mock; estornar: jest.Mock };

  const comCorrida = () => ({ ...banco.pedido, delivery: banco.corrida });

  beforeEach(async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
    jest.setSystemTime(AGORA);
    banco = { pedido: linha(), corrida: null };
    prisma = {
      storeOrder: {
        findMany: jest.fn().mockImplementation(() => Promise.resolve([comCorrida()])),
        findFirst: jest.fn().mockImplementation(() => Promise.resolve(comCorrida())),
        findFirstOrThrow: jest.fn().mockImplementation(() => Promise.resolve(comCorrida())),
        // Grava só se o pedido ainda estiver como foi lido, como o banco.
        updateMany: jest.fn().mockImplementation(({ where, data }) => {
          const { updatedAt, rideAttempt, paymentStatus } = where as {
            updatedAt?: Date;
            rideAttempt?: number;
            paymentStatus?: string | { in: string[] };
          };
          if (paymentStatus !== undefined) {
            const aceitas = typeof paymentStatus === 'string' ? [paymentStatus] : paymentStatus.in;
            if (!aceitas.includes(banco.pedido.paymentStatus ?? '')) {
              return Promise.resolve({ count: 0 });
            }
          }
          if (updatedAt && updatedAt.getTime() !== banco.pedido.updatedAt.getTime()) {
            return Promise.resolve({ count: 0 });
          }
          if (rideAttempt !== undefined && rideAttempt !== banco.pedido.rideAttempt) {
            return Promise.resolve({ count: 0 });
          }
          banco.pedido = { ...banco.pedido, ...data, updatedAt: new Date(Date.now() + 1) };
          return Promise.resolve({ count: 1 });
        }),
      },
      companyAddress: {
        findFirst: jest.fn().mockResolvedValue({ zip: '36980-000', state: 'MG' }),
      },
    };
    entregas = {
      createFromStoreOrder: jest.fn().mockImplementation(() => {
        banco.corrida = corrida();
        return Promise.resolve({ id: 'corrida-1' });
      }),
      releaseScheduled: jest.fn().mockImplementation(() => {
        if (banco.corrida) banco.corrida = { ...banco.corrida, status: 'AWAITING_DRIVER' };
        return Promise.resolve({});
      }),
      cancelFromStoreOrder: jest.fn().mockImplementation(() => {
        if (banco.corrida) banco.corrida = { ...banco.corrida, status: 'CANCELLED' };
        return Promise.resolve('CANCELLED');
      }),
    };

    avisos = { pedidoNovo: jest.fn(), etapaMudou: jest.fn() };
    contasAsaas = {
      webhookDaLoja: jest.fn((_empresa: string, token: string) =>
        Promise.resolve(token === 'token-da-loja'),
      ),
      contaParaCobrar: jest.fn().mockResolvedValue({
        credencial: { apiKey: 'chave', baseUrl: 'https://api-sandbox.asaas.com/v3' },
        ambiente: 'SANDBOX',
      }),
    };
    asaas = {
      cobranca: jest.fn().mockResolvedValue({ id: 'pay_1', status: 'PENDING' }),
      apagarCobranca: jest.fn().mockResolvedValue(undefined),
      estornar: jest.fn().mockResolvedValue({ id: 'pay_1', status: 'REFUNDED' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StoreOrdersService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: StoreCatalogService,
          useValue: { resolveCompanyId: jest.fn().mockResolvedValue(EMPRESA) },
        },
        {
          provide: StoreOperationService,
          useValue: {
            tipoDeServicoDaCorrida: jest.fn().mockResolvedValue(TIPO_DE_SERVICO),
            operacaoDaEmpresa: jest.fn().mockResolvedValue(OPERACAO_INICIAL),
          },
        },
        { provide: DeliveriesService, useValue: entregas },
        { provide: StoreAsaasAccountService, useValue: contasAsaas },
        { provide: StoreAsaasClient, useValue: asaas },
        { provide: StoreOrderNotificationsService, useValue: avisos },
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

  it('no aceite, a corrida nasce agendada para quando o pedido fica pronto', async () => {
    const aceito = await service.avancarEtapa(membro, 'pedido-1', {
      para: 'ACEITO',
      minutosDePreparo: 40,
    });

    const [empresa, chave, payload, nota] = entregas.createFromStoreOrder.mock.calls[0]!;
    expect(empresa).toBe(EMPRESA);
    expect(chave).toBe('pedido-1:0');
    expect(nota).toBe('Pedido #42 da loja online.');
    expect(payload).toMatchObject({
      serviceTypeId: TIPO_DE_SERVICO,
      destinationKnownAtCreation: true,
      // Sem CEP no pedido, vai o da loja.
      dropoffAddress: {
        street: 'Rua A',
        number: '10',
        city: 'Lajinha',
        state: 'MG',
        zip: '36980-000',
        referenceNote: 'Bairro Centro · Portão azul',
      },
      recipientName: 'Ana',
      recipientPhone: '33999887766',
      externalOrderNumber: 'Loja #42',
      customerPaymentMethod: 'CASH',
      // Pago na entrega, como no aiqfome: o motoboy volta com o dinheiro.
      requiresReturn: true,
      scheduledAt: new Date(AGORA.getTime() + 40 * 60_000).toISOString(),
    });
    expect(payload.driverNote).toBe(
      'Pagamento na entrega: dinheiro. Cobrar R$ 45,00. Troco para R$ 50,00.',
    );
    expect(banco.pedido.deliveryId).toBe('corrida-1');
    expect(aceito.corrida).toMatchObject({ numero: 900, situacao: 'AGENDADA' });
    expect(aceito.avisoDaCorrida).toBeNull();
  });

  it('a corrida que não nasce não desfaz o aceite: vira o aviso da corrida', async () => {
    entregas.createFromStoreOrder.mockRejectedValue(
      new ConflictException('O horário agendado está fora do horário de funcionamento.'),
    );

    const aceito = await service.avancarEtapa(membro, 'pedido-1', { para: 'ACEITO' });

    expect(aceito.etapa).toBe('ACEITO');
    expect(aceito.corrida).toBeNull();
    expect(aceito.avisoDaCorrida).toBe(
      'Não deu para chamar o motoboy: O horário agendado está fora do horário de funcionamento.',
    );
  });

  it('aceito, sem corrida e sem motivo gravado, ainda avisa — para a loja poder chamar', async () => {
    banco.pedido = linha({ stage: 'ACEITO', acceptDeadline: null });
    const [pedido] = await service.vendas(membro);
    expect(pedido!.avisoDaCorrida).toBe('O motoboy ainda não foi chamado para este pedido.');
  });

  it('pedido com entregador da loja e retirada não chamam corrida', async () => {
    banco.pedido = linha({ courier: 'LOJA' });
    await service.avancarEtapa(membro, 'pedido-1', { para: 'ACEITO' });
    banco.pedido = linha({ modality: 'RETIRADA', courier: null, address: null });
    await service.avancarEtapa(membro, 'pedido-1', { para: 'ACEITO' });
    expect(entregas.createFromStoreOrder).not.toHaveBeenCalled();
  });

  it('"Pronto" libera a corrida agendada; saída e entrega vêm da corrida, e não da loja', async () => {
    banco.pedido = linha({
      stage: 'EM_PREPARO',
      acceptDeadline: null,
      deliveryId: 'corrida-1',
      history: [
        { etapa: 'NOVO', em: RECEBIDO.toISOString() },
        { etapa: 'ACEITO', em: RECEBIDO.toISOString() },
        { etapa: 'EM_PREPARO', em: RECEBIDO.toISOString() },
      ],
    });
    banco.corrida = corrida();

    const pronto = await service.avancarEtapa(membro, 'pedido-1', { para: 'PRONTO' });

    expect(entregas.releaseScheduled).toHaveBeenCalledWith(membro, 'corrida-1');
    expect(pronto.corrida?.situacao).toBe('BUSCANDO_MOTOBOY');
    await expect(
      service.avancarEtapa(membro, 'pedido-1', { para: 'SAIU_PARA_ENTREGA' }),
    ).rejects.toMatchObject({ response: { code: 'STORE_ORDER_FOLLOWS_RIDE' } });
  });

  it('pedir a etapa em que o pedido já está não grava nada; pular etapa é recusado', async () => {
    banco.pedido = linha({ stage: 'ACEITO' });
    banco.corrida = null;
    await service.avancarEtapa(membro, 'pedido-1', { para: 'ACEITO' });
    expect(prisma.storeOrder.updateMany.mock.calls.some(([{ data }]) => 'stage' in data)).toBe(
      false,
    );

    await expect(
      service.avancarEtapa(membro, 'pedido-1', { para: 'PRONTO' }),
    ).rejects.toMatchObject({ response: { code: 'STORE_ORDER_STAGE_INVALID' } });
  });

  it('se outra aba mudou o pedido no meio, relê e decide de novo', async () => {
    // A primeira leitura vê o pedido novo; na hora de gravar, a outra aba já aceitou.
    prisma.storeOrder.findFirst.mockImplementationOnce(() => {
      const lido = comCorrida();
      banco.pedido = linha({ stage: 'ACEITO', updatedAt: new Date(AGORA.getTime() + 5) });
      return Promise.resolve(lido);
    });

    const pedido = await service.avancarEtapa(membro, 'pedido-1', { para: 'ACEITO' });

    expect(pedido.etapa).toBe('ACEITO');
    expect(
      prisma.storeOrder.updateMany.mock.calls.filter(([{ data }]) => 'stage' in data),
    ).toHaveLength(1);
  });

  it('cancelar grava o motivo e quem cancelou; depois de pronto, pelo MOTOboyCity, não dá', async () => {
    await service.cancelar(membro, 'pedido-1', 'Item em falta');
    expect(banco.pedido).toMatchObject({
      stage: 'CANCELADO',
      cancelReason: 'Item em falta',
      cancelledBy: 'LOJA',
    });

    banco.pedido = linha({ stage: 'PRONTO' });
    await expect(service.cancelar(membro, 'pedido-1', 'Tarde demais')).rejects.toMatchObject({
      response: { code: 'STORE_ORDER_STAGE_INVALID' },
    });
  });

  it('cancelar tira a corrida junto; com o motoboy já a caminho, é com a central', async () => {
    banco.pedido = linha({ stage: 'EM_PREPARO', deliveryId: 'corrida-1' });
    banco.corrida = corrida();
    await service.cancelar(membro, 'pedido-1', 'Cliente desistiu');
    expect(entregas.cancelFromStoreOrder).toHaveBeenCalledWith(
      EMPRESA,
      'corrida-1',
      'Pedido #42 da loja online cancelado pela loja: Cliente desistiu',
    );
    expect(banco.pedido.stage).toBe('CANCELADO');

    banco.pedido = linha({ stage: 'EM_PREPARO', deliveryId: 'corrida-1' });
    banco.corrida = corrida({ status: 'ACCEPTED' });
    entregas.cancelFromStoreOrder.mockResolvedValue('REVIEW');
    await expect(service.cancelar(membro, 'pedido-1', 'Tarde')).rejects.toMatchObject({
      response: { code: 'STORE_ORDER_RIDE_ASSIGNED' },
    });
    expect(banco.pedido.stage).toBe('EM_PREPARO');
  });

  it('o pedido do entregador da loja passa para o MOTOboyCity, e pronto já busca motoboy', async () => {
    banco.pedido = linha({ stage: 'PRONTO', courier: 'LOJA' });
    await service.chamarMotoboy(membro, 'pedido-1');
    expect(prisma.storeOrder.updateMany.mock.calls[0]![0].data).toEqual({
      courier: 'MOTOBOYCITY',
    });
    const [, , payload] = entregas.createFromStoreOrder.mock.calls[0]!;
    expect(payload.scheduledAt).toBeUndefined();
  });

  it('a fila acompanha a corrida: coletada, o pedido saiu — mesmo sem o "Pronto" marcado', async () => {
    banco.pedido = linha({
      stage: 'EM_PREPARO',
      deliveryId: 'corrida-1',
      history: [
        { etapa: 'NOVO', em: RECEBIDO.toISOString() },
        { etapa: 'ACEITO', em: RECEBIDO.toISOString() },
        { etapa: 'EM_PREPARO', em: RECEBIDO.toISOString() },
      ],
    });
    banco.corrida = corrida({ status: 'COLLECTED', driver: { user: { name: 'João Silva' } } });

    const [pedido] = await service.vendas(membro);

    expect(pedido!.etapa).toBe('SAIU_PARA_ENTREGA');
    expect(pedido!.historico.map((passo) => passo.etapa)).toEqual([
      'NOVO',
      'ACEITO',
      'EM_PREPARO',
      'PRONTO',
      'SAIU_PARA_ENTREGA',
    ]);
    expect(pedido!.corrida).toMatchObject({ situacao: 'COLETADA', motoboy: 'João' });
  });

  it('corrida cancelada pela central: aviso, chamar de novo com tentativa nova, ou entregar com a loja', async () => {
    banco.pedido = linha({ stage: 'EM_PREPARO', deliveryId: 'corrida-1' });
    banco.corrida = corrida({ status: 'CANCELLED' });

    const [antes] = await service.vendas(membro);
    expect(antes!.avisoDaCorrida).toMatch(/A central cancelou a corrida/);

    await service.chamarDeNovo(membro, 'pedido-1');
    expect(entregas.createFromStoreOrder.mock.calls[0]![1]).toBe('pedido-1:1');
    await expect(service.chamarDeNovo(membro, 'pedido-1')).rejects.toMatchObject({
      response: { code: 'STORE_ORDER_RIDE_EXISTS' },
    });

    banco.corrida = corrida({ status: 'CANCELLED' });
    const comALoja = await service.entregarComALoja(membro, 'pedido-1');
    expect(comALoja.entregaPor).toBe('LOJA');
    expect(comALoja.avisoDaCorrida).toBeNull();
  });

  it('quem muda a etapa avisa, com o antes e o depois', async () => {
    await service.avancarEtapa(membro, 'pedido-1', { para: 'ACEITO' });
    const [empresa, antes, depois] = avisos.etapaMudou.mock.calls[0]!;
    expect(empresa).toBe(EMPRESA);
    expect(antes.etapa).toBe('NOVO');
    expect(depois.etapa).toBe('ACEITO');
  });

  it('a varredura de minuto cai o prazo vencido e acompanha a corrida, sem ninguém olhar', async () => {
    jest.setSystemTime(new Date(RECEBIDO.getTime() + 11 * 60_000));
    prisma.storeOrder.findMany
      // Pix vencidos e estornos parados (nenhum); as empresas com prazo
      // vencido; os vencidos dela; as corridas que andaram.
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ companyId: EMPRESA }])
      .mockResolvedValueOnce([{ id: 'pedido-1' }])
      .mockResolvedValueOnce([]);

    await service.varrer();

    expect(banco.pedido).toMatchObject({ stage: 'CANCELADO', cancelledBy: 'SISTEMA' });
    expect(avisos.etapaMudou).toHaveBeenCalledTimes(1);
  });

  describe('Pix online', () => {
    const AGUARDANDO = () =>
      linha({
        stage: 'AGUARDANDO_PAGAMENTO',
        history: [{ etapa: 'AGUARDANDO_PAGAMENTO', em: RECEBIDO.toISOString() }],
        acceptDeadline: null,
        paymentMethod: 'PIX_ONLINE',
        changeFor: null,
        paymentStatus: 'AGUARDANDO',
        paymentProviderId: 'pay_1',
        paymentEnvironment: 'SANDBOX',
        pixPayload: '0002012658',
        pixQrCode: 'iVBOR',
        paymentDueAt: new Date(RECEBIDO.getTime() + 15 * 60_000),
      });
    const avisoPago = (valor = 45) => ({
      id: 'evt_1',
      event: 'PAYMENT_RECEIVED',
      payment: {
        id: 'pay_1',
        customer: 'cus_1',
        value: valor,
        status: 'RECEIVED',
        billingType: 'PIX',
        externalReference: 'pedido-1',
      },
    });

    it('o aviso do Asaas com o token errado é recusado', async () => {
      banco.pedido = AGUARDANDO();
      await expect(
        service.receberWebhook(EMPRESA, 'outro-token', avisoPago()),
      ).rejects.toMatchObject({ status: 401 });
      expect(banco.pedido.stage).toBe('AGUARDANDO_PAGAMENTO');
    });

    it('pago, o pedido entra na loja — aceito no automático, com a corrida e o aviso', async () => {
      banco.pedido = AGUARDANDO();

      await service.receberWebhook(EMPRESA, 'token-da-loja', avisoPago());

      expect(banco.pedido).toMatchObject({
        stage: 'ACEITO',
        paymentStatus: 'PAGO',
        pixPayload: null,
        pixQrCode: null,
      });
      expect(
        (banco.pedido.history as Array<{ etapa: string }>).map((passo) => passo.etapa),
      ).toEqual(['AGUARDANDO_PAGAMENTO', 'NOVO', 'ACEITO']);
      expect(entregas.createFromStoreOrder).toHaveBeenCalled();
      const [, antes, depois] = avisos.etapaMudou.mock.calls[0]!;
      expect([antes.etapa, depois.etapa]).toEqual(['AGUARDANDO_PAGAMENTO', 'ACEITO']);

      // O mesmo aviso de novo não anda o pedido de novo.
      await service.receberWebhook(EMPRESA, 'token-da-loja', avisoPago());
      expect(avisos.etapaMudou).toHaveBeenCalledTimes(1);
    });

    it('o aviso cujo valor não confere com o pedido é ignorado', async () => {
      banco.pedido = AGUARDANDO();
      await service.receberWebhook(EMPRESA, 'token-da-loja', avisoPago(1));
      expect(banco.pedido.stage).toBe('AGUARDANDO_PAGAMENTO');
    });

    it('vencido sem pagar, a cobrança some do Asaas e o pedido cai sem a loja ver', async () => {
      banco.pedido = AGUARDANDO();
      jest.setSystemTime(new Date(RECEBIDO.getTime() + 16 * 60_000));
      prisma.storeOrder.findMany
        .mockResolvedValueOnce([{ id: 'pedido-1', companyId: EMPRESA }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      await service.varrer();

      expect(asaas.apagarCobranca).toHaveBeenCalledWith(expect.anything(), 'pay_1');
      expect(banco.pedido).toMatchObject({
        stage: 'CANCELADO',
        cancelledBy: 'SISTEMA',
        cancelReason: 'O Pix não foi pago a tempo',
        paymentStatus: 'NAO_PAGO',
        pixPayload: null,
      });
    });

    it('pago e cancelado pela loja, o dinheiro volta inteiro', async () => {
      banco.pedido = linha({
        paymentMethod: 'PIX_ONLINE',
        paymentStatus: 'PAGO',
        paymentProviderId: 'pay_1',
        paymentEnvironment: 'SANDBOX',
        changeFor: null,
      });
      asaas.cobranca.mockResolvedValue({ id: 'pay_1', status: 'RECEIVED' });

      const cancelado = await service.cancelar(membro, 'pedido-1', 'Item em falta');

      expect(asaas.estornar).toHaveBeenCalledWith(expect.anything(), 'pay_1', 'Item em falta');
      expect(banco.pedido.paymentStatus).toBe('ESTORNADO');
      expect(cancelado.pagamentoOnline?.situacao).toBe('ESTORNADO');
    });

    it('estorno recusado fica com o motivo em Vendas; o que já foi pedido não se pede de novo', async () => {
      banco.pedido = linha({
        paymentMethod: 'PIX_ONLINE',
        paymentStatus: 'PAGO',
        paymentProviderId: 'pay_1',
        paymentEnvironment: 'SANDBOX',
        changeFor: null,
      });
      asaas.cobranca.mockResolvedValue({ id: 'pay_1', status: 'RECEIVED' });
      asaas.estornar.mockRejectedValueOnce(
        new AsaasProviderError('REFUND_PAYMENT', 'REQUEST_REJECTED', 400),
      );

      const cancelado = await service.cancelar(membro, 'pedido-1', 'Item em falta');

      expect(banco.pedido.paymentStatus).toBe('ESTORNO_FALHOU');
      expect(cancelado.pagamentoOnline?.aviso).toMatch(/confira se há saldo/);

      // Na nova tentativa, o Asaas já diz que o estorno foi pedido: não pede de novo.
      asaas.cobranca.mockResolvedValue({ id: 'pay_1', status: 'REFUND_REQUESTED' });
      jest.setSystemTime(new Date(AGORA.getTime() + 16 * 60_000));
      prisma.storeOrder.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          { id: 'pedido-1', companyId: EMPRESA, cancelReason: 'Item em falta' },
        ])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);
      await service.varrer();
      expect(asaas.estornar).toHaveBeenCalledTimes(1);
      expect(banco.pedido).toMatchObject({ paymentStatus: 'ESTORNANDO', paymentIssue: null });
    });

    it('o Pix pago depois de o pedido cair volta inteiro, sozinho', async () => {
      banco.pedido = { ...AGUARDANDO(), stage: 'CANCELADO', paymentStatus: 'NAO_PAGO' };
      asaas.cobranca.mockResolvedValue({ id: 'pay_1', status: 'RECEIVED' });

      await service.receberWebhook(EMPRESA, 'token-da-loja', avisoPago());

      expect(asaas.estornar).toHaveBeenCalledWith(
        expect.anything(),
        'pay_1',
        'O Pix chegou depois de o pedido ser cancelado.',
      );
      expect(banco.pedido.paymentStatus).toBe('ESTORNADO');
    });
  });

  it('a fila cancela, pelo sistema, o pedido que passou do prazo do aceite', async () => {
    jest.setSystemTime(new Date(RECEBIDO.getTime() + 11 * 60_000));
    prisma.storeOrder.findMany.mockResolvedValueOnce([{ id: 'pedido-1' }]);

    await service.vendas(membro);

    expect(banco.pedido).toMatchObject({
      stage: 'CANCELADO',
      cancelledBy: 'SISTEMA',
      cancelReason: 'A loja não confirmou a tempo',
    });
  });
});
