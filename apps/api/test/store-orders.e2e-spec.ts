import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerStorage } from '@nestjs/throttler';
import request from 'supertest';
import type { App } from 'supertest/types';
import type {
  OperacaoDaLoja,
  PedidoDaLoja,
  PublicStoreLookup,
  StoreProduct,
} from '@motoboycity/types';
import { AppModule } from '../src/app.module';
import { VerificadorDoCliente } from '../src/company/store-orders/cliente-da-loja.guard';
import { randomBytes } from 'node:crypto';
import { StoreAsaasClient } from '../src/company/store-asaas/store-asaas.client';
import { StoreOrdersService } from '../src/company/store-orders/store-orders.service';
import { GoogleMapsService } from '../src/maps/google-maps.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { WebPushService, type AvisoDePush } from '../src/web-push/web-push.service';

/**
 * O pedido da página da loja, contra o banco de verdade: o cliente logado faz o
 * pedido, o servidor calcula o preço e numera, e cada cliente vê só os dele. E
 * a corrida do MOTOboyCity que nasce do pedido aceito.
 *
 * O login do Firebase é simulado: "cliente-a" e "cliente-b" são dois tokens
 * válidos. O Google também: a distância é sempre 5 km. E o envio do Web Push:
 * os avisos ficam numa lista, sem rede e sem chaves.
 */

/**
 * O Asaas das lojas, simulado: guarda as cobranças numa lista, e o teste diz
 * quando uma foi paga. O token do webhook criado fica aqui para o teste mandar
 * o aviso como o Asaas mandaria.
 */
const asaasDeTeste = {
  webhook: null as { url: string; authToken: string } | null,
  cobrancas: new Map<string, { status: string; value: number; externalReference: string }>(),
  estornadas: [] as string[],
  apagadas: [] as string[],
  dadosComerciais: () =>
    Promise.resolve({ name: 'Dono', tradingName: 'Pedido E2E', email: 'financeiro@e2e.com' }),
  temChavePixAtiva: () => Promise.resolve(true),
  criarWebhook: (_conta: unknown, dados: { url: string; authToken: string }) => {
    asaasDeTeste.webhook = dados;
    return Promise.resolve('wh_e2e');
  },
  apagarWebhook: () => Promise.resolve(),
  clienteDoCpf: () => Promise.resolve('cus_e2e'),
  criarCobrancaPix: (_conta: unknown, cobranca: { value: number; externalReference: string }) => {
    const id = `pay_${asaasDeTeste.cobrancas.size + 1}`;
    asaasDeTeste.cobrancas.set(id, { status: 'PENDING', ...cobranca });
    return Promise.resolve({
      id,
      customer: 'cus_e2e',
      status: 'PENDING',
      billingType: 'PIX',
      ...cobranca,
    });
  },
  qrCodePix: () =>
    Promise.resolve({
      encodedImage: 'iVBORw0KGgo',
      payload: '00020126pix',
      expirationDate: '2026-12-31 23:59:59',
    }),
  cobranca: (_conta: unknown, id: string) => {
    const cobranca = asaasDeTeste.cobrancas.get(id)!;
    return Promise.resolve({ id, customer: 'cus_e2e', billingType: 'PIX', ...cobranca });
  },
  apagarCobranca: (_conta: unknown, id: string) => {
    asaasDeTeste.apagadas.push(id);
    return Promise.resolve();
  },
  estornar: (_conta: unknown, id: string) => {
    asaasDeTeste.estornadas.push(id);
    const cobranca = asaasDeTeste.cobrancas.get(id)!;
    cobranca.status = 'REFUNDED';
    return Promise.resolve({ id, customer: 'cus_e2e', billingType: 'PIX', ...cobranca });
  },
};

/** Cada aviso que teria saído, com os endereços de quem o receberia. */
const avisosEnviados: Array<{ para: string[]; aviso: AvisoDePush }> = [];
const pushDeTeste = {
  onModuleInit: () => undefined,
  disponivel: () => true,
  chavePublica: () => 'chave-publica-e2e',
  enviar: (inscricoes: Array<{ endpoint: string }>, aviso: AvisoDePush) => {
    if (inscricoes.length > 0) {
      avisosEnviados.push({ para: inscricoes.map((item) => item.endpoint), aviso });
    }
    return Promise.resolve();
  },
};

const suffix = String(Date.now()).slice(-8);
const password = 'senhaSegura123';
const empresa = {
  email: `pedido.${suffix}@example.com`,
  document: `502${suffix}`.slice(0, 11),
  tradeName: 'Pedido E2E',
};
const link = `pedido-${suffix}`;

