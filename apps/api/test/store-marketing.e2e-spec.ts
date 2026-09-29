import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerStorage } from '@nestjs/throttler';
import { randomBytes } from 'node:crypto';
import request from 'supertest';
import type { App } from 'supertest/types';
import type {
  PedidoDaLoja,
  PromocaoDaLoja,
  PublicStoreLookup,
  StoreProduct,
} from '@motoboycity/types';
import { AppModule } from '../src/app.module';
import { VerificadorDoCliente } from '../src/company/store-orders/cliente-da-loja.guard';
import { GoogleMapsService } from '../src/maps/google-maps.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { WebPushService } from '../src/web-push/web-push.service';

/**
 * Marketing → Promoções contra o banco de verdade: duas lojas, cada uma vendo
 * só as suas; a promoção no cardápio público; o preço do pedido calculado no
 * servidor com ela; e o uso contado, devolvido e disputado.
 *
 * O login do cliente (Firebase), o Google e o Web Push são simulados.
 */

const suffix = String(Date.now()).slice(-8);
const senha = 'senhaSegura123';
const lojaA = {
  email: `promo.a.${suffix}@example.com`,
  document: `503${suffix}`,
  nome: 'Promo A E2E',
  link: `promo-a-${suffix}`,
  token: '',
  produtoId: '',
  secaoId: '',
};
const lojaB = {
  email: `promo.b.${suffix}@example.com`,
  document: `504${suffix}`,
  nome: 'Promo B E2E',
  link: `promo-b-${suffix}`,
  token: '',
  produtoId: '',
  secaoId: '',
};

const SEMPRE_ABERTA = [0, 1, 2, 3, 4, 5, 6].map((dia) => ({
  dia,
  faixas: [{ abre: '00:00', fecha: '00:00' }],
}));

