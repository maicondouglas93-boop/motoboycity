import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerStorage } from '@nestjs/throttler';
import { randomBytes } from 'node:crypto';
import request from 'supertest';
import type { App } from 'supertest/types';
import type {
  PedidoDaLoja,
  PublicStoreLookup,
  StoreCatalog,
  StoreProduct,
} from '@motoboycity/types';
import { AppModule } from '../src/app.module';
import { VerificadorDoCliente } from '../src/company/store-orders/cliente-da-loja.guard';
import { GoogleMapsService } from '../src/maps/google-maps.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { WebPushService } from '../src/web-push/web-push.service';

/**
 * O estoque opcional do produto, contra o banco de verdade: quem não informa estoque vende
 * como sempre; quem informa vê o pedido baixar, o pedido que passa do que resta ser recusado
 * com a frase certa, o cancelamento devolver as unidades (uma vez, e só se o pedido as
 * baixou), e o último item ir para um só de dois pedidos ao mesmo tempo.
 *
 * O login do cliente (Firebase), o Google e o Web Push são simulados.
 */

const suffix = String(Date.now()).slice(-8);
const loja = {
  email: `estoque.${suffix}@example.com`,
  document: `505${suffix}`,
  nome: 'Estoque E2E',
  link: `estoque-${suffix}`,
  token: '',
  secaoId: '',
};

const SEMPRE_ABERTA = [0, 1, 2, 3, 4, 5, 6].map((dia) => ({
  dia,
  faixas: [{ abre: '00:00', fecha: '00:00' }],
}));