/** O dia inteiro, todo dia: o teste não depende da hora em que roda. */
const SEMPRE_ABERTA = [0, 1, 2, 3, 4, 5, 6].map((dia) => ({
  dia,
  faixas: [{ abre: '00:00', fecha: '00:00' }],
}));

describe('Pedido da loja online (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let token = '';
  let regiaoCriada: string | null = null;
  let tipoCriado: string | null = null;
  let produtoId = '';

  const comoEmpresa = () => ({ Authorization: `Bearer ${token}` });
  const comoCliente = (quem: string) => ({ Authorization: `Bearer ${quem}` });

  beforeAll(async () => {
    // A chave que cifra as contas Asaas das lojas: descartável, só deste teste.
    process.env['STORE_ASAAS_ENCRYPTION_KEY'] = randomBytes(32).toString('base64');
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(VerificadorDoCliente)
      .useValue({
        disponivel: () => true,
        verificar: (recebido: string) =>
          Promise.resolve(
            recebido === 'cliente-a' ? 'user_a' : recebido === 'cliente-b' ? 'user_b' : null,
          ),
      })
      .overrideProvider(GoogleMapsService)
      .useValue({
        getDistance: async () => ({ distanceKm: 5, durationMinutes: 20 }),
        geocode: async () => null,
        reverseGeocode: async () => null,
      })
      .overrideProvider(WebPushService)
      .useValue(pushDeTeste)
      .overrideProvider(StoreAsaasClient)
      .useValue(asaasDeTeste)
      .compile();
    app = module.createNestApplication();
    prisma = module.get(PrismaService);
    await app.init();

    if (!(await prisma.region.findFirst({ where: { active: true } }))) {
      regiaoCriada = (await prisma.region.create({ data: { name: `Região E2E ${suffix}` } })).id;
    }
    await request(app.getHttpServer())
      .post('/auth/register/company')
      .send({
        name: empresa.tradeName,
        email: empresa.email,
        phone: '33999887766',
        document: empresa.document,
        legalName: `${empresa.tradeName} LTDA`,
        tradeName: empresa.tradeName,
        password,
      });
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: empresa.email, password });
    token = login.body.accessToken as string;
  });

  afterAll(async () => {
    // As corridas e o endereço de coleta não saem em cascata com a empresa.
    const corridas = await prisma.delivery.findMany({
      where: { company: { document: empresa.document } },
      select: { id: true },
    });
    const ids = corridas.map((corrida) => corrida.id);
    await prisma.deliveryOffer.deleteMany({ where: { deliveryId: { in: ids } } });
    await prisma.deliveryStatusHistory.deleteMany({ where: { deliveryId: { in: ids } } });
    await prisma.deliveryAddress.deleteMany({ where: { deliveryId: { in: ids } } });
    await prisma.delivery.deleteMany({ where: { id: { in: ids } } });
    if (tipoCriado) {
      await prisma.pricingTable.deleteMany({ where: { serviceTypeId: tipoCriado } });
      await prisma.serviceType.deleteMany({ where: { id: tipoCriado } });
    }
    await prisma.companyAddress.deleteMany({ where: { company: { document: empresa.document } } });
    await prisma.companyTeamMember.deleteMany({ where: { user: { email: empresa.email } } });
    // Pedidos, cardápio, operação e link saem junto com a empresa, em cascata.
    await prisma.company.deleteMany({ where: { document: empresa.document } });
    await prisma.user.deleteMany({ where: { email: empresa.email } });
    if (regiaoCriada) await prisma.region.delete({ where: { id: regiaoCriada } });
    await app.close();
  });

  it('o cliente pede, o servidor calcula e numera, e cada um vê os seus', async () => {
    const servidor = app.getHttpServer();

    // A loja: link, um produto publicado, horário, bairro e pagamento.
    await request(servidor)
      .put('/company/store/settings/link')
      .set(comoEmpresa())
      .send({ slug: link, name: 'Pedido' })
      .expect(200);
    const secao = await request(servidor)
      .post('/company/store/categories')
      .set(comoEmpresa())
      .send({ name: 'Lanches' })
      .expect(201);
    const lanche = await request(servidor)
      .post('/company/store/products')
      .set(comoEmpresa())
      .send({
        categoryId: secao.body.id,
        name: 'X-Burger',
        description: '',
        price: 22.5,
        status: 'PUBLISHED',
        sizes: [],
        optionGroups: [],
      })
      .expect(201);
    const produto = lanche.body as StoreProduct;
    produtoId = produto.id;
    await request(servidor)
      .put('/company/store/operation/schedule')
      .set(comoEmpresa())
      .send({ semana: SEMPRE_ABERTA, excecoes: [], mensagemFechada: '' })
      .expect(200);
    await request(servidor)
      .put('/company/store/operation/delivery-areas')
      .set(comoEmpresa())
      .send({ bairros: [{ id: 'b1', nome: 'Centro', taxa: 5 }] })
      .expect(200);
    await prisma.company.update({
      where: { document: empresa.document },
      data: { status: 'ACTIVE' },
    });

    const novoPedido = {
      modalidade: 'ENTREGA',
      itens: [{ produtoId: produto.id, tamanhoId: null, escolhas: [], quantidade: 2 }],
      agendadoPara: null,
      cliente: { nome: 'Ana', telefone: '(33) 99988-7766' },
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
      trocoPara: 100,
      observacao: 'Sem cebola',
      totalVisto: 50,
    };

    // Sem conta, não pede; loja que não ligou os pedidos, também não.
    await request(servidor).post(`/public/stores/${link}/orders`).send(novoPedido).expect(401);
    const desligada = await request(servidor)
      .post(`/public/stores/${link}/orders`)
      .set(comoCliente('cliente-a'))
      .send(novoPedido)
      .expect(409);
    expect(desligada.body.code).toBe('STORE_NOT_ACCEPTING_ORDERS');

    await request(servidor)
      .put('/company/store/settings/accepts-orders')
      .set(comoEmpresa())
      .send({ recebePedidos: true })
      .expect(200);
    const vitrine = await request(servidor).get(`/public/stores/${link}`).expect(200);
    expect(
      (vitrine.body as Extract<PublicStoreLookup, { kind: 'store' }>).store.recebePedidos,
    ).toBe(true);

    const primeiro = await request(servidor)
      .post(`/public/stores/${link}/orders`)
      .set(comoCliente('cliente-a'))
      .send(novoPedido)
      .expect(201);
    expect(primeiro.body as PedidoDaLoja).toMatchObject({
      numero: 1,
      etapa: 'ACEITO',
      subtotal: 45,
      taxaDeEntrega: 5,
      total: 50,
      trocoPara: 100,
      cliente: { nome: 'Ana', telefone: '33999887766' },
      entrega: { bairro: 'Centro' },
      observacao: 'Sem cebola',
    });

    // O preço mudou no painel com a sacola aberta: o total visto não vale mais.
    await prisma.storeProduct.update({ where: { id: produto.id }, data: { price: 25 } });
    const mudou = await request(servidor)
      .post(`/public/stores/${link}/orders`)
      .set(comoCliente('cliente-b'))
      .send(novoPedido)
      .expect(409);
    expect(mudou.body).toMatchObject({ code: 'STORE_ORDER_TOTAL_CHANGED', total: 55 });

    const segundo = await request(servidor)
      .post(`/public/stores/${link}/orders`)
      .set(comoCliente('cliente-b'))
      .send({ ...novoPedido, totalVisto: 55 })
      .expect(201);
    expect((segundo.body as PedidoDaLoja).numero).toBe(2);

    const deA = await request(servidor)
      .get(`/public/stores/${link}/orders`)
      .set(comoCliente('cliente-a'))
      .expect(200);
    expect((deA.body as PedidoDaLoja[]).map((pedido) => pedido.numero)).toEqual([1]);
    const deB = await request(servidor)
      .get(`/public/stores/${link}/orders`)
      .set(comoCliente('cliente-b'))
      .expect(200);
    expect((deB.body as PedidoDaLoja[]).map((pedido) => pedido.numero)).toEqual([2]);

    // A loja: a fila de Vendas, e o pedido andando.
    const fila = await request(servidor)
      .get('/company/store/orders')
      .set(comoEmpresa())
      .expect(200);
    const doisPedidos = fila.body as PedidoDaLoja[];
    expect(doisPedidos.map((pedido) => pedido.numero)).toEqual([2, 1]);
    const primeiroPedido = doisPedidos[1]!;

    const emPreparo = await request(servidor)
      .put(`/company/store/orders/${primeiroPedido.id}/stage`)
      .set(comoEmpresa())
      .send({ para: 'EM_PREPARO' })
      .expect(200);
    expect((emPreparo.body as PedidoDaLoja).etapa).toBe('EM_PREPARO');
    // Pular etapa é recusado.
    await request(servidor)
      .put(`/company/store/orders/${primeiroPedido.id}/stage`)
      .set(comoEmpresa())
      .send({ para: 'ENTREGUE' })
      .expect(409);
    const cancelado = await request(servidor)
      .post(`/company/store/orders/${doisPedidos[0]!.id}/cancel`)
      .set(comoEmpresa())
      .send({ motivo: 'Item em falta' })
      .expect(201);
    expect(cancelado.body as PedidoDaLoja).toMatchObject({
      etapa: 'CANCELADO',
      cancelamento: { motivo: 'Item em falta', por: 'LOJA' },
    });

    // O cliente vê o cancelamento, com o motivo.
    const vistoPorB = await request(servidor)
      .get(`/public/stores/${link}/orders`)
      .set(comoCliente('cliente-b'))
      .expect(200);
    expect((vistoPorB.body as PedidoDaLoja[])[0]!.etapa).toBe('CANCELADO');
  });

  it('a corrida nasce do pedido aceito, busca motoboy no "Pronto", e o pedido a acompanha', async () => {
    const servidor = app.getHttpServer();
    const naLoja = await prisma.company.findUniqueOrThrow({
      where: { document: empresa.document },
    });

    // O que a corrida precisa: endereço de coleta, tipo de serviço e preço.
    const endereco = await request(servidor)
      .put('/company/address')
      .set(comoEmpresa())
      .send({ street: 'Rua da Loja', number: '1', city: 'Lajinha', state: 'MG', zip: '36980000' });
    expect(endereco.status).toBeLessThan(300);
    const tipo = await prisma.serviceType.create({
      data: { code: `LOJA_E2E_${suffix}`, name: 'Moto da loja E2E' },
    });
    tipoCriado = tipo.id;
    await prisma.pricingTable.create({
      data: {
        regionId: naLoja.regionId,
        serviceTypeId: tipo.id,
        companyId: naLoja.id,
        baseFee: 5,
        perKmFee: 1,
        returnFee: 3,
        // Tabela da empresa, com a divisão nela: o teste não mexe na configuração global.
        driverCommissionPercentage: 80,
      },
    });

    // Aceite manual, para ver a corrida nascer no aceite; e o tipo de serviço.
    const atual = (await request(servidor).get('/company/store/operation').set(comoEmpresa()))
      .body as OperacaoDaLoja;
    await request(servidor)
      .put('/company/store/operation/order-types')
      .set(comoEmpresa())
      .send({
        recebimento: { ...atual.recebimento, modo: 'MANUAL', prazoDoAceiteMin: null },
        entrega: { ...atual.entrega, quemEntrega: 'MOTOBOYCITY', tipoDeServicoId: tipo.id },
        retirada: atual.retirada,
        agendamento: atual.agendamento,
      })
      .expect(200);

    const pedir = async () =>
      (
        await request(servidor)
          .post(`/public/stores/${link}/orders`)
          .set(comoCliente('cliente-a'))
          .send({
            modalidade: 'ENTREGA',
            itens: [{ produtoId, tamanhoId: null, escolhas: [], quantidade: 2 }],
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
            // O primeiro teste deixou o X-Burger a 25: 2 x 25 + 5 de entrega.
            totalVisto: 55,
          })
          .expect(201)
      ).body as PedidoDaLoja;
    const etapa = async (id: string, para: string, minutosDePreparo?: number) =>
      request(servidor)
        .put(`/company/store/orders/${id}/stage`)
        .set(comoEmpresa())
        .send({ para, ...(minutosDePreparo ? { minutosDePreparo } : {}) });
    const naFila = async (id: string) =>
      (
        (await request(servidor).get('/company/store/orders').set(comoEmpresa()).expect(200))
          .body as PedidoDaLoja[]
      ).find((pedido) => pedido.id === id)!;

    // Novo: ainda sem corrida.
    const feito = await pedir();
    expect(feito.etapa).toBe('NOVO');
    expect(
      (await prisma.storeOrder.findUniqueOrThrow({ where: { id: feito.id } })).deliveryId,
    ).toBeNull();

    // Aceito com 30 minutos de preparo: a corrida nasce agendada para o fim dele.
    const aceito = (await etapa(feito.id, 'ACEITO', 30)).body as PedidoDaLoja;
    expect(aceito.avisoDaCorrida).toBeNull();
    expect(aceito.corrida).toMatchObject({ situacao: 'AGENDADA' });
    const corrida = await prisma.delivery.findFirstOrThrow({
      where: { storeOrder: { id: feito.id } },
      include: { addresses: true, statusHistory: true },
    });
    expect(corrida).toMatchObject({
      status: 'SCHEDULED',
      serviceTypeId: tipo.id,
      requiresReturn: true,
      customerPaymentMethod: 'CASH',
      externalOrderNumber: `Loja #${feito.numero}`,
      recipientName: 'Ana',
    });
    expect(Math.abs(corrida.scheduledAt!.getTime() - (Date.now() + 30 * 60_000))).toBeLessThan(
      60_000,
    );
    // Sem CEP no pedido, a corrida leva o da loja.
    expect(corrida.addresses.find((item) => item.type === 'DROPOFF')).toMatchObject({
      street: 'Rua A',
      zip: '36980000',
      referenceNote: 'Bairro Centro',
    });
    expect(corrida.statusHistory[0]).toMatchObject({
      toStatus: 'SCHEDULED',
      changedByUserId: null,
      note: `Pedido #${feito.numero} da loja online.`,
    });

    // Pronto antes da hora: a corrida busca motoboy agora. A saída não é da loja.
    await etapa(feito.id, 'EM_PREPARO').then((resposta) => expect(resposta.status).toBe(200));
    const pronto = (await etapa(feito.id, 'PRONTO')).body as PedidoDaLoja;
    expect(pronto.corrida?.situacao).toBe('BUSCANDO_MOTOBOY');
    expect((await prisma.delivery.findUniqueOrThrow({ where: { id: corrida.id } })).status).toBe(
      'AWAITING_DRIVER',
    );
    const saiu = await etapa(feito.id, 'SAIU_PARA_ENTREGA');
    expect(saiu.status).toBe(409);
    expect(saiu.body.code).toBe('STORE_ORDER_FOLLOWS_RIDE');

    // O motoboy coleta e entrega; o pedido acompanha, na fila e para o cliente.
    await prisma.delivery.update({ where: { id: corrida.id }, data: { status: 'COLLECTED' } });
    expect((await naFila(feito.id)).etapa).toBe('SAIU_PARA_ENTREGA');
    await prisma.delivery.update({ where: { id: corrida.id }, data: { status: 'DELIVERED' } });
    const doCliente = (
      (
        await request(servidor)
          .get(`/public/stores/${link}/orders`)
          .set(comoCliente('cliente-a'))
          .expect(200)
      ).body as PedidoDaLoja[]
    ).find((pedido) => pedido.id === feito.id)!;
    expect(doCliente).toMatchObject({ etapa: 'ENTREGUE', corrida: null, avisoDaCorrida: null });

    // Cancelado antes de pronto: a corrida agendada sai junto.
    const desistiu = await pedir();
    await etapa(desistiu.id, 'ACEITO');
    await request(servidor)
      .post(`/company/store/orders/${desistiu.id}/cancel`)
      .set(comoEmpresa())
      .send({ motivo: 'Cliente desistiu' })
      .expect(201);
    const cancelada = await prisma.delivery.findFirstOrThrow({
      where: { storeOrder: { id: desistiu.id } },
    });
    expect(cancelada.status).toBe('CANCELLED');

    // A corrida que não nasce vira aviso; resolvido, chama-se de novo.
    await prisma.serviceType.update({ where: { id: tipo.id }, data: { active: false } });
    const semTipo = await pedir();
    const aceitoSemTipo = (await etapa(semTipo.id, 'ACEITO')).body as PedidoDaLoja;
    expect(aceitoSemTipo.etapa).toBe('ACEITO');
    expect(aceitoSemTipo.corrida).toBeNull();
    expect(aceitoSemTipo.avisoDaCorrida).toMatch(/não está mais ativo/);
    await prisma.serviceType.update({ where: { id: tipo.id }, data: { active: true } });
    const deNovo = (
      await request(servidor)
        .post(`/company/store/orders/${semTipo.id}/ride`)
        .set(comoEmpresa())
        .expect(201)
    ).body as PedidoDaLoja;
    expect(deNovo.corrida?.situacao).toBe('AGENDADA');
    expect(deNovo.avisoDaCorrida).toBeNull();

    // A central cancela a corrida: a loja vê o aviso e entrega com o próprio entregador.
    await prisma.delivery.updateMany({
      where: { storeOrder: { id: semTipo.id } },
      data: { status: 'CANCELLED' },
    });
    expect((await naFila(semTipo.id)).avisoDaCorrida).toMatch(/A central cancelou a corrida/);
    const comALoja = (
      await request(servidor)
        .post(`/company/store/orders/${semTipo.id}/own-courier`)
        .set(comoEmpresa())
        .expect(201)
    ).body as PedidoDaLoja;
    expect(comALoja).toMatchObject({ entregaPor: 'LOJA', avisoDaCorrida: null });
  });

  it('os avisos com a página fechada: quem se inscreve recebe, e o prazo vence sozinho', async () => {
    const servidor = app.getHttpServer();
    const doPainel = `https://fcm.googleapis.com/fcm/send/painel-${suffix}`;
    const doCliente = `https://fcm.googleapis.com/fcm/send/cliente-${suffix}`;

    // A chave pública é aberta; o endereço de push só de serviço conhecido.
    expect((await request(servidor).get('/public/web-push').expect(200)).body).toEqual({
      chavePublica: 'chave-publica-e2e',
    });
    await request(servidor)
      .put('/company/store/orders/push-subscription')
      .set(comoEmpresa())
      .send({ endpoint: 'https://169.254.169.254/latest', keys: { p256dh: 'p', auth: 'a' } })
      .expect(400);
    await request(servidor)
      .put('/company/store/orders/push-subscription')
      .set(comoEmpresa())
      .send({ endpoint: doPainel, keys: { p256dh: 'p', auth: 'a' } })
      .expect(204);
    await request(servidor)
      .put(`/public/stores/${link}/orders/push-subscription`)
      .set(comoCliente('cliente-b'))
      .send({ endpoint: doCliente, keys: { p256dh: 'p', auth: 'a' } })
      .expect(204);
    const naLoja = await prisma.company.findUniqueOrThrow({
      where: { document: empresa.document },
    });
    expect(
      await prisma.webPushSubscription.findMany({
        where: { companyId: naLoja.id },
        select: { audience: true, customerAuthId: true },
        orderBy: { audience: 'asc' },
      }),
    ).toEqual([
      { audience: 'LOJA', customerAuthId: null },
      { audience: 'CLIENTE', customerAuthId: 'user_b' },
    ]);

    // O cliente B pede (o aceite ficou manual no teste anterior): a loja fica
    // sabendo, e o cliente recebe o "recebido".
    avisosEnviados.length = 0;
    const feito = (
      await request(servidor)
        .post(`/public/stores/${link}/orders`)
        .set(comoCliente('cliente-b'))
        .send({
          modalidade: 'ENTREGA',
          itens: [{ produtoId, tamanhoId: null, escolhas: [], quantidade: 2 }],
          agendadoPara: null,
          cliente: { nome: 'Bia', telefone: '33999887766' },
          entrega: {
            rua: 'Rua B',
            numero: '20',
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
          totalVisto: 55,
        })
        .expect(201)
    ).body as PedidoDaLoja;
    expect(avisosEnviados).toEqual([
      {
        para: [doPainel],
        aviso: {
          titulo: 'Novo pedido',
          corpo: `#${feito.numero} · Bia · R$ 55,00 · entrega`,
          url: '/loja/vendas',
          etiqueta: `venda-${feito.numero}`,
        },
      },
      {
        para: [doCliente],
        aviso: {
          titulo: 'Pedido',
          corpo: `Recebemos seu pedido #${feito.numero}.`,
          url: `/pedir/${link}/pedidos`,
          etiqueta: `pedido-${feito.numero}`,
        },
      },
    ]);

    // A loja aceita: só o cliente é avisado.
    avisosEnviados.length = 0;
    await request(servidor)
      .put(`/company/store/orders/${feito.id}/stage`)
      .set(comoEmpresa())
      .send({ para: 'ACEITO' })
      .expect(200);
    expect(avisosEnviados.map((item) => [item.para, item.aviso.corpo])).toEqual([
      [[doCliente], `Seu pedido #${feito.numero} foi aceito.`],
    ]);

    // Um pedido novo que passou do prazo cai na varredura de minuto, sem
    // ninguém abrir o painel — e a loja e o cliente ficam sabendo.
    const esquecido = (
      await request(servidor)
        .post(`/public/stores/${link}/orders`)
        .set(comoCliente('cliente-b'))
        .send({
          modalidade: 'ENTREGA',
          itens: [{ produtoId, tamanhoId: null, escolhas: [], quantidade: 2 }],
          agendadoPara: null,
          cliente: { nome: 'Bia', telefone: '33999887766' },
          entrega: {
            rua: 'Rua B',
            numero: '20',
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
          totalVisto: 55,
        })
        .expect(201)
    ).body as PedidoDaLoja;
    await prisma.storeOrder.update({
      where: { id: esquecido.id },
      data: { acceptDeadline: new Date(Date.now() - 60_000) },
    });
    avisosEnviados.length = 0;
    await app.get(StoreOrdersService).varrer();
    expect(
      (await prisma.storeOrder.findUniqueOrThrow({ where: { id: esquecido.id } })).cancelledBy,
    ).toBe('SISTEMA');
    expect(avisosEnviados.map((item) => [item.para, item.aviso.titulo])).toEqual([
      [[doPainel], 'Pedido cancelado'],
      [[doCliente], 'Pedido'],
    ]);

    // Desligar neste aparelho apaga a inscrição.
    await request(servidor)
      .delete(`/public/stores/${link}/orders/push-subscription`)
      .set(comoCliente('cliente-b'))
      .send({ endpoint: doCliente })
      .expect(204);
    expect(await prisma.webPushSubscription.count({ where: { endpoint: doCliente } })).toBe(0);
  });

  it('o Pix online: a loja liga a conta, o cliente paga, e o que cai volta inteiro', async () => {
    const servidor = app.getHttpServer();
    // O checkout aceita 10 pedidos por minuto por IP, e este arquivo inteiro vem
    // de 127.0.0.1: a contagem dos testes anteriores zera aqui.
    (app.get(ThrottlerStorage) as unknown as { storage: Map<string, unknown> }).storage.clear();
    const naLoja = await prisma.company.findUniqueOrThrow({
      where: { document: empresa.document },
    });
    const pedirPix = (cpf: string | null = '52998224725') =>
      request(servidor)
        .post(`/public/stores/${link}/orders`)
        .set(comoCliente('cliente-a'))
        .send({
          modalidade: 'ENTREGA',
          itens: [{ produtoId, tamanhoId: null, escolhas: [], quantidade: 2 }],
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
          pagamento: 'PIX_ONLINE',
          trocoPara: null,
          observacao: null,
          totalVisto: 55,
          cpf,
        });
    const avisoDoAsaas = (
      pedido: PedidoDaLoja & { pagamentoOnline: unknown },
      cobranca: string,
    ) => ({
      id: `evt_${cobranca}`,
      event: 'PAYMENT_RECEIVED',
      payment: {
        id: cobranca,
        customer: 'cus_e2e',
        value: 55,
        status: 'RECEIVED',
        billingType: 'PIX',
        externalReference: pedido.id,
      },
    });
    const idDaCobranca = async (pedidoId: string) =>
      (await prisma.storeOrder.findUniqueOrThrow({ where: { id: pedidoId } })).paymentProviderId!;

    // Sem a conta, o Pix não entra nas formas de pagamento.
    expect(
      (await request(servidor).get('/company/store/asaas-account').set(comoEmpresa()).expect(200))
        .body,
    ).toEqual({ conectada: false });
    await request(servidor)
      .put('/company/store/operation/payments')
      .set(comoEmpresa())
      .send({ pagamentos: ['DINHEIRO', 'PIX_ONLINE'] })
      .expect(400);

    // A loja liga a conta: o webhook nasce na conta dela, com a URL desta loja.
    const ligada = await request(servidor)
      .put('/company/store/asaas-account')
      .set(comoEmpresa())
      .send({ chaveDaApi: '$aact_hmlg_chave_de_teste_e2e', ambiente: 'SANDBOX' })
      .expect(200);
    expect(ligada.body).toMatchObject({ conectada: true, ambiente: 'SANDBOX', temChavePix: true });
    expect(asaasDeTeste.webhook?.url).toMatch(
      new RegExp(`/integrations/asaas/stores/${naLoja.id}/webhook$`),
    );
    const guardada = await prisma.storeAsaasAccount.findUniqueOrThrow({
      where: { companyId: naLoja.id },
    });
    expect(JSON.stringify(guardada)).not.toContain('aact');
    await request(servidor)
      .put('/company/store/operation/payments')
      .set(comoEmpresa())
      .send({ pagamentos: ['DINHEIRO', 'PIX_ONLINE'] })
      .expect(200);

    // Pix sem CPF é recusado; com CPF, o pedido nasce esperando, com o QR.
    await pedirPix(null).expect(400);
    const esperando = (await pedirPix().expect(201)).body as PedidoDaLoja;
    expect(esperando).toMatchObject({
      etapa: 'AGUARDANDO_PAGAMENTO',
      pagamentoOnline: {
        situacao: 'AGUARDANDO',
        pixCopiaECola: '00020126pix',
        qrCode: 'iVBORw0KGgo',
      },
    });
    const naFila = async () =>
      (
        (await request(servidor).get('/company/store/orders').set(comoEmpresa()).expect(200))
          .body as PedidoDaLoja[]
      ).map((pedido) => pedido.id);
    expect(await naFila()).not.toContain(esperando.id);

    // O aviso com o token errado é recusado; com o certo, o pedido entra na loja.
    const cobranca = await idDaCobranca(esperando.id);
    asaasDeTeste.cobrancas.get(cobranca)!.status = 'RECEIVED';
    await request(servidor)
      .post(`/integrations/asaas/stores/${naLoja.id}/webhook`)
      .set('asaas-access-token', 'x'.repeat(43))
      .send(avisoDoAsaas(esperando as never, cobranca))
      .expect(401);
    avisosEnviados.length = 0;
    await request(servidor)
      .post(`/integrations/asaas/stores/${naLoja.id}/webhook`)
      .set('asaas-access-token', asaasDeTeste.webhook!.authToken)
      .send(avisoDoAsaas(esperando as never, cobranca))
      .expect(200);
    const pago = await prisma.storeOrder.findUniqueOrThrow({ where: { id: esperando.id } });
    expect(pago).toMatchObject({ stage: 'NOVO', paymentStatus: 'PAGO', pixPayload: null });
    expect(await naFila()).toContain(esperando.id);
    // A loja recebe o "novo pedido" agora, e não quando o Pix foi gerado.
    expect(avisosEnviados.some((item) => item.aviso.titulo === 'Novo pedido')).toBe(true);

    // Cancelado pela loja, o dinheiro volta inteiro.
    const cancelado = (
      await request(servidor)
        .post(`/company/store/orders/${esperando.id}/cancel`)
        .set(comoEmpresa())
        .send({ motivo: 'Item em falta' })
        .expect(201)
    ).body as PedidoDaLoja;
    expect(asaasDeTeste.estornadas).toContain(cobranca);
    expect(cancelado.pagamentoOnline).toMatchObject({ situacao: 'ESTORNADO' });

    // "Já paguei": o servidor pergunta ao Asaas, e o pedido entra.
    const outro = (await pedirPix().expect(201)).body as PedidoDaLoja;
    const cobrancaDoOutro = await idDaCobranca(outro.id);
    await request(servidor)
      .post(`/public/stores/${link}/orders/${outro.id}/check-payment`)
      .set(comoCliente('cliente-a'))
      .expect(200)
      .then((resposta) =>
        expect((resposta.body as PedidoDaLoja).etapa).toBe('AGUARDANDO_PAGAMENTO'),
      );
    asaasDeTeste.cobrancas.get(cobrancaDoOutro)!.status = 'RECEIVED';
    const entrou = (
      await request(servidor)
        .post(`/public/stores/${link}/orders/${outro.id}/check-payment`)
        .set(comoCliente('cliente-a'))
        .expect(200)
    ).body as PedidoDaLoja;
    expect(entrou.etapa).toBe('NOVO');

    // Vencido sem pagar: a cobrança some do Asaas, e o pedido cai para o cliente.
    const esquecido = (await pedirPix().expect(201)).body as PedidoDaLoja;
    const cobrancaEsquecida = await idDaCobranca(esquecido.id);
    await prisma.storeOrder.update({
      where: { id: esquecido.id },
      data: { paymentDueAt: new Date(Date.now() - 60_000) },
    });
    await app.get(StoreOrdersService).varrer();
    expect(asaasDeTeste.apagadas).toContain(cobrancaEsquecida);
    const doCliente = (
      (
        await request(servidor)
          .get(`/public/stores/${link}/orders`)
          .set(comoCliente('cliente-a'))
          .expect(200)
      ).body as PedidoDaLoja[]
    ).find((pedido) => pedido.id === esquecido.id)!;
    expect(doCliente).toMatchObject({
      etapa: 'CANCELADO',
      cancelamento: { motivo: 'O Pix não foi pago a tempo', por: 'SISTEMA' },
      pagamentoOnline: { situacao: 'NAO_PAGO', qrCode: null },
    });
    expect(await naFila()).not.toContain(esquecido.id);

    // Desligar a conta tira o Pix da página.
    await request(servidor).delete('/company/store/asaas-account').set(comoEmpresa()).expect(200);
    const vitrine = await request(servidor).get(`/public/stores/${link}`).expect(200);
    expect(
      (vitrine.body as Extract<PublicStoreLookup, { kind: 'store' }>).store.operacao.pagamentos,
    ).not.toContain('PIX_ONLINE');
  });
});
