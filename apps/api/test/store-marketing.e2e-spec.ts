import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerStorage } from '@nestjs/throttler';
import { randomBytes } from 'node:crypto';
import request from 'supertest';
import type { App } from 'supertest/types';
import type {
  ConferenciaDoCupom,
  CupomDaLoja,
  DestaqueDaLoja,
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
 * Marketing (promoções, cupons e destaques) contra o banco de verdade: duas lojas,
 * cada uma vendo só as suas; a promoção e os destaques no cardápio público; o
 * preço do pedido calculado no servidor com a promoção e com o cupom; e o uso de
 * cada um contado, devolvido e disputado.
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

  const pedidoDe = (
    link: string,
    produtoId: string,
    quem: string,
    totalVisto: number,
    cupom: string | null = null,
  ) =>
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
        cupom,
      });

  /** "Aplicar cupom" na sacola de duas unidades do produto (2 x 22,50 = 45,00). */
  const aplicarCupom = (link: string, produtoId: string, quem: string, codigo: string) =>
    request(servidor())
      .post(`/public/stores/${link}/orders/coupon`)
      .set(cliente(quem))
      .send({
        cupom: codigo,
        itens: [{ produtoId, tamanhoId: null, escolhas: [], quantidade: 2 }],
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

  describe('cupons', () => {
    /** 10% em tudo, sem limite: o cupom mais simples. */
    const dezPorCento = (mudancas: object = {}) => ({
      codigo: 'BEMVINDO10',
      tipo: 'PERCENTUAL',
      percentual: 10,
      ...mudancas,
    });
    const criar = async (corpo: object, como = comoA) =>
      (
        await request(servidor())
          .post('/company/store/marketing/coupons')
          .set(como())
          .send(corpo)
          .expect(201)
      ).body as CupomDaLoja;
    const editar = (id: string, corpo: object) =>
      request(servidor()).put(`/company/store/marketing/coupons/${id}`).set(comoA()).send(corpo);
    const usosDe = async (id: string) =>
      (await prisma.storeCoupon.findUniqueOrThrow({ where: { id } })).usedCount;

    beforeAll(async () => {
      // As promoções dos testes de cima não entram na conta dos cupons.
      await prisma.storePromotion.deleteMany({ where: { company: { document: lojaA.document } } });
      await prisma.storeOrder.deleteMany({ where: { company: { document: lojaA.document } } });
    });

    it('cada loja vê, muda e apaga só os seus cupons; o mesmo código vale nas duas, sem se cruzar', async () => {
      await request(servidor()).get('/company/store/marketing/coupons').expect(401);

      const cupom = await criar(dezPorCento({ codigo: 'isolado 10', pedidoMinimo: 20 }));
      // O código vai para maiúsculas e sem espaços.
      expect(cupom).toMatchObject({ codigo: 'ISOLADO10', ativo: true, usos: 0, pedidoMinimo: 20 });

      const listaB = await request(servidor())
        .get('/company/store/marketing/coupons')
        .set(comoB())
        .expect(200);
      expect(listaB.body).toEqual([]);

      // A loja B, com o id certo do cupom de A na mão, não mexe em nada.
      const raiz = `/company/store/marketing/coupons/${cupom.id}`;
      const naoAchado = { code: 'STORE_COUPON_NOT_FOUND' };
      expect(
        (await request(servidor()).put(raiz).set(comoB()).send(dezPorCento()).expect(404)).body,
      ).toMatchObject(naoAchado);
      expect(
        (
          await request(servidor())
            .patch(`${raiz}/active`)
            .set(comoB())
            .send({ ativo: false })
            .expect(404)
        ).body,
      ).toMatchObject(naoAchado);
      expect(
        (await request(servidor()).post(`${raiz}/duplicate`).set(comoB()).expect(404)).body,
      ).toMatchObject(naoAchado);
      expect((await request(servidor()).delete(raiz).set(comoB()).expect(404)).body).toMatchObject(
        naoAchado,
      );
      expect(await prisma.storeCoupon.findUniqueOrThrow({ where: { id: cupom.id } })).toMatchObject(
        { active: true, percent: 10, code: 'ISOLADO10' },
      );

      // B cria o MESMO código: são cupons diferentes, cada um da sua loja.
      const daB = await criar(dezPorCento({ codigo: 'ISOLADO10' }), comoB);
      expect(daB.id).not.toBe(cupom.id);
      // O cupom da B não vale na loja A, e o da A não vale na B.
      await aplicarCupom(lojaA.link, lojaA.produtoId, 'cliente-a', 'ISOLADO10').expect(200);
      await prisma.storeCoupon.update({ where: { id: daB.id }, data: { code: 'SOB20' } });
      await aplicarCupom(lojaB.link, lojaB.produtoId, 'cliente-a', 'SOB20').expect(200);
      const cruzado = await aplicarCupom(lojaA.link, lojaA.produtoId, 'cliente-a', 'SOB20').expect(
        404,
      );
      expect(cruzado.body.code).toBe('STORE_COUPON_NOT_FOUND');

      // O alcance também é da loja: produto de outra empresa não entra no cupom.
      const alheio = await request(servidor())
        .post('/company/store/marketing/coupons')
        .set(comoB())
        .send(dezPorCento({ codigo: 'ALHEIO1', produtoIds: [lojaA.produtoId] }))
        .expect(409);
      expect(alheio.body.code).toBe('STORE_COUPON_TARGET_NOT_FOUND');

      // Código repetido na mesma loja, e código inválido.
      const repetido = await request(servidor())
        .post('/company/store/marketing/coupons')
        .set(comoA())
        .send(dezPorCento({ codigo: 'isolado10' }))
        .expect(409);
      expect(repetido.body.code).toBe('STORE_COUPON_CODE_TAKEN');
      await request(servidor())
        .post('/company/store/marketing/coupons')
        .set(comoA())
        .send(dezPorCento({ codigo: 'pro mo!' }))
        .expect(400);

      // Duplicar dá outro código, desligado; apagar a cópia não toca o original.
      const copia = (await request(servidor()).post(`${raiz}/duplicate`).set(comoA()).expect(201))
        .body as CupomDaLoja;
      expect(copia).toMatchObject({ codigo: 'ISOLADO10-2', ativo: false, usos: 0 });
      await request(servidor())
        .delete(`/company/store/marketing/coupons/${copia.id}`)
        .set(comoA())
        .expect(200);
      await request(servidor()).delete(raiz).set(comoA()).expect(200);
      await prisma.storeCoupon.deleteMany({ where: { company: { document: lojaB.document } } });
    });

    it('aplicar cupom devolve as regras e o desconto; o pedido sai com ele, e o uso é contado e devolvido', async () => {
      zerarLimite();
      const cupom = await criar(dezPorCento({ limitePorCliente: 1 }));

      // Aplicar: as regras do cupom e o desconto de agora, sem o que é só da loja.
      const conferencia = (
        await aplicarCupom(lojaA.link, lojaA.produtoId, 'cliente-a', 'bemvindo10').expect(200)
      ).body as ConferenciaDoCupom;
      expect(conferencia).toMatchObject({
        desconto: 4.5,
        cupom: { codigo: 'BEMVINDO10', tipo: 'PERCENTUAL', percentual: 10, valeEmPromocao: false },
      });
      const bruto = JSON.stringify(conferencia);
      for (const interno of ['usos', 'limiteDeUsos', 'limitePorCliente', 'ativo', 'companyId']) {
        expect(bruto).not.toContain(`"${interno}"`);
      }
      // Sem conta, não aplica.
      await request(servidor())
        .post(`/public/stores/${lojaA.link}/orders/coupon`)
        .send({ cupom: 'BEMVINDO10', itens: [] })
        .expect(401);
      // Aplicar não gasta uso.
      expect(await usosDe(cupom.id)).toBe(0);

      // O pedido: 2 x 22,50 = 45,00; cupom 10% = 4,50; entrega 5,00.
      const semCupom = await pedidoDe(lojaA.link, lojaA.produtoId, 'cliente-a', 50, 'BEMVINDO10');
      expect(semCupom.status).toBe(409);
      expect(semCupom.body).toMatchObject({ code: 'STORE_ORDER_TOTAL_CHANGED', total: 45.5 });

      const feito = (
        await pedidoDe(lojaA.link, lojaA.produtoId, 'cliente-a', 45.5, 'bemvindo10').expect(201)
      ).body as PedidoDaLoja;
      expect(feito).toMatchObject({
        subtotal: 45,
        taxaDeEntrega: 5,
        total: 45.5,
        cupom: { codigo: 'BEMVINDO10', desconto: 4.5 },
      });
      expect(await usosDe(cupom.id)).toBe(1);
      expect(await prisma.storeCouponRedemption.count({ where: { couponId: cupom.id } })).toBe(1);
      // O painel vê o cupom no pedido.
      const naFila = (
        (await request(servidor()).get('/company/store/orders').set(comoA()).expect(200))
          .body as PedidoDaLoja[]
      ).find((pedido) => pedido.id === feito.id);
      expect(naFila).toMatchObject({ cupom: { codigo: 'BEMVINDO10', desconto: 4.5 }, total: 45.5 });

      // O limite por cliente é dele: o mesmo cliente já usou, o outro pode.
      const denovo = await pedidoDe(lojaA.link, lojaA.produtoId, 'cliente-a', 45.5, 'BEMVINDO10');
      expect(denovo.status).toBe(409);
      expect(denovo.body).toMatchObject({
        code: 'STORE_COUPON_CUSTOMER_LIMIT',
        message: 'Você já usou este cupom.',
      });
      const recusado = await aplicarCupom(lojaA.link, lojaA.produtoId, 'cliente-a', 'BEMVINDO10');
      expect(recusado.status).toBe(409);
      expect(recusado.body.code).toBe('STORE_COUPON_CUSTOMER_LIMIT');
      const doOutro = (
        await pedidoDe(lojaA.link, lojaA.produtoId, 'cliente-b', 45.5, 'BEMVINDO10').expect(201)
      ).body as PedidoDaLoja;
      expect(await usosDe(cupom.id)).toBe(2);

      // Cancelado, o pedido devolve o uso — e o cliente pode usar de novo.
      const cancelar = (id: string) =>
        request(servidor())
          .post(`/company/store/orders/${id}/cancel`)
          .set(comoA())
          .send({ motivo: 'Cliente desistiu' });
      await cancelar(feito.id).expect(201);
      expect(await usosDe(cupom.id)).toBe(1);
      // Cancelar de novo não devolve outro.
      await cancelar(feito.id);
      expect(await usosDe(cupom.id)).toBe(1);
      expect(await prisma.storeCouponRedemption.count({ where: { couponId: cupom.id } })).toBe(1);
      const depoisDeCancelar = await pedidoDe(
        lojaA.link,
        lojaA.produtoId,
        'cliente-a',
        45.5,
        'BEMVINDO10',
      ).expect(201);
      await cancelar((depoisDeCancelar.body as PedidoDaLoja).id).expect(201);
      await cancelar(doOutro.id).expect(201);
      expect(await usosDe(cupom.id)).toBe(0);

      await request(servidor())
        .delete(`/company/store/marketing/coupons/${cupom.id}`)
        .set(comoA())
        .expect(200);
    });

    it('cupom e promoção não se somam, e cada recusa do cupom diz o que houve', async () => {
      zerarLimite();
      const cupom = await criar(dezPorCento({ codigo: 'REGRAS10' }));
      const conferir = async (status: number) => {
        const resposta = await aplicarCupom(lojaA.link, lojaA.produtoId, 'cliente-a', 'REGRAS10');
        expect(resposta.status).toBe(status);
        return resposta.body;
      };

      // Com promoção de 20% no produto, o cupom não vale junto...
      const promocao = (
        await request(servidor())
          .post('/company/store/marketing/promotions')
          .set(comoA())
          .send(vinteAoProduto())
          .expect(201)
      ).body as PromocaoDaLoja;
      expect(await conferir(409)).toMatchObject({
        code: 'STORE_COUPON_NO_ELIGIBLE_ITEMS',
        message: 'Os itens da sua sacola já estão em promoção, e este cupom não vale junto.',
      });
      // ...e o pedido também o recusa, sem gravar nada.
      const semAlcance = await pedidoDe(lojaA.link, lojaA.produtoId, 'cliente-a', 41, 'REGRAS10');
      expect(semAlcance.status).toBe(409);
      expect(semAlcance.body.code).toBe('STORE_COUPON_NO_ELIGIBLE_ITEMS');
      expect(await usosDe(cupom.id)).toBe(0);

      // Ligado o "vale em promoção", desconta sobre o que o cliente já paga:
      // 2 x (22,50 - 20%) = 36,00; 10% = 3,60.
      expect(
        (
          await editar(cupom.id, dezPorCento({ codigo: 'REGRAS10', valeEmPromocao: true })).expect(
            200,
          )
        ).body,
      ).toMatchObject({ valeEmPromocao: true });
      expect(await conferir(200)).toMatchObject({ desconto: 3.6 });
      const somados = (
        await pedidoDe(lojaA.link, lojaA.produtoId, 'cliente-a', 37.4, 'REGRAS10').expect(201)
      ).body as PedidoDaLoja;
      expect(somados).toMatchObject({
        subtotal: 36,
        cupom: { desconto: 3.6 },
        total: 37.4,
      });
      expect(somados.itens[0]!.promocao).toMatchObject({ id: promocao.id });

      // Sem a promoção, o cupom volta ao valor cheio; o teto do desconto e o mínimo valem.
      await request(servidor())
        .delete(`/company/store/marketing/promotions/${promocao.id}`)
        .set(comoA())
        .expect(200);
      await editar(cupom.id, dezPorCento({ codigo: 'REGRAS10', descontoMaximo: 2 })).expect(200);
      expect(await conferir(200)).toMatchObject({ desconto: 2 });
      await editar(cupom.id, dezPorCento({ codigo: 'REGRAS10', pedidoMinimo: 100 })).expect(200);
      expect(await conferir(409)).toMatchObject({
        code: 'STORE_COUPON_BELOW_MINIMUM',
        message: 'Faltam R$ 55,00 em itens para usar este cupom (pedido mínimo de R$ 100,00).',
      });
      // O cupom que não alcança o produto da sacola.
      await editar(
        cupom.id,
        dezPorCento({ codigo: 'REGRAS10', produtoIds: [], categoriaIds: [lojaA.secaoId] }),
      ).expect(200);
      expect(await conferir(200)).toMatchObject({ desconto: 4.5 });
      const outraSecao = await request(servidor())
        .post('/company/store/categories')
        .set(comoA())
        .send({ name: 'Bebidas' })
        .expect(201);
      await editar(
        cupom.id,
        dezPorCento({ codigo: 'REGRAS10', categoriaIds: [outraSecao.body.id as string] }),
      ).expect(200);
      expect(await conferir(409)).toMatchObject({
        code: 'STORE_COUPON_NO_ELIGIBLE_ITEMS',
        message: 'Este cupom não vale para os itens da sua sacola.',
      });

      // As datas, o desligado e o esgotado, cada um com a sua frase.
      const ontem = '2020-01-01';
      await editar(cupom.id, dezPorCento({ codigo: 'REGRAS10', fim: ontem })).expect(200);
      expect(await conferir(409)).toMatchObject({
        code: 'STORE_COUPON_EXPIRED',
        message: 'Este cupom venceu em 01/01/2020.',
      });
      await editar(cupom.id, dezPorCento({ codigo: 'REGRAS10', inicio: '2999-12-31' })).expect(200);
      expect(await conferir(409)).toMatchObject({
        code: 'STORE_COUPON_NOT_STARTED',
        message: 'Este cupom vale a partir de 31/12/2999.',
      });
      await editar(cupom.id, dezPorCento({ codigo: 'REGRAS10', ativo: false })).expect(200);
      expect(await conferir(409)).toMatchObject({ code: 'STORE_COUPON_INACTIVE' });
      await editar(cupom.id, dezPorCento({ codigo: 'REGRAS10', limiteDeUsos: 1 })).expect(200);
      await prisma.storeCoupon.update({ where: { id: cupom.id }, data: { usedCount: 1 } });
      expect(await conferir(409)).toMatchObject({ code: 'STORE_COUPON_EXHAUSTED' });
      await request(servidor())
        .delete(`/company/store/marketing/coupons/${cupom.id}`)
        .set(comoA())
        .expect(200);
    });

    it('com um uso só, dois pedidos ao mesmo tempo: um leva o cupom, o outro é recusado', async () => {
      zerarLimite();
      const cupom = await criar(dezPorCento({ codigo: 'CORRIDA1', limiteDeUsos: 1 }));

      const [um, outro] = await Promise.all([
        pedidoDe(lojaA.link, lojaA.produtoId, 'cliente-a', 45.5, 'CORRIDA1'),
        pedidoDe(lojaA.link, lojaA.produtoId, 'cliente-b', 45.5, 'CORRIDA1'),
      ]);

      expect([um.status, outro.status].sort()).toEqual([201, 409]);
      const recusado = um.status === 409 ? um : outro;
      // Perdeu na gravação (o uso acabou no meio) ou já nem via mais o cupom.
      expect(['STORE_COUPON_UNAVAILABLE', 'STORE_COUPON_EXHAUSTED']).toContain(recusado.body.code);
      expect(await usosDe(cupom.id)).toBe(1);
      expect(await prisma.storeCouponRedemption.count({ where: { couponId: cupom.id } })).toBe(1);
      await request(servidor())
        .delete(`/company/store/marketing/coupons/${cupom.id}`)
        .set(comoA())
        .expect(200);
    });

    it('o mesmo cliente com dois pedidos ao mesmo tempo não fura o limite por cliente', async () => {
      zerarLimite();
      const cupom = await criar(dezPorCento({ codigo: 'CORRIDA2', limitePorCliente: 1 }));

      const respostas = await Promise.all([
        pedidoDe(lojaA.link, lojaA.produtoId, 'cliente-a', 45.5, 'CORRIDA2'),
        pedidoDe(lojaA.link, lojaA.produtoId, 'cliente-a', 45.5, 'CORRIDA2'),
      ]);

      expect(respostas.map((resposta) => resposta.status).sort()).toEqual([201, 409]);
      const recusada = respostas.find((resposta) => resposta.status === 409)!;
      expect(recusada.body.code).toBe('STORE_COUPON_CUSTOMER_LIMIT');
      expect(await usosDe(cupom.id)).toBe(1);
      expect(await prisma.storeCouponRedemption.count({ where: { couponId: cupom.id } })).toBe(1);
      await request(servidor())
        .delete(`/company/store/marketing/coupons/${cupom.id}`)
        .set(comoA())
        .expect(200);
    });
  });

  describe('destaques', () => {
    const raiz = '/company/store/marketing/highlights';
    let sucoId = '';

    const criar = async (corpo: object, como = comoA, status = 201) =>
      (await request(servidor()).post(raiz).set(como()).send(corpo).expect(status))
        .body as DestaqueDaLoja;
    const lista = async (como = comoA) =>
      (await request(servidor()).get(raiz).set(como()).expect(200)).body as DestaqueDaLoja[];
    const vitrine = async (link: string) => (await vitrineDe(link)).destaques ?? [];

    beforeAll(async () => {
      // A loja A ganha um segundo produto, para a ordem dentro do destaque ter o que ordenar.
      const suco = await request(servidor())
        .post('/company/store/products')
        .set(comoA())
        .send({
          categoryId: lojaA.secaoId,
          name: 'Suco',
          description: '',
          price: 8,
          status: 'PUBLISHED',
          sizes: [],
          optionGroups: [],
        })
        .expect(201);
      sucoId = (suco.body as StoreProduct).id;
      await prisma.storeHighlight.deleteMany({ where: { company: { document: lojaA.document } } });
    });

    it('cada loja vê, muda, reordena e apaga só os seus destaques; a outra recebe "não encontrado"', async () => {
      await request(servidor()).get(raiz).expect(401);

      const um = await criar({ titulo: 'Mais pedidos', produtoIds: [sucoId, lojaA.produtoId] });
      const dois = await criar({ titulo: 'Novidades', produtoIds: [lojaA.produtoId] });
      // O destaque nasce ligado, no fim da fila, com os produtos na ordem em que a loja os pôs.
      expect(um).toMatchObject({
        titulo: 'Mais pedidos',
        produtoIds: [sucoId, lojaA.produtoId],
        ativo: true,
        posicao: 0,
      });
      expect(dois.posicao).toBe(1);

      // A loja B não vê nada, e com os ids certos na mão não mexe em nada.
      expect(await lista(comoB)).toEqual([]);
      const naoAchado = { code: 'STORE_HIGHLIGHT_NOT_FOUND' };
      const corpoDaB = { titulo: 'Da B', produtoIds: [lojaB.produtoId] };
      expect(
        (await request(servidor()).put(`${raiz}/${um.id}`).set(comoB()).send(corpoDaB).expect(404))
          .body,
      ).toMatchObject(naoAchado);
      expect(
        (
          await request(servidor())
            .patch(`${raiz}/${um.id}/active`)
            .set(comoB())
            .send({ ativo: false })
            .expect(404)
        ).body,
      ).toMatchObject(naoAchado);
      expect(
        (await request(servidor()).post(`${raiz}/${um.id}/duplicate`).set(comoB()).expect(404))
          .body,
      ).toMatchObject(naoAchado);
      expect(
        (await request(servidor()).delete(`${raiz}/${um.id}`).set(comoB()).expect(404)).body,
      ).toMatchObject(naoAchado);
      // A B tampouco reordena os da A: a lista que ela manda não é a dela.
      const alheia = await request(servidor())
        .put(`${raiz}/order`)
        .set(comoB())
        .send({ ids: [dois.id, um.id] })
        .expect(409);
      expect(alheia.body.code).toBe('STORE_HIGHLIGHT_ORDER_STALE');
      expect((await lista()).map((item) => [item.titulo, item.posicao])).toEqual([
        ['Mais pedidos', 0],
        ['Novidades', 1],
      ]);

      // Produto de outra loja não entra no destaque (e responde igual a um id que não existe).
      const produtoAlheio = await request(servidor())
        .post(raiz)
        .set(comoB())
        .send({ titulo: 'Roubo', produtoIds: [lojaA.produtoId] })
        .expect(409);
      expect(produtoAlheio.body.code).toBe('STORE_HIGHLIGHT_PRODUCT_NOT_FOUND');
      await request(servidor())
        .put(`${raiz}/${um.id}`)
        .set(comoA())
        .send({ titulo: 'Mais pedidos', produtoIds: [lojaB.produtoId] })
        .expect(409);
      expect((await lista())[0]!.produtoIds).toEqual([sucoId, lojaA.produtoId]);
      expect(
        await prisma.storeHighlight.count({ where: { company: { document: lojaB.document } } }),
      ).toBe(0);

      // Os dados chegam validados.
      await request(servidor())
        .post(raiz)
        .set(comoA())
        .send({ titulo: 'Sem produto', produtoIds: [] })
        .expect(400);
      await request(servidor())
        .post(raiz)
        .set(comoA())
        .send({ titulo: 'X', produtoIds: [sucoId] })
        .expect(400);

      // Reordenar: a ordem inteira, e a lista devolvida já vem nela.
      const reordenada = await request(servidor())
        .put(`${raiz}/order`)
        .set(comoA())
        .send({ ids: [dois.id, um.id] })
        .expect(200);
      expect((reordenada.body as DestaqueDaLoja[]).map((item) => item.titulo)).toEqual([
        'Novidades',
        'Mais pedidos',
      ]);
      expect((await lista()).map((item) => item.titulo)).toEqual(['Novidades', 'Mais pedidos']);
      // Uma lista velha (falta um) é recusada e não desfaz nada.
      const velha = await request(servidor())
        .put(`${raiz}/order`)
        .set(comoA())
        .send({ ids: [um.id] })
        .expect(409);
      expect(velha.body.code).toBe('STORE_HIGHLIGHT_ORDER_STALE');
      expect((await lista()).map((item) => item.titulo)).toEqual(['Novidades', 'Mais pedidos']);

      // Editar mantém a posição; duplicar cria desligado, no fim.
      const editado = await request(servidor())
        .put(`${raiz}/${um.id}`)
        .set(comoA())
        .send({ titulo: 'Campeões', produtoIds: [lojaA.produtoId, sucoId], fim: '2999-12-31' })
        .expect(200);
      expect(editado.body).toMatchObject({
        titulo: 'Campeões',
        produtoIds: [lojaA.produtoId, sucoId],
        fim: '2999-12-31',
        posicao: 1,
      });
      const copia = (
        await request(servidor()).post(`${raiz}/${um.id}/duplicate`).set(comoA()).expect(201)
      ).body as DestaqueDaLoja;
      expect(copia).toMatchObject({ titulo: 'Campeões (cópia)', ativo: false, posicao: 2 });
      await request(servidor()).delete(`${raiz}/${copia.id}`).set(comoA()).expect(200);
    });

    it('a página pública mostra só os destaques ligados e que não acabaram, na ordem da loja, sem dado interno', async () => {
      const antes = await lista();
      const [novidades, campeoes] = antes;
      expect(antes.map((item) => item.titulo)).toEqual(['Novidades', 'Campeões']);

      const publicos = await vitrine(lojaA.link);
      expect(publicos.map((item) => item.titulo)).toEqual(['Novidades', 'Campeões']);
      expect(publicos[1]).toMatchObject({
        produtoIds: [lojaA.produtoId, sucoId],
        inicio: null,
        fim: '2999-12-31',
      });
      // O que é só da loja não vai para o cliente.
      const bruto = JSON.stringify(publicos);
      for (const interno of ['ativo', 'posicao', 'companyId', 'criadoEm']) {
        expect(bruto).not.toContain(`"${interno}"`);
      }
      expect(await vitrine(lojaB.link)).toEqual([]);

      // Desligado, sai da página; ligado, volta.
      await request(servidor())
        .patch(`${raiz}/${novidades!.id}/active`)
        .set(comoA())
        .send({ ativo: false })
        .expect(200);
      expect((await vitrine(lojaA.link)).map((item) => item.titulo)).toEqual(['Campeões']);
      await request(servidor())
        .patch(`${raiz}/${novidades!.id}/active`)
        .set(comoA())
        .send({ ativo: true })
        .expect(200);

      // A ordem que a loja escolhe é a da página.
      await request(servidor())
        .put(`${raiz}/order`)
        .set(comoA())
        .send({ ids: [campeoes!.id, novidades!.id] })
        .expect(200);
      expect((await vitrine(lojaA.link)).map((item) => item.titulo)).toEqual([
        'Campeões',
        'Novidades',
      ]);

      // O que já acabou não vai para a página; o que ainda não começou vai (a página o esconde até a data).
      await request(servidor())
        .put(`${raiz}/${novidades!.id}`)
        .set(comoA())
        .send({ titulo: 'Novidades', produtoIds: [lojaA.produtoId], fim: '2020-01-01' })
        .expect(200);
      expect((await vitrine(lojaA.link)).map((item) => item.titulo)).toEqual(['Campeões']);
      await request(servidor())
        .put(`${raiz}/${novidades!.id}`)
        .set(comoA())
        .send({ titulo: 'Novidades', produtoIds: [lojaA.produtoId], inicio: '2999-01-01' })
        .expect(200);
      expect((await vitrine(lojaA.link)).map((item) => [item.titulo, item.inicio])).toEqual([
        ['Campeões', null],
        ['Novidades', '2999-01-01'],
      ]);
    });

    it('apagar o produto não apaga o destaque: o id que sumiu simplesmente não conta', async () => {
      const [primeiro] = await lista();
      const antes = await vitrine(lojaA.link);
      expect(antes.length).toBeGreaterThan(0);

      await prisma.storeProduct.delete({ where: { id: sucoId } });

      // O destaque continua lá, com o id que sumiu; a página filtra pelos produtos à venda.
      expect(await prisma.storeHighlight.count({ where: { id: primeiro!.id } })).toBe(1);
      const depois = await vitrine(lojaA.link);
      expect(depois.map((item) => item.titulo)).toEqual(antes.map((item) => item.titulo));
      expect(JSON.stringify(depois)).toContain(sucoId);
    });

    it('a loja tem no máximo dez destaques', async () => {
      await prisma.storeHighlight.deleteMany({ where: { company: { document: lojaA.document } } });
      for (let n = 1; n <= 10; n += 1) {
        await criar({ titulo: `Destaque ${n}`, produtoIds: [lojaA.produtoId] });
      }

      const recusado = await request(servidor())
        .post(raiz)
        .set(comoA())
        .send({ titulo: 'Um a mais', produtoIds: [lojaA.produtoId] })
        .expect(409);
      expect(recusado.body.code).toBe('STORE_HIGHLIGHT_LIMIT');
      // O limite é da loja: a B ainda cria.
      await criar({ titulo: 'Da B', produtoIds: [lojaB.produtoId] }, comoB);
      await prisma.storeHighlight.deleteMany({ where: { company: { document: lojaB.document } } });
    });
  });
});