describe('Estoque do produto (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let regiaoCriada: string | null = null;

  const servidor = () => app.getHttpServer();
  const comoLoja = () => ({ Authorization: `Bearer ${loja.token}` });
  const cliente = (quem: string) => ({ Authorization: `Bearer ${quem}` });
  const zerarLimite = () =>
    (app.get(ThrottlerStorage) as unknown as { storage: Map<string, unknown> }).storage.clear();

  /** O produto de R$ 10,00, de preço único; `stock` ausente é sem controle. */
  const corpoDoProduto = (mudancas: object = {}): Record<string, unknown> => ({
    categoryId: loja.secaoId,
    name: 'Brigadeiro',
    description: '',
    price: 10,
    status: 'PUBLISHED',
    sizes: [],
    optionGroups: [],
    ...mudancas,
  });
  const criarProduto = async (mudancas: object = {}) =>
    (
      await request(servidor())
        .post('/company/store/products')
        .set(comoLoja())
        .send(corpoDoProduto(mudancas))
        .expect(201)
    ).body as StoreProduct;
  const estoqueNoBanco = async (id: string) =>
    (await prisma.storeProduct.findUniqueOrThrow({ where: { id } })).stock;
  const daPagina = async (id: string) => {
    const achado = (
      (await request(servidor()).get(`/public/stores/${loja.link}`).expect(200)).body as Extract<
        PublicStoreLookup,
        { kind: 'store' }
      >
    ).store.products.find((produto) => produto.id === id);
    return achado!;
  };

  /** Pede `linhas` (produto, tamanho, quantidade) ao preço de R$ 10,00 cada unidade, mais R$ 5,00 de entrega. */
  const pedir = (
    linhas: Array<{ produtoId: string; tamanhoId?: string | null; quantidade: number }>,
    quem = 'cliente-a',
  ) => {
    const unidades = linhas.reduce((soma, linha) => soma + linha.quantidade, 0);
    return request(servidor())
      .post(`/public/stores/${loja.link}/orders`)
      .set(cliente(quem))
      .send({
        modalidade: 'ENTREGA',
        itens: linhas.map((linha) => ({
          produtoId: linha.produtoId,
          tamanhoId: linha.tamanhoId ?? null,
          escolhas: [],
          quantidade: linha.quantidade,
        })),
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
        totalVisto: unidades * 10 + 5,
        cupom: null,
      });
  };
  const cancelar = (id: string) =>
    request(servidor())
      .post(`/company/store/orders/${id}/cancel`)
      .set(comoLoja())
      .send({ motivo: 'Cliente desistiu' });

  beforeAll(async () => {
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
        localizar: async () => ({ lat: -20.15, lng: -41.62, precisao: 'ROOFTOP' }),
        reverseGeocode: async () => null,
      })
      .overrideProvider(WebPushService)
      .useValue({
        onModuleInit: () => undefined,
        disponivel: () => true,
        chavePublica: () => 'chave-publica-e2e',
        enviar: () => Promise.resolve(),
      })
      .compile();
    app = module.createNestApplication();
    prisma = module.get(PrismaService);
    await app.init();

    if (!(await prisma.region.findFirst({ where: { active: true } }))) {
      regiaoCriada = (await prisma.region.create({ data: { name: `Região E2E ${suffix}` } })).id;
    }
    await request(servidor())
      .post('/auth/register/company')
      .send({
        name: loja.nome,
        email: loja.email,
        phone: '33999887766',
        document: loja.document,
        legalName: `${loja.nome} LTDA`,
        tradeName: loja.nome,
        password: 'senhaSegura123',
      });
    const login = await request(servidor())
      .post('/auth/login')
      .send({ email: loja.email, password: 'senhaSegura123' });
    loja.token = login.body.accessToken as string;

    await request(servidor())
      .put('/company/store/settings/link')
      .set(comoLoja())
      .send({ slug: loja.link, name: loja.nome })
      .expect(200);
    const secao = await request(servidor())
      .post('/company/store/categories')
      .set(comoLoja())
      .send({ name: 'Doces' })
      .expect(201);
    loja.secaoId = secao.body.id as string;
    await request(servidor())
      .put('/company/store/operation/schedule')
      .set(comoLoja())
      .send({ semana: SEMPRE_ABERTA, excecoes: [], mensagemFechada: '' })
      .expect(200);
    await request(servidor())
      .put('/company/store/operation/delivery-areas')
      .set(comoLoja())
      .send({ bairros: [{ id: 'b1', nome: 'Centro', taxa: 5 }] })
      .expect(200);
    await prisma.company.update({ where: { document: loja.document }, data: { status: 'ACTIVE' } });
    await request(servidor())
      .put('/company/store/settings/accepts-orders')
      .set(comoLoja())
      .send({ recebePedidos: true })
      .expect(200);
  });

  afterAll(async () => {
    const corridas = await prisma.delivery.findMany({
      where: { company: { document: loja.document } },
      select: { id: true },
    });
    const ids = corridas.map((corrida) => corrida.id);
    await prisma.deliveryOffer.deleteMany({ where: { deliveryId: { in: ids } } });
    await prisma.deliveryStatusHistory.deleteMany({ where: { deliveryId: { in: ids } } });
    await prisma.deliveryAddress.deleteMany({ where: { deliveryId: { in: ids } } });
    await prisma.delivery.deleteMany({ where: { id: { in: ids } } });
    await prisma.companyAddress.deleteMany({ where: { company: { document: loja.document } } });
    await prisma.companyTeamMember.deleteMany({ where: { user: { email: loja.email } } });
    await prisma.company.deleteMany({ where: { document: loja.document } });
    await prisma.user.deleteMany({ where: { email: loja.email } });
    if (regiaoCriada) await prisma.region.delete({ where: { id: regiaoCriada } });
    await app.close();
  });

  it('o estoque é opcional: sem número vende como sempre; com número, o painel o vê e a página só sabe do que precisa', async () => {
    const semControle = await criarProduto({ name: 'Sem controle' });
    expect(semControle.stock).toBeNull();
    const comEstoque = await criarProduto({ name: 'Com estoque', stock: 50 });
    const poucas = await criarProduto({ name: 'Poucas', stock: 3 });
    const zerado = await criarProduto({ name: 'Zerado', stock: 0 });

    // O painel vê o número exato.
    const catalogo = (
      await request(servidor()).get('/company/store/catalog').set(comoLoja()).expect(200)
    ).body as StoreCatalog;
    expect(
      Object.fromEntries(catalogo.products.map((produto) => [produto.name, produto.stock])),
    ).toEqual({
      'Sem controle': null,
      'Com estoque': 50,
      Poucas: 3,
      Zerado: 0,
    });

    // A página recebe só se esgotou e, com poucas unidades, quantas restam — nunca o número.
    expect(await daPagina(semControle.id)).toMatchObject({ esgotado: false, restam: null });
    expect(await daPagina(comEstoque.id)).toMatchObject({ esgotado: false, restam: null });
    expect(await daPagina(poucas.id)).toMatchObject({ esgotado: false, restam: 3 });
    // O esgotado continua na página: dá para ver, não dá para pedir.
    expect(await daPagina(zerado.id)).toMatchObject({ esgotado: true, restam: null });
    const bruto = JSON.stringify(await daPagina(comEstoque.id));
    expect(bruto).not.toContain('"stock"');
    expect(bruto).not.toContain('50');

    // Editar sem falar de estoque não mexe nele; com número troca; com null tira o controle.
    const raiz = `/company/store/products/${poucas.id}`;
    const { stock: _ignorado, ...semEstoqueNoCorpo } = corpoDoProduto({
      name: 'Poucas',
      price: 12,
    });
    await request(servidor()).put(raiz).set(comoLoja()).send(semEstoqueNoCorpo).expect(200);
    expect(await estoqueNoBanco(poucas.id)).toBe(3);
    await request(servidor())
      .put(raiz)
      .set(comoLoja())
      .send(corpoDoProduto({ name: 'Poucas', stock: 8 }))
      .expect(200);
    expect(await estoqueNoBanco(poucas.id)).toBe(8);
    await request(servidor())
      .put(raiz)
      .set(comoLoja())
      .send(corpoDoProduto({ name: 'Poucas', stock: null }))
      .expect(200);
    expect(await estoqueNoBanco(poucas.id)).toBeNull();

    // Os dados chegam validados.
    await request(servidor())
      .post('/company/store/products')
      .set(comoLoja())
      .send(corpoDoProduto({ stock: -1 }))
      .expect(400);
    await request(servidor())
      .post('/company/store/products')
      .set(comoLoja())
      .send(corpoDoProduto({ stock: 2.5 }))
      .expect(400);
  });

  it('o pedido baixa o estoque; passar do que resta é recusado; o cancelamento devolve, uma vez', async () => {
    zerarLimite();
    const produto = await criarProduto({ name: 'Cinco', stock: 5 });
    const livre = await criarProduto({ name: 'Livre' });

    // Dois brigadeiros: o estoque cai de 5 para 3.
    const primeiro = (await pedir([{ produtoId: produto.id, quantidade: 2 }]).expect(201))
      .body as PedidoDaLoja;
    expect(await estoqueNoBanco(produto.id)).toBe(3);
    expect(primeiro.itens[0]).toMatchObject({ baixouEstoque: true });
    expect(await daPagina(produto.id)).toMatchObject({ esgotado: false, restam: 3 });

    // Quatro é mais do que resta: recusa, diz quantas restam, e o estoque não muda.
    const passou = await pedir([{ produtoId: produto.id, quantidade: 4 }]);
    expect(passou.status).toBe(409);
    expect(passou.body).toMatchObject({
      code: 'STORE_ORDER_OUT_OF_STOCK',
      message: 'Só restam 3 unidades de Cinco. Diminua a quantidade na sacola.',
      restam: 3,
      produtoId: produto.id,
    });
    expect(await estoqueNoBanco(produto.id)).toBe(3);

    // Os três que restam, sim: o estoque zera, e a página passa a dizer "esgotado".
    const segundo = (
      await pedir([{ produtoId: produto.id, quantidade: 3 }], 'cliente-b').expect(201)
    ).body as PedidoDaLoja;
    expect(await estoqueNoBanco(produto.id)).toBe(0);
    expect(await daPagina(produto.id)).toMatchObject({ esgotado: true, restam: null });
    const esgotou = await pedir([{ produtoId: produto.id, quantidade: 1 }]);
    expect(esgotou.status).toBe(409);
    expect(esgotou.body).toMatchObject({
      code: 'STORE_ORDER_OUT_OF_STOCK',
      message: 'Cinco esgotou. Tire da sacola e peça de novo.',
      restam: 0,
    });

    // O produto sem controle segue vendendo, e o número dele continua sem número.
    await pedir([{ produtoId: livre.id, quantidade: 7 }]).expect(201);
    expect(await estoqueNoBanco(livre.id)).toBeNull();

    // Cancelado o primeiro pedido, as duas unidades voltam — e cancelar de novo não devolve outras.
    await cancelar(primeiro.id).expect(201);
    expect(await estoqueNoBanco(produto.id)).toBe(2);
    await cancelar(primeiro.id);
    expect(await estoqueNoBanco(produto.id)).toBe(2);
    expect(await daPagina(produto.id)).toMatchObject({ esgotado: false, restam: 2 });
    await cancelar(segundo.id).expect(201);
    expect(await estoqueNoBanco(produto.id)).toBe(5);
  });

  it('o pedido de antes de o produto ter estoque não dá unidades ao ser cancelado', async () => {
    zerarLimite();
    const produto = await criarProduto({ name: 'Sem estoque no começo' });

    // Pedido feito quando o produto ainda não tinha controle: não baixou nada.
    const antigo = (await pedir([{ produtoId: produto.id, quantidade: 4 }]).expect(201))
      .body as PedidoDaLoja;
    expect(antigo.itens[0]).not.toHaveProperty('baixouEstoque');
    // Depois a loja passa a controlar: 10 unidades.
    await request(servidor())
      .put(`/company/store/products/${produto.id}`)
      .set(comoLoja())
      .send(corpoDoProduto({ name: 'Sem estoque no começo', stock: 10 }))
      .expect(200);

    await cancelar(antigo.id).expect(201);

    // O pedido nunca baixou o estoque, então cancelá-lo não põe 4 unidades onde elas não estavam.
    expect(await estoqueNoBanco(produto.id)).toBe(10);
  });

  it('os tamanhos do mesmo produto dividem o estoque: a soma das linhas é o que conta', async () => {
    zerarLimite();
    const produto = await criarProduto({
      name: 'Bolo',
      price: null,
      stock: 3,
      sizes: [
        { name: 'Pequeno', price: 10, available: true },
        { name: 'Grande', price: 10, available: true },
      ],
    });
    const [pequeno, grande] = produto.sizes;

    // 2 pequenos + 2 grandes = 4, e só há 3.
    const passou = await pedir([
      { produtoId: produto.id, tamanhoId: pequeno!.id, quantidade: 2 },
      { produtoId: produto.id, tamanhoId: grande!.id, quantidade: 2 },
    ]);
    expect(passou.status).toBe(409);
    expect(passou.body).toMatchObject({ code: 'STORE_ORDER_OUT_OF_STOCK', restam: 3 });
    expect(await estoqueNoBanco(produto.id)).toBe(3);

    // 1 + 2 = 3: cabe, e leva tudo.
    await pedir([
      { produtoId: produto.id, tamanhoId: pequeno!.id, quantidade: 1 },
      { produtoId: produto.id, tamanhoId: grande!.id, quantidade: 2 },
    ]).expect(201);
    expect(await estoqueNoBanco(produto.id)).toBe(0);
  });

  it('com uma unidade só, dois pedidos ao mesmo tempo: um leva, o outro é recusado, e o estoque fecha em zero', async () => {
    zerarLimite();
    const produto = await criarProduto({ name: 'Última', stock: 1 });

    const [um, outro] = await Promise.all([
      pedir([{ produtoId: produto.id, quantidade: 1 }], 'cliente-a'),
      pedir([{ produtoId: produto.id, quantidade: 1 }], 'cliente-b'),
    ]);

    expect([um.status, outro.status].sort()).toEqual([201, 409]);
    const recusado = um.status === 409 ? um : outro;
    expect(recusado.body.code).toBe('STORE_ORDER_OUT_OF_STOCK');
    // Nunca negativo: o UPDATE condicional não deixa passar do que há.
    expect(await estoqueNoBanco(produto.id)).toBe(0);
    expect(
      await prisma.storeOrder.count({
        where: {
          company: { document: loja.document },
          items: { path: ['0', 'produtoId'], equals: produto.id },
        },
      }),
    ).toBe(1);
  });
});
