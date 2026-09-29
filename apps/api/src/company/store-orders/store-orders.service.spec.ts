import { ConflictException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import type { OperacaoPublica, PublicStoreProduct } from '@motoboycity/types';
import type { CupomPublico, PromocaoPublica } from '@motoboycity/types';
import { crc16, type StoreCheckoutPayload } from '@motoboycity/validation';
import { Prisma } from '@prisma/client';
import { DeliveriesService } from '../../deliveries/deliveries.service';
import { PrismaService } from '../../prisma/prisma.service';
import { StoreCatalogService } from '../store-catalog/store-catalog.service';
import {
  StoreCouponsService,
  type CupomDoServidor,
} from '../store-marketing/store-coupons.service';
import { StoreMarketingService } from '../store-marketing/store-marketing.service';
import {
  OPERACAO_INICIAL,
  StoreOperationService,
} from '../store-operation/store-operation.service';
import { StoreAsaasAccountService } from '../store-asaas/store-asaas-account.service';
import { StoreAsaasClient } from '../store-asaas/store-asaas.client';
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
    storeSettings: { findUnique: jest.Mock };
    $transaction: jest.Mock;
    $executeRaw: jest.Mock;
    storeCouponRedemption: { count: jest.Mock; create: jest.Mock };
  };
  let catalogo: { publicCatalog: jest.Mock };
  let operacaoDaLoja: {
    publicOperation: jest.Mock;
    operacaoDaEmpresa: jest.Mock;
    tipoDeServicoDaCorrida: jest.Mock;
  };
  let entregas: { createFromStoreOrder: jest.Mock };
  let contasAsaas: { recebePix: jest.Mock; contaParaCobrar: jest.Mock };
  let asaas: {
    clienteDoCpf: jest.Mock;
    criarCobrancaPix: jest.Mock;
    qrCodePix: jest.Mock;
    apagarCobranca: jest.Mock;
  };
  let avisos: { pedidoNovo: jest.Mock; etapaMudou: jest.Mock };
  let marketing: { promocoesDoPedido: jest.Mock };
  let cupons: { paraOPedido: jest.Mock; disponiveis: jest.Mock };

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
            paymentStatus: null,
            paymentProviderId: null,
            paymentEnvironment: null,
            pixPayload: null,
            pixQrCode: null,
            paymentDueAt: null,
            paidAt: null,
            paymentIssue: null,
            paymentCheckedAt: null,
            couponCode: null,
            ...data,
            address: data.address === Prisma.DbNull ? null : data.address,
            subtotal: new Prisma.Decimal(data.subtotal),
            deliveryFee: new Prisma.Decimal(data.deliveryFee),
            total: new Prisma.Decimal(data.total),
            couponDiscount: new Prisma.Decimal(data.couponDiscount ?? 0),
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
      storeSettings: { findUnique: jest.fn().mockResolvedValue({ name: 'Açaí do Zé' }) },
      $transaction: jest.fn(),
      // O uso da promoção e do cupom: uma linha alterada quando ainda há uso.
      $executeRaw: jest.fn().mockResolvedValue(1),
      // O uso do cupom por este cliente, e o registro que o pedido cria.
      storeCouponRedemption: {
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockResolvedValue({}),
      },
    };
    prisma.$transaction.mockImplementation((fn: (tx: typeof prisma) => unknown) => fn(prisma));
    catalogo = {
      publicCatalog: jest.fn().mockResolvedValue({ categories: [], products: [ACAI, SUCO] }),
    };
    operacaoDaLoja = {
      publicOperation: jest.fn().mockResolvedValue(operacao()),
      // A operação inteira, com a chave Pix que a página pública não recebe.
      operacaoDaEmpresa: jest.fn().mockResolvedValue({ pixDireto: null }),
      tipoDeServicoDaCorrida: jest.fn().mockResolvedValue('6f1c1d52-8a0e-4b8e-9d1a-3c2b1a0f9e8d'),
    };
    entregas = { createFromStoreOrder: jest.fn().mockResolvedValue({ id: 'corrida-1' }) };
    contasAsaas = {
      recebePix: jest.fn().mockResolvedValue(true),
      contaParaCobrar: jest.fn().mockResolvedValue({
        credencial: { apiKey: 'chave', baseUrl: 'https://api-sandbox.asaas.com/v3' },
        ambiente: 'SANDBOX',
      }),
    };
    asaas = {
      clienteDoCpf: jest.fn().mockResolvedValue('cus_1'),
      criarCobrancaPix: jest.fn().mockResolvedValue({
        id: 'pay_1',
        customer: 'cus_1',
        value: 48.2,
        status: 'PENDING',
        billingType: 'PIX',
      }),
      qrCodePix: jest.fn().mockResolvedValue({
        encodedImage: 'iVBORw0KGgo',
        payload: '00020126580014br.gov.bcb.pix',
        expirationDate: '2026-09-23 23:59:59',
      }),
      apagarCobranca: jest.fn().mockResolvedValue(undefined),
    };
    avisos = { pedidoNovo: jest.fn(), etapaMudou: jest.fn() };
    marketing = { promocoesDoPedido: jest.fn().mockResolvedValue([]) };
    cupons = { paraOPedido: jest.fn(), disponiveis: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StoreOrdersService,
        { provide: PrismaService, useValue: prisma },
        { provide: StoreCatalogService, useValue: catalogo },
        { provide: StoreOperationService, useValue: operacaoDaLoja },
        { provide: DeliveriesService, useValue: entregas },
        { provide: StoreAsaasAccountService, useValue: contasAsaas },
        { provide: StoreAsaasClient, useValue: asaas },
        // Sem promoção por padrão: os testes de sempre são de preço cheio.
        { provide: StoreMarketingService, useValue: marketing },
        // Sem cupom por padrão: só os testes do cupom o configuram.
        { provide: StoreCouponsService, useValue: cupons },
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
          // Cada escolha com o grupo do cardápio de onde veio, na ordem dele.
          grupos: [
            { grupo: 'Adicionais', opcoes: ['Morango'] },
            { grupo: 'Calda', opcoes: ['Chocolate'] },
          ],
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

  it('o grupo em que o cliente não marcou nada não entra no pedido', async () => {
    const feito = await service.checkout(
      'acai',
      CLIENTE,
      pedido({
        itens: [{ produtoId: 'p1', tamanhoId: 't1', escolhas: ['c1'], quantidade: 1 }],
        totalVisto: 24.1,
      }),
    );

    expect(feito.itens[0]).toMatchObject({
      escolhas: ['Chocolate'],
      grupos: [{ grupo: 'Calda', opcoes: ['Chocolate'] }],
    });

    const suco = await service.checkout(
      'acai',
      CLIENTE,
      pedido({
        // Dois sucos, para passar do pedido mínimo: 14,40 mais 6 de entrega.
        itens: [{ produtoId: 'p2', tamanhoId: null, escolhas: [], quantidade: 2 }],
        totalVisto: 20.4,
      }),
    );
    expect(suco.itens[0]).toMatchObject({ escolhas: [], grupos: [] });
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
    const { id } = prisma.storeOrder.create.mock.calls[0][0].data;
    expect(chave).toBe(`${id}:0`);
    const preparo = OPERACAO_INICIAL.recebimento.minutosDePreparo;
    expect(payload).toMatchObject({
      externalOrderNumber: 'Loja #42',
      requiresReturn: true,
      scheduledAt: new Date(MEIO_DIA.getTime() + preparo * 60_000).toISOString(),
    });
    expect(prisma.storeOrder.updateMany).toHaveBeenCalledWith({
      where: { id, companyId: EMPRESA },
      data: { deliveryId: 'corrida-1', rideIssue: null },
    });
  });

  it('Pix online: nasce aguardando o pagamento, com o QR, sem corrida e sem aviso à loja', async () => {
    operacaoDaLoja.publicOperation.mockResolvedValue(
      operacao({ pagamentos: ['DINHEIRO', 'PIX_ONLINE'] }),
    );

    const feito = await service.checkout(
      'acai',
      CLIENTE,
      pedido({ pagamento: 'PIX_ONLINE', cpf: '52998224725' }),
    );

    expect(feito.etapa).toBe('AGUARDANDO_PAGAMENTO');
    expect(feito.pagamentoOnline).toMatchObject({
      situacao: 'AGUARDANDO',
      pixCopiaECola: '00020126580014br.gov.bcb.pix',
      qrCode: 'iVBORw0KGgo',
      expiraEm: new Date(MEIO_DIA.getTime() + 15 * 60_000).toISOString(),
    });
    const { data } = prisma.storeOrder.create.mock.calls[0][0];
    expect(asaas.clienteDoCpf).toHaveBeenCalledWith(expect.anything(), {
      nome: 'Ana',
      cpf: '52998224725',
      telefone: '33999887766',
      referencia: CLIENTE,
    });
    expect(asaas.criarCobrancaPix).toHaveBeenCalledWith(expect.anything(), {
      customer: 'cus_1',
      value: 48.2,
      dueDate: '2026-09-23',
      description: 'Pedido na Açaí do Zé',
      externalReference: data.id,
    });
    expect(data).toMatchObject({ acceptDeadline: null, paymentProviderId: 'pay_1' });
    // O CPF vai ao Asaas e não fica no pedido.
    expect(JSON.stringify(data)).not.toContain('52998224725');
    expect(entregas.createFromStoreOrder).not.toHaveBeenCalled();
    expect(avisos.pedidoNovo).not.toHaveBeenCalled();
  });

  it('Pix sem a conta ligada é recusado; se o Asaas falha, nenhum pedido fica pela metade', async () => {
    operacaoDaLoja.publicOperation.mockResolvedValue(
      operacao({ pagamentos: ['DINHEIRO', 'PIX_ONLINE'] }),
    );
    contasAsaas.recebePix.mockResolvedValueOnce(false);
    await expect(
      service.checkout('acai', CLIENTE, pedido({ pagamento: 'PIX_ONLINE', cpf: '52998224725' })),
    ).rejects.toMatchObject({ response: { code: 'STORE_ORDER_PAYMENT_UNAVAILABLE' } });

    asaas.qrCodePix.mockRejectedValueOnce(new Error('fora do ar'));
    await expect(
      service.checkout('acai', CLIENTE, pedido({ pagamento: 'PIX_ONLINE', cpf: '52998224725' })),
    ).rejects.toMatchObject({ response: { code: 'STORE_ORDER_PIX_FAILED' } });
    // A cobrança criada antes da falha é apagada, e o pedido nem chega a existir.
    expect(asaas.apagarCobranca).toHaveBeenCalledWith(expect.anything(), 'pay_1');
    expect(prisma.storeOrder.create).not.toHaveBeenCalled();
  });

  describe('Pix direto (na chave da loja, sem gateway)', () => {
    const CHAVE_DA_LOJA = {
      tipoDeChave: 'CELULAR',
      chave: '(33) 99988-7766',
      nomeDoRecebedor: 'Lanches do Ze',
      cidade: 'Lajinha',
      whatsapp: '33988776655',
    };

    beforeEach(() => {
      operacaoDaLoja.publicOperation.mockResolvedValue(
        operacao({ pagamentos: ['DINHEIRO', 'PIX_DIRETO'] }),
      );
      operacaoDaLoja.operacaoDaEmpresa.mockResolvedValue({ pixDireto: CHAVE_DA_LOJA });
    });

    const pedirComPixDireto = () =>
      service.checkout('acai', CLIENTE, pedido({ pagamento: 'PIX_DIRETO' }));

    it('o pedido aparece na hora, com o Pix a conferir: aceito, com corrida, avisando a loja', async () => {
      const feito = await pedirComPixDireto();

      // Nada de "aguardando pagamento": a loja vê o pedido já, e decide.
      expect(feito.etapa).toBe('ACEITO');
      expect(feito.pixDireto).toMatchObject({ situacao: 'AGUARDANDO', confirmadoEm: null });
      expect(feito.pagamentoOnline).toBeNull();
      expect(avisos.pedidoNovo).toHaveBeenCalledTimes(1);
      expect(entregas.createFromStoreOrder).toHaveBeenCalledTimes(1);
      // Nenhuma cobrança no Asaas, e nem o CPF é pedido.
      expect(asaas.criarCobrancaPix).not.toHaveBeenCalled();
      expect(asaas.clienteDoCpf).not.toHaveBeenCalled();
    });

    it('o código do Pix leva o valor do pedido, o número dele e a chave da loja', async () => {
      const feito = await pedirComPixDireto();
      const codigo = feito.pixDireto!.copiaECola!;

      expect(codigo).toContain('br.gov.bcb.pix0114+5533999887766');
      expect(codigo).toContain('5405' + '48.20');
      expect(codigo).toContain('0508PEDIDO42');
      expect(codigo).toContain('LANCHES DO ZE');
      // O CRC final é o do que vem antes dele: um byte trocado e o banco recusa.
      expect(codigo.slice(-4)).toBe(crc16(codigo.slice(0, -4)));
      // É o mesmo que foi gravado no pedido, sem passar pelo Asaas.
      const { data } = prisma.storeOrder.create.mock.calls[0][0];
      expect(data).toMatchObject({ paymentMethod: 'PIX_DIRETO', pixPayload: codigo });
      expect(data.paymentStatus).toBeUndefined();
      expect(data.paidAt).toBeUndefined();
    });

    it('o cliente recebe o WhatsApp da loja, com o DDI, para mandar o comprovante', async () => {
      const feito = await pedirComPixDireto();

      expect(feito.pixDireto?.whatsapp).toBe('5533988776655');
    });

    it('o motoboy não cobra nada na porta e não volta à loja com dinheiro', async () => {
      await pedirComPixDireto();

      const [, , payload] = entregas.createFromStoreOrder.mock.calls[0]!;
      expect(payload).toMatchObject({ customerPaymentMethod: 'PREPAID', requiresReturn: false });
      expect(payload.driverNote).toContain(
        'Pago por Pix direto para a loja. NÃO cobrar do cliente.',
      );
    });

    it('a loja sem a chave (apagada depois de o cliente abrir a página) recusa o pedido', async () => {
      operacaoDaLoja.operacaoDaEmpresa.mockResolvedValue({ pixDireto: null });

      await expect(pedirComPixDireto()).rejects.toMatchObject({
        response: { code: 'STORE_ORDER_PAYMENT_UNAVAILABLE' },
      });
      expect(prisma.storeOrder.create).not.toHaveBeenCalled();
    });

    it('a forma que a página não oferece (loja sem a chave) é recusada pela lista pública', async () => {
      operacaoDaLoja.publicOperation.mockResolvedValue(operacao({ pagamentos: ['DINHEIRO'] }));

      await expect(pedirComPixDireto()).rejects.toMatchObject({
        response: { code: 'STORE_ORDER_PAYMENT_UNAVAILABLE' },
      });
    });

    it('em "Meus pedidos" o cliente vê o código e o WhatsApp; confirmado ou cancelado, o código some', async () => {
      await pedirComPixDireto();
      prisma.storeSlug.findUnique.mockResolvedValue({ companyId: EMPRESA });
      const linha = {
        ...(await prisma.storeOrder.create.mock.results.at(-1)!.value),
        delivery: null,
      };
      const dele = (mudancas: object) =>
        prisma.storeOrder.findMany.mockResolvedValue([{ ...linha, ...mudancas }]);

      dele({});
      const [aguardando] = await service.pedidosDoCliente('acai', CLIENTE);
      expect(aguardando!.pixDireto).toMatchObject({
        situacao: 'AGUARDANDO',
        copiaECola: linha.pixPayload,
        whatsapp: '5533988776655',
      });

      dele({ paidAt: new Date('2026-09-23T15:20:00.000Z') });
      const [confirmado] = await service.pedidosDoCliente('acai', CLIENTE);
      expect(confirmado!.pixDireto).toMatchObject({
        situacao: 'CONFIRMADO',
        copiaECola: null,
        confirmadoEm: '2026-09-23T15:20:00.000Z',
      });

      dele({ stage: 'CANCELADO' });
      const [cancelado] = await service.pedidosDoCliente('acai', CLIENTE);
      expect(cancelado!.pixDireto).toMatchObject({ situacao: 'AGUARDANDO', copiaECola: null });
    });

    it('quem não tem pedido de Pix direto não faz a consulta da configuração', async () => {
      prisma.storeSlug.findUnique.mockResolvedValue({ companyId: EMPRESA });
      prisma.storeOrder.findMany.mockResolvedValue([]);

      await service.pedidosDoCliente('acai', CLIENTE);

      expect(operacaoDaLoja.operacaoDaEmpresa).not.toHaveBeenCalled();
    });
  });

  describe('promoções no pedido', () => {
    /** 20% OFF no açaí (p1). */
    function promo(
      mudancas: Partial<PromocaoPublica> & { usos?: number; limiteDeUsos?: number | null } = {},
    ) {
      return {
        id: 'promo-1',
        nome: 'Açaí 20% OFF',
        tipo: 'PERCENTUAL',
        alvo: 'PRODUTO',
        produtoId: 'p1',
        categoriaId: null,
        percentual: 20,
        precoPromocional: null,
        leve: null,
        pague: null,
        inicio: null,
        fim: null,
        horaInicio: null,
        horaFim: null,
        diasDaSemana: [],
        usos: 0,
        limiteDeUsos: null,
        ...mudancas,
      } as PromocaoPublica & { usos: number; limiteDeUsos: number | null };
    }
    /** Açaí 500ml com morango e chocolate, 2 unidades: 42,20 sem promoção. */
    const comPromocao = (mudancas: Partial<StoreCheckoutPayload> = {}) =>
      service.checkout('acai', CLIENTE, pedido({ totalVisto: 41, ...mudancas }));

    it('o preço do produto baixa, o dos adicionais não, e a linha guarda o que custaria', async () => {
      marketing.promocoesDoPedido.mockResolvedValue([promo()]);

      const feito = await comPromocao();

      // 2 x (18,00 - 20%) + os adicionais cheios (3,10 x 2) = 35,00.
      expect(feito).toMatchObject({ subtotal: 35, taxaDeEntrega: 6, total: 41 });
      expect(feito.itens[0]).toMatchObject({
        unitario: 21.1,
        total: 35,
        totalOriginal: 42.2,
        promocao: { id: 'promo-1', nome: 'Açaí 20% OFF', desconto: 7.2, rotulo: '20% OFF' },
      });
      const { data } = prisma.storeOrder.create.mock.calls[0][0];
      expect(data).toMatchObject({ subtotal: 35, total: 41 });
    });

    it('o servidor recusa o total sem promoção que a página mostrou antes, e diz o novo', async () => {
      marketing.promocoesDoPedido.mockResolvedValue([promo()]);

      await expect(comPromocao({ totalVisto: 48.2 })).rejects.toMatchObject({
        response: { code: 'STORE_ORDER_TOTAL_CHANGED', total: 41 },
      });
      expect(prisma.storeOrder.create).not.toHaveBeenCalled();
    });

    it('sem promoção que sirva, o pedido é de preço cheio e nenhum uso é contado', async () => {
      marketing.promocoesDoPedido.mockResolvedValue([
        promo({ produtoId: 'p2' }),
        promo({ id: 'vencida', fim: '2026-09-01' }),
      ]);

      const feito = await service.checkout('acai', CLIENTE, pedido());

      expect(feito.total).toBe(48.2);
      expect(feito.itens[0]).not.toHaveProperty('promocao');
      expect(feito.itens[0]).not.toHaveProperty('totalOriginal');
      expect(prisma.$executeRaw).not.toHaveBeenCalled();
    });

    it('não acumula: duas promoções no mesmo produto, vale a de maior desconto, e só ela é usada', async () => {
      marketing.promocoesDoPedido.mockResolvedValue([
        promo({ id: 'dez', percentual: 10 }),
        promo({ id: 'trinta', percentual: 30, nome: 'Açaí 30%' }),
      ]);

      // 2 x (18,00 - 30%) + 6,20 de adicionais = 31,40 + 6 de entrega.
      const feito = await comPromocao({ totalVisto: 37.4 });

      expect(feito.itens[0]!.promocao).toMatchObject({ id: 'trinta', desconto: 10.8 });
      expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
    });

    it('cada promoção usada conta um uso, dentro da transação do pedido', async () => {
      marketing.promocoesDoPedido.mockResolvedValue([promo()]);

      await comPromocao();

      expect(prisma.$transaction).toHaveBeenCalled();
      expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
      // A conta leva o id da promoção e a empresa: uma loja não gasta uso da outra.
      const [, promocaoId, empresa] = prisma.$executeRaw.mock.calls[0]!;
      expect(promocaoId).toBe('promo-1');
      expect(empresa).toBe(EMPRESA);
    });

    it('a promoção que acabou entre a página e o pedido recusa, e nenhum pedido é gravado', async () => {
      marketing.promocoesDoPedido.mockResolvedValue([promo({ limiteDeUsos: 5, usos: 4 })]);
      // Outro pedido levou o último uso no meio: o UPDATE condicional não acha linha.
      prisma.$executeRaw.mockResolvedValue(0);

      await expect(comPromocao()).rejects.toMatchObject({
        response: { code: 'STORE_PROMOTION_EXHAUSTED' },
      });
      expect(prisma.storeOrder.create).not.toHaveBeenCalled();
      expect(entregas.createFromStoreOrder).not.toHaveBeenCalled();
      expect(avisos.pedidoNovo).not.toHaveBeenCalled();
    });

    it('o pedido mínimo conta o que o cliente paga pelos itens, já com a promoção', async () => {
      const comMinimo = operacao();
      comMinimo.entrega = { ...comMinimo.entrega, pedidoMinimo: 40 };
      operacaoDaLoja.publicOperation.mockResolvedValue(comMinimo);

      // Sem promoção, 42,20 passa dos R$ 40; com ela, 35,00 não passa.
      await expect(service.checkout('acai', CLIENTE, pedido())).resolves.toBeDefined();
      marketing.promocoesDoPedido.mockResolvedValue([promo()]);
      await expect(comPromocao()).rejects.toMatchObject({
        response: { code: 'STORE_ORDER_BELOW_MINIMUM' },
      });
    });

    it('leve 3, pague 2 no pedido: a unidade grátis sai do total', async () => {
      marketing.promocoesDoPedido.mockResolvedValue([
        promo({ tipo: 'LEVE_PAGUE', percentual: null, leve: 3, pague: 2, nome: 'Leve 3' }),
      ]);
      const tres = [{ produtoId: 'p1', tamanhoId: 't1', escolhas: ['c1'], quantidade: 3 }];

      // 3 x 18,10 = 54,30, menos uma unidade de 18,00 (o produto, sem o adicional).
      const feito = await service.checkout(
        'acai',
        CLIENTE,
        pedido({ itens: tres, totalVisto: 42.3 }),
      );

      expect(feito.subtotal).toBe(36.3);
      expect(feito.itens[0]).toMatchObject({
        total: 36.3,
        totalOriginal: 54.3,
        promocao: { rotulo: 'Leve 3, pague 2', desconto: 18 },
      });
    });
  });

  describe('cupom no pedido', () => {
    /** 10% em tudo, sem limites: o cupom mais simples. */
    function cupom(mudancas: Partial<CupomDoServidor> = {}): CupomDoServidor {
      return {
        id: 'cupom-1',
        codigo: 'BEMVINDO10',
        tipo: 'PERCENTUAL',
        percentual: 10,
        valor: null,
        pedidoMinimo: null,
        descontoMaximo: null,
        valeEmPromocao: false,
        produtoIds: [],
        categoriaIds: [],
        usos: 0,
        limiteDeUsos: null,
        limitePorCliente: null,
        ...mudancas,
      };
    }
    /** Açaí 20% OFF: o item de 21,10 passa a custar 17,50 mais adicionais. */
    const promocaoDoAcai: PromocaoPublica = {
      id: 'promo-1',
      nome: 'Açaí 20% OFF',
      tipo: 'PERCENTUAL',
      alvo: 'PRODUTO',
      produtoId: 'p1',
      categoriaId: null,
      percentual: 20,
      precoPromocional: null,
      leve: null,
      pague: null,
      inicio: null,
      fim: null,
      horaInicio: null,
      horaFim: null,
      diasDaSemana: [],
    };
    const comCupom = (mudancas: Partial<StoreCheckoutPayload> = {}) =>
      service.checkout('acai', CLIENTE, pedido({ cupom: 'bemvindo10', ...mudancas }));

    it('desconta o cupom dos itens, deixa a taxa cheia e guarda o cupom no pedido', async () => {
      cupons.paraOPedido.mockResolvedValue(cupom());

      // 42,20 de itens; 10% = 4,22; mais 6,00 de entrega = 43,98.
      const feito = await comCupom({ totalVisto: 43.98 });

      expect(feito).toMatchObject({
        subtotal: 42.2,
        taxaDeEntrega: 6,
        total: 43.98,
        cupom: { codigo: 'BEMVINDO10', desconto: 4.22 },
      });
      expect(cupons.paraOPedido).toHaveBeenCalledWith(EMPRESA, CLIENTE, 'bemvindo10', MEIO_DIA);
      const { data } = prisma.storeOrder.create.mock.calls[0][0];
      expect(data).toMatchObject({
        subtotal: 42.2,
        total: 43.98,
        couponCode: 'BEMVINDO10',
        couponDiscount: 4.22,
      });
    });

    it('o uso é contado na transação do pedido, com o registro de quem usou', async () => {
      cupons.paraOPedido.mockResolvedValue(cupom({ limitePorCliente: 2 }));

      await comCupom({ totalVisto: 43.98 });

      expect(prisma.$transaction).toHaveBeenCalled();
      // A conta leva o id do cupom e a empresa: uma loja não gasta uso de outra.
      const [, cupomId, empresa] = prisma.$executeRaw.mock.calls[0]!;
      expect(cupomId).toBe('cupom-1');
      expect(empresa).toBe(EMPRESA);
      expect(prisma.storeCouponRedemption.count).toHaveBeenCalledWith({
        where: { couponId: 'cupom-1', customerAuthId: CLIENTE },
      });
      // O registro do uso é o do pedido gravado: mesmo id, mesmo cliente.
      const { data } = prisma.storeOrder.create.mock.calls[0][0];
      expect(prisma.storeCouponRedemption.create).toHaveBeenCalledWith({
        data: { couponId: 'cupom-1', orderId: data.id, customerAuthId: CLIENTE },
      });
    });

    it('recusa o total sem cupom que a página mostrou antes, e diz o total novo', async () => {
      cupons.paraOPedido.mockResolvedValue(cupom());

      await expect(comCupom({ totalVisto: 48.2 })).rejects.toMatchObject({
        response: { code: 'STORE_ORDER_TOTAL_CHANGED', total: 43.98 },
      });
      expect(prisma.storeOrder.create).not.toHaveBeenCalled();
      expect(prisma.storeCouponRedemption.create).not.toHaveBeenCalled();
    });

    it('pedido sem cupom não consulta cupom nenhum, nem conta uso', async () => {
      await service.checkout('acai', CLIENTE, pedido());

      expect(cupons.paraOPedido).not.toHaveBeenCalled();
      expect(prisma.$executeRaw).not.toHaveBeenCalled();
      expect(prisma.storeCouponRedemption.create).not.toHaveBeenCalled();
      expect(prisma.storeOrder.create.mock.calls[0][0].data).toMatchObject({
        couponCode: null,
        couponDiscount: 0,
      });
    });

    it('o cupom recusado pelo que é do cupom (vencido, sem uso, do outro cliente) não deixa pedido', async () => {
      cupons.paraOPedido.mockRejectedValue(
        new ConflictException({
          message: 'Este cupom venceu em 01/09/2026.',
          code: 'STORE_COUPON_EXPIRED',
        }),
      );

      await expect(comCupom()).rejects.toMatchObject({
        response: { code: 'STORE_COUPON_EXPIRED', message: 'Este cupom venceu em 01/09/2026.' },
      });
      expect(prisma.storeOrder.create).not.toHaveBeenCalled();
      expect(entregas.createFromStoreOrder).not.toHaveBeenCalled();
    });

    describe('junto das promoções', () => {
      it('o item em promoção fica fora do cupom, e ele diz por quê', async () => {
        marketing.promocoesDoPedido.mockResolvedValue([promocaoDoAcai]);
        cupons.paraOPedido.mockResolvedValue(cupom());

        await expect(comCupom({ totalVisto: 41 })).rejects.toMatchObject({
          response: {
            code: 'STORE_COUPON_NO_ELIGIBLE_ITEMS',
            message: 'Os itens da sua sacola já estão em promoção, e este cupom não vale junto.',
          },
        });
        expect(prisma.storeOrder.create).not.toHaveBeenCalled();
      });

      it('só o item sem promoção recebe o cupom', async () => {
        marketing.promocoesDoPedido.mockResolvedValue([promocaoDoAcai]);
        cupons.paraOPedido.mockResolvedValue(cupom());
        const comSuco = pedido({
          itens: [
            { produtoId: 'p1', tamanhoId: 't1', escolhas: ['e1', 'c1'], quantidade: 2 },
            { produtoId: 'p2', tamanhoId: null, escolhas: [], quantidade: 1 },
          ],
          cupom: 'BEMVINDO10',
          // Açaí 2 x (14,40 + 3,10) = 35,00; suco 7,20; itens 42,20; cupom 10% de 7,20 = 0,72; entrega 6,00.
          totalVisto: 47.48,
        });

        const feito = await service.checkout('acai', CLIENTE, comSuco);

        expect(feito).toMatchObject({ subtotal: 42.2, cupom: { desconto: 0.72 }, total: 47.48 });
      });

      it('com "vale em promoção", o cupom desconta sobre o que o cliente já paga', async () => {
        marketing.promocoesDoPedido.mockResolvedValue([promocaoDoAcai]);
        cupons.paraOPedido.mockResolvedValue(cupom({ valeEmPromocao: true }));

        // Itens 35,00 com a promoção; 10% = 3,50; mais 6,00 de entrega = 37,50.
        const feito = await comCupom({ totalVisto: 37.5 });

        expect(feito).toMatchObject({ subtotal: 35, cupom: { desconto: 3.5 }, total: 37.5 });
      });
    });

    describe('o que depende da sacola', () => {
      it('o pedido mínimo do cupom conta os itens e diz quanto falta', async () => {
        cupons.paraOPedido.mockResolvedValue(cupom({ pedidoMinimo: 50 }));

        await expect(comCupom()).rejects.toMatchObject({
          response: {
            code: 'STORE_COUPON_BELOW_MINIMUM',
            message: 'Faltam R$ 7,80 em itens para usar este cupom (pedido mínimo de R$ 50,00).',
          },
        });
      });

      it('um cupom que não alcança nenhum item da sacola é recusado', async () => {
        cupons.paraOPedido.mockResolvedValue(cupom({ produtoIds: ['p2'] }));

        await expect(comCupom()).rejects.toMatchObject({
          response: {
            code: 'STORE_COUPON_NO_ELIGIBLE_ITEMS',
            message: 'Este cupom não vale para os itens da sua sacola.',
          },
        });
      });

      it('o pedido mínimo da LOJA conta antes do cupom: o cupom não tira o pedido do mínimo', async () => {
        const comMinimo = operacao();
        comMinimo.entrega = { ...comMinimo.entrega, pedidoMinimo: 40 };
        operacaoDaLoja.publicOperation.mockResolvedValue(comMinimo);
        // 42,20 passam dos 40 da loja; o cupom de R$ 5,00 leva os itens a 37,20, e tudo bem.
        cupons.paraOPedido.mockResolvedValue(cupom({ tipo: 'VALOR', percentual: null, valor: 5 }));

        const feito = await comCupom({ totalVisto: 43.2 });

        expect(feito.total).toBe(43.2);
      });
    });

    describe('as disputas na hora de gravar', () => {
      it('o último uso levado por outro pedido: recusa, e nada é gravado', async () => {
        cupons.paraOPedido.mockResolvedValue(cupom({ limiteDeUsos: 5, usos: 4 }));
        // Outro pedido levou o último uso no meio: o UPDATE condicional não acha linha.
        prisma.$executeRaw.mockResolvedValue(0);

        await expect(comCupom({ totalVisto: 43.98 })).rejects.toMatchObject({
          response: { code: 'STORE_COUPON_UNAVAILABLE' },
        });
        expect(prisma.storeOrder.create).not.toHaveBeenCalled();
        expect(prisma.storeCouponRedemption.create).not.toHaveBeenCalled();
        expect(entregas.createFromStoreOrder).not.toHaveBeenCalled();
        expect(avisos.pedidoNovo).not.toHaveBeenCalled();
      });

      it('o limite por cliente fechado por outro pedido do mesmo cliente: recusa', async () => {
        cupons.paraOPedido.mockResolvedValue(cupom({ limitePorCliente: 1 }));
        // Na leitura ele ainda não tinha usado; na gravação, o outro pedido já aparece.
        prisma.storeCouponRedemption.count.mockResolvedValue(1);

        await expect(comCupom({ totalVisto: 43.98 })).rejects.toMatchObject({
          response: { code: 'STORE_COUPON_CUSTOMER_LIMIT' },
        });
        expect(prisma.storeOrder.create).not.toHaveBeenCalled();
        expect(prisma.storeCouponRedemption.create).not.toHaveBeenCalled();
      });

      it('a cobrança do Pix online sai com o total já com o cupom, e cai se o cupom é recusado', async () => {
        operacaoDaLoja.publicOperation.mockResolvedValue(
          operacao({ pagamentos: ['DINHEIRO', 'PIX_ONLINE'] }),
        );
        cupons.paraOPedido.mockResolvedValue(cupom());

        await comCupom({ pagamento: 'PIX_ONLINE', cpf: '52998224725', totalVisto: 43.98 });
        expect(asaas.criarCobrancaPix).toHaveBeenCalledWith(
          expect.anything(),
          expect.objectContaining({ value: 43.98 }),
        );

        // O uso acabou entre a leitura e a gravação: a cobrança criada é apagada.
        prisma.$executeRaw.mockResolvedValue(0);
        await expect(
          comCupom({ pagamento: 'PIX_ONLINE', cpf: '52998224725', totalVisto: 43.98 }),
        ).rejects.toMatchObject({ response: { code: 'STORE_COUPON_UNAVAILABLE' } });
        expect(asaas.apagarCobranca).toHaveBeenCalledTimes(1);
      });
    });

    describe('a lista "Cupons" do checkout', () => {
      it('lista os cupons da loja para este cliente, na hora de agora', async () => {
        const disponivel = { ...cupom(), fim: null };
        cupons.disponiveis.mockResolvedValue([disponivel]);

        await expect(service.cuponsDisponiveis('acai', CLIENTE)).resolves.toEqual([disponivel]);
        expect(cupons.disponiveis).toHaveBeenCalledWith(EMPRESA, CLIENTE, MEIO_DIA);
      });

      it('loja que não recebe pedido, ou que não existe, não lista nada', async () => {
        prisma.storeSlug.findUnique.mockResolvedValue(lojaQueRecebe(false));
        await expect(service.cuponsDisponiveis('acai', CLIENTE)).rejects.toMatchObject({
          response: { code: 'STORE_NOT_ACCEPTING_ORDERS' },
        });

        prisma.storeSlug.findUnique.mockResolvedValue(null);
        await expect(service.cuponsDisponiveis('nao-existe', CLIENTE)).rejects.toMatchObject({
          response: { code: 'STORE_NOT_FOUND' },
        });
        expect(cupons.disponiveis).not.toHaveBeenCalled();
      });
    });

    describe('aplicar cupom (a conferência da sacola)', () => {
      const sacola = {
        cupom: 'bemvindo10',
        itens: [{ produtoId: 'p1', tamanhoId: 't1', escolhas: ['e1', 'c1'], quantidade: 2 }],
      };

      it('devolve as regras do cupom, sem o que é só da loja, e o desconto de agora', async () => {
        cupons.paraOPedido.mockResolvedValue(
          cupom({ usos: 7, limiteDeUsos: 50, limitePorCliente: 1 }),
        );

        const conferencia = await service.conferirCupomDaSacola('acai', CLIENTE, sacola);

        expect(conferencia.desconto).toBe(4.22);
        const publico: CupomPublico = conferencia.cupom;
        expect(publico).toEqual({
          codigo: 'BEMVINDO10',
          tipo: 'PERCENTUAL',
          percentual: 10,
          valor: null,
          pedidoMinimo: null,
          descontoMaximo: null,
          valeEmPromocao: false,
          produtoIds: [],
          categoriaIds: [],
        });
        // Nada é gravado: o uso só conta quando o pedido é feito.
        expect(prisma.$executeRaw).not.toHaveBeenCalled();
        expect(prisma.storeOrder.create).not.toHaveBeenCalled();
      });

      it('recusa com o motivo, pelo cupom ou pela sacola', async () => {
        cupons.paraOPedido.mockResolvedValue(cupom({ pedidoMinimo: 50 }));

        await expect(service.conferirCupomDaSacola('acai', CLIENTE, sacola)).rejects.toMatchObject({
          response: { code: 'STORE_COUPON_BELOW_MINIMUM' },
        });
      });

      it('não conferiu com loja que não recebe pedido, nem com item que saiu do cardápio', async () => {
        prisma.storeSlug.findUnique.mockResolvedValue(lojaQueRecebe(false));
        await expect(service.conferirCupomDaSacola('acai', CLIENTE, sacola)).rejects.toMatchObject({
          response: { code: 'STORE_NOT_ACCEPTING_ORDERS' },
        });

        prisma.storeSlug.findUnique.mockResolvedValue(lojaQueRecebe());
        await expect(
          service.conferirCupomDaSacola('acai', CLIENTE, {
            cupom: 'bemvindo10',
            itens: [{ produtoId: 'sumiu', tamanhoId: null, escolhas: [], quantidade: 1 }],
          }),
        ).rejects.toMatchObject({ response: { code: 'STORE_ORDER_ITEM_UNAVAILABLE' } });
      });
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