describe('Promoções da loja (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let regiaoCriada: string | null = null;

  const servidor = () => app.getHttpServer();
  const comoA = () => ({ Authorization: `Bearer ${lojaA.token}` });
  const comoB = () => ({ Authorization: `Bearer ${lojaB.token}` });
  const cliente = (quem: string) => ({ Authorization: `Bearer ${quem}` });
  const zerarLimite = () =>
    (app.get(ThrottlerStorage) as unknown as { storage: Map<string, unknown> }).storage.clear();

  /** 20% no produto da loja A, sempre valendo. */
  const vinteAoProduto = (mudancas: object = {}) => ({
    nome: 'X-Burger 20%',
    tipo: 'PERCENTUAL',
    alvo: 'PRODUTO',
    produtoId: lojaA.produtoId,
    percentual: 20,
    ...mudancas,
  });

  const vitrineDe = async (link: string) =>
    (
      (await request(servidor()).get(`/public/stores/${link}`).expect(200)).body as Extract<
        PublicStoreLookup,
        { kind: 'store' }
      >
    ).store;

  const pedidoDe = (link: string, produtoId: string, quem: string, totalVisto: number) =>
    request(servidor())
      .post(`/public/stores/${link}/orders`)
      .set(cliente(quem))
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
        totalVisto,
      });

  /** Cadastra a loja: empresa ativa, link, um produto de R$ 22,50, horário, bairro e pedidos ligados. */
  async function montarLoja(loja: typeof lojaA) {
    await request(servidor())
      .post('/auth/register/company')
      .send({
        name: loja.nome,
        email: loja.email,
        phone: '33999887766',
        document: loja.document,
        legalName: `${loja.nome} LTDA`,
        tradeName: loja.nome,
        password: senha,
      });
    const login = await request(servidor())
      .post('/auth/login')
      .send({ email: loja.email, password: senha });
    loja.token = login.body.accessToken as string;
    const como = { Authorization: `Bearer ${loja.token}` };

    await request(servidor())
      .put('/company/store/settings/link')
      .set(como)
      .send({ slug: loja.link, name: loja.nome })
      .expect(200);
    const secao = await request(servidor())
      .post('/company/store/categories')
      .set(como)
      .send({ name: 'Lanches' })
      .expect(201);
    loja.secaoId = secao.body.id as string;
    const produto = await request(servidor())
      .post('/company/store/products')
      .set(como)
      .send({
        categoryId: loja.secaoId,
        name: 'X-Burger',
        description: '',
        price: 22.5,
        status: 'PUBLISHED',
        sizes: [],
        optionGroups: [],
      })
      .expect(201);
    loja.produtoId = (produto.body as StoreProduct).id;
    await request(servidor())
      .put('/company/store/operation/schedule')
      .set(como)
      .send({ semana: SEMPRE_ABERTA, excecoes: [], mensagemFechada: '' })
      .expect(200);
    await request(servidor())
      .put('/company/store/operation/delivery-areas')
      .set(como)
      .send({ bairros: [{ id: 'b1', nome: 'Centro', taxa: 5 }] })
      .expect(200);
    await prisma.company.update({ where: { document: loja.document }, data: { status: 'ACTIVE' } });
    await request(servidor())
      .put('/company/store/settings/accepts-orders')
      .set(como)
      .send({ recebePedidos: true })
      .expect(200);
  }

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
    await montarLoja(lojaA);
    await montarLoja(lojaB);
  });

  afterAll(async () => {
    for (const loja of [lojaA, lojaB]) {
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
      // Promoções, pedidos e cardápio saem junto com a empresa, em cascata.
      await prisma.company.deleteMany({ where: { document: loja.document } });
      await prisma.user.deleteMany({ where: { email: loja.email } });
    }
    if (regiaoCriada) await prisma.region.delete({ where: { id: regiaoCriada } });
    await app.close();
  });

  it('cada loja vê, muda e apaga só as suas promoções; a outra recebe "não encontrada"', async () => {
    // Sem login, nada.
    await request(servidor()).get('/company/store/marketing/promotions').expect(401);

    const criada = await request(servidor())
      .post('/company/store/marketing/promotions')
      .set(comoA())
      .send(vinteAoProduto())
      .expect(201);
    const promocao = criada.body as PromocaoDaLoja;
    expect(promocao).toMatchObject({ nome: 'X-Burger 20%', percentual: 20, ativa: true, usos: 0 });

    const listaA = await request(servidor())
      .get('/company/store/marketing/promotions')
      .set(comoA())
      .expect(200);
    expect((listaA.body as PromocaoDaLoja[]).map((item) => item.id)).toEqual([promocao.id]);
    const listaB = await request(servidor())
      .get('/company/store/marketing/promotions')
      .set(comoB())
      .expect(200);
    expect(listaB.body).toEqual([]);

    // A loja B, com o id certo da promoção de A na mão, não mexe em nada.
    const raiz = `/company/store/marketing/promotions/${promocao.id}`;
    const naoAchada = { code: 'STORE_PROMOTION_NOT_FOUND' };
    expect(
      (await request(servidor()).put(raiz).set(comoB()).send(vinteAoProduto()).expect(404)).body,
    ).toMatchObject(naoAchada);
    expect(
      (
        await request(servidor())
          .patch(`${raiz}/active`)
          .set(comoB())
          .send({ ativa: false })
          .expect(404)
      ).body,
    ).toMatchObject(naoAchada);
    expect(
      (await request(servidor()).post(`${raiz}/duplicate`).set(comoB()).expect(404)).body,
    ).toMatchObject(naoAchada);
    expect((await request(servidor()).delete(raiz).set(comoB()).expect(404)).body).toMatchObject(
      naoAchada,
    );
    // E a promoção de A continua intacta, ligada e com o mesmo desconto.
    const depois = await prisma.storePromotion.findUniqueOrThrow({ where: { id: promocao.id } });
    expect(depois).toMatchObject({ active: true, percent: 20, name: 'X-Burger 20%' });

    // B também não cria promoção sobre o produto ou a seção de A.
    const produtoDeA = await request(servidor())
      .post('/company/store/marketing/promotions')
      .set(comoB())
      .send(vinteAoProduto())
      .expect(409);
    // A mesma resposta de um produto que não existe: não confirma que ele é de outra loja.
    expect(produtoDeA.body.code).toBe('STORE_PROMOTION_TARGET_NOT_FOUND');
    await request(servidor())
      .post('/company/store/marketing/promotions')
      .set(comoB())
      .send({
        nome: 'Seção alheia',
        tipo: 'PERCENTUAL',
        alvo: 'CATEGORIA',
        categoriaId: lojaA.secaoId,
        percentual: 10,
      })
      .expect(409);
    expect(
      await prisma.storePromotion.count({ where: { company: { document: lojaB.document } } }),
    ).toBe(0);

    // Os dados chegam validados: o percentual passa de 90.
    const invalida = await request(servidor())
      .post('/company/store/marketing/promotions')
      .set(comoA())
      .send(vinteAoProduto({ percentual: 95 }))
      .expect(400);
    expect(JSON.stringify(invalida.body)).toContain('1% a 90%');

    // O preço promocional exige produto de preço único e menor que o de hoje.
    const maisCara = await request(servidor())
      .post('/company/store/marketing/promotions')
      .set(comoA())
      .send(vinteAoProduto({ tipo: 'PRECO', percentual: null, precoPromocional: 30, nome: 'Cara' }))
      .expect(409);
    expect(maisCara.body.code).toBe('STORE_PROMOTION_PRICE_NOT_LOWER');

    // Duplicar cria outra, desligada e sem usos; apagar a cópia não toca a original.
    const copia = (await request(servidor()).post(`${raiz}/duplicate`).set(comoA()).expect(201))
      .body as PromocaoDaLoja;
    expect(copia).toMatchObject({ nome: 'X-Burger 20% (cópia)', ativa: false, usos: 0 });
    await request(servidor())
      .delete(`/company/store/marketing/promotions/${copia.id}`)
      .set(comoA())
      .expect(200);
    expect(await prisma.storePromotion.findUnique({ where: { id: promocao.id } })).not.toBeNull();
  });

  it('a página pública mostra só as promoções ligadas da própria loja, sem dado interno', async () => {
    const vitrineA = await vitrineDe(lojaA.link);
    expect(vitrineA.promocoes).toHaveLength(1);
    expect(vitrineA.promocoes?.[0]).toMatchObject({
      nome: 'X-Burger 20%',
      tipo: 'PERCENTUAL',
      produtoId: lojaA.produtoId,
      percentual: 20,
    });
    // O que é interno da loja não vai para o cliente.
    const bruto = JSON.stringify(vitrineA.promocoes);
    for (const interno of ['usos', 'limiteDeUsos', 'ativa', 'companyId', 'criadaEm']) {
      expect(bruto).not.toContain(`"${interno}"`);
    }
    expect((await vitrineDe(lojaB.link)).promocoes).toEqual([]);

    // Desligada, sai da página.
    const id = vitrineA.promocoes![0]!.id;
    await request(servidor())
      .patch(`/company/store/marketing/promotions/${id}/active`)
      .set(comoA())
      .send({ ativa: false })
      .expect(200);
    expect((await vitrineDe(lojaA.link)).promocoes).toEqual([]);
    await request(servidor())
      .patch(`/company/store/marketing/promotions/${id}/active`)
      .set(comoA())
      .send({ ativa: true })
      .expect(200);
    expect((await vitrineDe(lojaA.link)).promocoes).toHaveLength(1);
  });

  it('o pedido sai com o preço da promoção, calculado no servidor, e o uso é contado e devolvido', async () => {
    zerarLimite();
    const [promocao] = (
      await request(servidor()).get('/company/store/marketing/promotions').set(comoA()).expect(200)
    ).body as PromocaoDaLoja[];
    const uso = async () =>
      (await prisma.storePromotion.findUniqueOrThrow({ where: { id: promocao!.id } })).usedCount;

    // A página mostrou o preço cheio (2 x 22,50 + 5): o servidor recusa e diz o novo total.
    const desatualizado = await pedidoDe(lojaA.link, lojaA.produtoId, 'cliente-a', 50).expect(409);
    // 2 x (22,50 − 20%) = 36,00, mais 5,00 de entrega.
    expect(desatualizado.body).toMatchObject({ code: 'STORE_ORDER_TOTAL_CHANGED', total: 41 });
    expect(await uso()).toBe(0);

    const feito = (await pedidoDe(lojaA.link, lojaA.produtoId, 'cliente-a', 41).expect(201))
      .body as PedidoDaLoja;
    expect(feito).toMatchObject({ subtotal: 36, taxaDeEntrega: 5, total: 41 });
    expect(feito.itens[0]).toMatchObject({
      unitario: 22.5,
      total: 36,
      totalOriginal: 45,
      promocao: { id: promocao!.id, nome: 'X-Burger 20%', desconto: 9, rotulo: '20% OFF' },
    });
    expect(await uso()).toBe(1);

    // Um segundo pedido com a promoção: são dois usos.
    const outro = (await pedidoDe(lojaA.link, lojaA.produtoId, 'cliente-b', 41).expect(201))
      .body as PedidoDaLoja;
    expect(await uso()).toBe(2);

    // Cancelado, o pedido devolve o uso — e cancelar de novo não devolve outro.
    const cancelar = (id: string) =>
      request(servidor())
        .post(`/company/store/orders/${id}/cancel`)
        .set(comoA())
        .send({ motivo: 'Cliente desistiu' });
    await cancelar(feito.id).expect(201);
    expect(await uso()).toBe(1);
    await cancelar(feito.id);
    expect(await uso()).toBe(1);
    await cancelar(outro.id).expect(201);
    expect(await uso()).toBe(0);

    // A promoção da loja A não age no produto da loja B, nem gasta o uso dela.
    const daB = (await pedidoDe(lojaB.link, lojaB.produtoId, 'cliente-b', 50).expect(201))
      .body as PedidoDaLoja;
    expect(daB.itens[0]).not.toHaveProperty('promocao');
    expect(daB.total).toBe(50);
    expect(await uso()).toBe(0);
  });

  it('com um uso só, dois pedidos ao mesmo tempo: um leva a promoção, o outro é recusado', async () => {
    zerarLimite();
    const [promocao] = (
      await request(servidor()).get('/company/store/marketing/promotions').set(comoA()).expect(200)
    ).body as PromocaoDaLoja[];
    await request(servidor())
      .put(`/company/store/marketing/promotions/${promocao!.id}`)
      .set(comoA())
      .send(vinteAoProduto({ limiteDeUsos: 1 }))
      .expect(200);

    const [um, outro] = await Promise.all([
      pedidoDe(lojaA.link, lojaA.produtoId, 'cliente-a', 41),
      pedidoDe(lojaA.link, lojaA.produtoId, 'cliente-b', 41),
    ]);

    // Um passa; o outro cai porque o uso acabou entre a leitura e a gravação
    // (ou porque já nem via mais a promoção, e o total que trouxe deixou de valer).
    expect([um.status, outro.status].sort()).toEqual([201, 409]);
    const recusado = um.status === 409 ? um : outro;
    expect(['STORE_PROMOTION_EXHAUSTED', 'STORE_ORDER_TOTAL_CHANGED']).toContain(
      recusado.body.code,
    );
    const gravada = await prisma.storePromotion.findUniqueOrThrow({ where: { id: promocao!.id } });
    expect(gravada.usedCount).toBe(1);
    expect(
      await prisma.storeOrder.count({
        where: { company: { document: lojaA.document }, total: 41, stage: { not: 'CANCELADO' } },
      }),
    ).toBe(1);

    // Esgotada, ela some da página, e o pedido seguinte é de preço cheio.
    expect((await vitrineDe(lojaA.link)).promocoes).toEqual([]);
    zerarLimite();
    const cheio = (await pedidoDe(lojaA.link, lojaA.produtoId, 'cliente-a', 50).expect(201))
      .body as PedidoDaLoja;
    expect(cheio.total).toBe(50);
  });
});
