import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerStorage } from '@nestjs/throttler';
import { randomBytes, randomUUID } from 'node:crypto';
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
 * O combo, contra o banco de verdade: cadastrar (e o que a API recusa), aparecer na página com o que
 * leva, sair da página quando um produto dele sai do ar, ser pedido pelo preço do combo, baixar e
 * devolver o estoque dos produtos que leva, e não receber promoção.
 *
 * O login do cliente (Firebase), o Google e o Web Push são simulados.
 */

const suffix = String(Date.now()).slice(-8);
const loja = {
  email: `combo.${suffix}@example.com`,
  document: `506${suffix}`,
  nome: 'Combo E2E',
  link: `combo-${suffix}`,
  token: '',
  secaoId: '',
};

const SEMPRE_ABERTA = [0, 1, 2, 3, 4, 5, 6].map((dia) => ({
  dia,
  faixas: [{ abre: '00:00', fecha: '00:00' }],
}));

type ItemDoCombo = { productId: string; sizeId: string | null; quantity: number };

describe('Combos da loja (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let regiaoCriada: string | null = null;

  const servidor = () => app.getHttpServer();
  const comoLoja = () => ({ Authorization: `Bearer ${loja.token}` });
  const cliente = (quem: string) => ({ Authorization: `Bearer ${quem}` });
  const zerarLimite = () =>
    (app.get(ThrottlerStorage) as unknown as { storage: Map<string, unknown> }).storage.clear();

  /** O produto de preço único; `stock` ausente é sem controle. */
  const corpoDoProduto = (mudancas: object = {}): Record<string, unknown> => ({
    categoryId: loja.secaoId,
    name: 'Hambúrguer',
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
  const corpoDoCombo = (itens: ItemDoCombo[], mudancas: object = {}): Record<string, unknown> => ({
    ...corpoDoProduto({ name: 'Combo', price: 18 }),
    kind: 'COMBO',
    comboItems: itens,
    ...mudancas,
  });
  const postarCombo = (itens: ItemDoCombo[], mudancas: object = {}) =>
    request(servidor())
      .post('/company/store/products')
      .set(comoLoja())
      .send(corpoDoCombo(itens, mudancas));
  const criarCombo = async (itens: ItemDoCombo[], mudancas: object = {}) =>
    (await postarCombo(itens, mudancas).expect(201)).body as StoreProduct;
  const situacao = (id: string, status: 'PUBLISHED' | 'PAUSED' | 'DRAFT') =>
    request(servidor())
      .put(`/company/store/products/${id}/status`)
      .set(comoLoja())
      .send({ status });

  const estoqueNoBanco = async (id: string) =>
    (await prisma.storeProduct.findUniqueOrThrow({ where: { id } })).stock;
  const pagina = async () =>
    (
      (await request(servidor()).get(`/public/stores/${loja.link}`).expect(200)).body as Extract<
        PublicStoreLookup,
        { kind: 'store' }
      >
    ).store;
  const daPagina = async (id: string) => (await pagina()).products.find((p) => p.id === id);

  /** Pede `linhas` (produto e quantidade), cada uma com o preço unitário que a página mostrou; entrega de R$ 5,00. */
  const pedir = (
    linhas: Array<{ produtoId: string; quantidade: number; preco: number }>,
    quem = 'cliente-a',
    mudancas: object = {},
  ) =>
    request(servidor())
      .post(`/public/stores/${loja.link}/orders`)
      .set(cliente(quem))
      .send({
        modalidade: 'ENTREGA',
        itens: linhas.map((linha) => ({
          produtoId: linha.produtoId,
          tamanhoId: null,
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
        totalVisto: linhas.reduce((soma, l) => soma + l.preco * l.quantidade, 0) + 5,
        cupom: null,
        ...mudancas,
      });
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
      .send({ name: 'Lanches' })
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

  it('o combo se cadastra com o que leva, o painel o vê, e a página o mostra com a economia e sem nada interno', async () => {
    const burger = await criarProduto({ name: 'X-Burger', price: 10 });
    const batata = await criarProduto({
      name: 'Batata',
      price: null,
      sizes: [
        { name: 'Média', price: 6, available: true },
        { name: 'Grande', price: 9, available: true },
      ],
    });
    const refri = await criarProduto({ name: 'Refri', price: 5 });
    const [media] = batata.sizes;

    const combo = await criarCombo(
      [
        { productId: burger.id, sizeId: null, quantity: 1 },
        { productId: batata.id, sizeId: media!.id, quantity: 1 },
        { productId: refri.id, sizeId: null, quantity: 1 },
      ],
      { name: 'Combo Clássico', price: 18 },
    );

    expect(combo).toMatchObject({ kind: 'COMBO', price: 18, stock: null, sizes: [] });
    expect(combo.comboItems).toEqual([
      { productId: burger.id, sizeId: null, quantity: 1 },
      { productId: batata.id, sizeId: media!.id, quantity: 1 },
      { productId: refri.id, sizeId: null, quantity: 1 },
    ]);

    const catalogo = (
      await request(servidor()).get('/company/store/catalog').set(comoLoja()).expect(200)
    ).body as StoreCatalog;
    expect(catalogo.products.find((p) => p.id === combo.id)).toMatchObject({ kind: 'COMBO' });
    expect(catalogo.products.find((p) => p.id === burger.id)).toMatchObject({
      kind: 'PRODUCT',
      comboItems: [],
    });

    // Os itens separados custam 10 + 6 + 5 = 21, e o combo sai por 18.
    const naPagina = await daPagina(combo.id);
    expect(naPagina).toMatchObject({
      kind: 'COMBO',
      price: 18,
      esgotado: false,
      restam: null,
      combo: {
        itens: [
          { produtoId: burger.id, nome: 'X-Burger', tamanho: null, quantidade: 1 },
          { produtoId: batata.id, nome: 'Batata', tamanho: 'Média', quantidade: 1 },
          { produtoId: refri.id, nome: 'Refri', tamanho: null, quantidade: 1 },
        ],
        valorSeparado: 21,
      },
    });
    expect(await daPagina(burger.id)).toMatchObject({ kind: 'PRODUCT', combo: null });
    const bruto = JSON.stringify(naPagina);
    expect(bruto).not.toContain('"stock"');
    expect(bruto).not.toContain('"comboItems"');
  });

  it('a API recusa o combo mal montado, e o tipo não muda depois de criado', async () => {
    const burger = await criarProduto({ name: 'Produto A' });
    const batata = await criarProduto({
      name: 'Produto B',
      price: null,
      sizes: [{ name: 'Único', price: 7, available: true }],
    });
    const exigente = await criarProduto({
      name: 'Produto C',
      optionGroups: [
        {
          name: 'Ponto',
          minChoices: 1,
          maxChoices: 1,
          options: [{ name: 'Ao ponto', price: 0, available: true }],
        },
      ],
    });
    const item = (produto: StoreProduct, sizeId: string | null = null) => ({
      productId: produto.id,
      sizeId,
      quantity: 1,
    });
    const recusa = async (corpo: request.Test, code?: string) => {
      const resposta = await corpo;
      expect(resposta.status).toBe(400);
      if (code) expect(resposta.body).toMatchObject({ code });
    };

    // Tamanhos e estoque próprios não existem no combo.
    await recusa(
      postarCombo([item(burger)], { sizes: [{ name: 'G', price: 20, available: true }] }),
    );
    await recusa(postarCombo([item(burger)], { stock: 10 }));
    // O mesmo produto duas vezes.
    await recusa(postarCombo([item(burger), item(burger)]));
    // Produto que não existe (ou que é de outra loja: a resposta é a mesma).
    await recusa(
      postarCombo([{ productId: randomUUID(), sizeId: null, quantity: 1 }]),
      'STORE_COMBO_ITEM_INVALID',
    );
    // Produto com tamanhos pede o tamanho; sem tamanhos, não aceita um.
    await recusa(postarCombo([item(batata)]), 'STORE_COMBO_ITEM_INVALID');
    await recusa(postarCombo([item(burger, randomUUID())]), 'STORE_COMBO_ITEM_INVALID');
    // O que exige escolhas do cliente não se fixa num combo.
    await recusa(postarCombo([item(exigente)]), 'STORE_COMBO_ITEM_INVALID');
    // Um combo não leva outro combo.
    const outro = await criarCombo([item(burger)], { name: 'Combo Um' });
    await recusa(postarCombo([item(outro)]), 'STORE_COMBO_ITEM_INVALID');

    // Só o combo leva itens.
    await request(servidor())
      .post('/company/store/products')
      .set(comoLoja())
      .send({ ...corpoDoProduto(), comboItems: [item(burger)] })
      .expect(400);

    // O tipo não muda: nem o combo vira produto, nem o produto vira combo.
    const raiz = `/company/store/products/${outro.id}`;
    const { kind: _tipo, comboItems: _itens, ...comoProduto } = corpoDoCombo([item(burger)]);
    const travado = await request(servidor())
      .put(raiz)
      .set(comoLoja())
      .send(comoProduto)
      .expect(409);
    expect(travado.body).toMatchObject({ code: 'STORE_PRODUCT_KIND_LOCKED' });
    const viraCombo = await request(servidor())
      .put(`/company/store/products/${burger.id}`)
      .set(comoLoja())
      .send(corpoDoCombo([item(batata, batata.sizes[0]!.id)]))
      .expect(409);
    expect(viraCombo.body).toMatchObject({ code: 'STORE_PRODUCT_KIND_LOCKED' });

    // Editar troca a lista inteira de itens.
    const editado = await request(servidor())
      .put(raiz)
      .set(comoLoja())
      .send(
        corpoDoCombo([{ ...item(burger), quantity: 3 }, item(batata, batata.sizes[0]!.id)], {
          name: 'Combo Um',
        }),
      )
      .expect(200);
    expect((editado.body as StoreProduct).comboItems).toEqual([
      { productId: burger.id, sizeId: null, quantity: 3 },
      { productId: batata.id, sizeId: batata.sizes[0]!.id, quantity: 1 },
    ]);
    expect(await prisma.storeComboItem.count({ where: { comboId: outro.id } })).toBe(2);
  });

  it('produto pausado ou apagado tira o combo da página, e ele volta quando o produto volta', async () => {
    const burger = await criarProduto({ name: 'Sai e volta' });
    const combo = await criarCombo([{ productId: burger.id, sizeId: null, quantity: 1 }], {
      name: 'Combo Sai e Volta',
    });
    expect(await daPagina(combo.id)).toBeDefined();

    await situacao(burger.id, 'PAUSED').expect(200);
    expect(await daPagina(combo.id)).toBeUndefined();
    // O combo, em si, segue no ar no painel: quem o tira da página é o item pausado.
    const noPainel = (
      await request(servidor()).get('/company/store/catalog').set(comoLoja()).expect(200)
    ).body as StoreCatalog;
    expect(noPainel.products.find((p) => p.id === combo.id)).toMatchObject({ status: 'PUBLISHED' });

    await situacao(burger.id, 'PUBLISHED').expect(200);
    expect(await daPagina(combo.id)).toBeDefined();

    // Publicar (ou voltar a vender) um combo com item fora do ar é recusado.
    await situacao(combo.id, 'PAUSED').expect(200);
    await situacao(burger.id, 'PAUSED').expect(200);
    const recusado = await situacao(combo.id, 'PUBLISHED').expect(400);
    expect(recusado.body).toMatchObject({ code: 'STORE_PRODUCT_NOT_PUBLISHABLE' });
    await situacao(burger.id, 'PUBLISHED').expect(200);
    await situacao(combo.id, 'PUBLISHED').expect(200);

    // Apagar o produto: o combo continua cadastrado, mas fora da página.
    await request(servidor())
      .delete(`/company/store/products/${burger.id}`)
      .set(comoLoja())
      .expect(200);
    expect(await daPagina(combo.id)).toBeUndefined();
    expect(await prisma.storeComboItem.count({ where: { comboId: combo.id } })).toBe(1);
  });

  it('o combo é vendido pelo preço dele, baixa o estoque de cada produto que leva, e o cancelamento devolve uma vez', async () => {
    zerarLimite();
    const hamb = await criarProduto({ name: 'Hamb estoque', stock: 4 });
    const suco = await criarProduto({ name: 'Suco estoque', stock: 9 });
    const livre = await criarProduto({ name: 'Livre' });
    // 1 hambúrguer e 2 sucos, mais um item sem controle, por 20.
    const combo = await criarCombo(
      [
        { productId: hamb.id, sizeId: null, quantity: 1 },
        { productId: suco.id, sizeId: null, quantity: 2 },
        { productId: livre.id, sizeId: null, quantity: 1 },
      ],
      { name: 'Combo Duplo', price: 20 },
    );
    // O que mais limita manda: 4 hambúrgueres dão 4 combos; 9 sucos, dois por combo, dão 4.
    expect(await daPagina(combo.id)).toMatchObject({ esgotado: false, restam: 4 });

    const primeiro = (await pedir([{ produtoId: combo.id, quantidade: 3, preco: 20 }]).expect(201))
      .body as PedidoDaLoja;

    expect(primeiro).toMatchObject({ subtotal: 60, total: 65 });
    expect(primeiro.itens[0]).toMatchObject({
      produtoId: combo.id,
      nome: 'Combo Duplo',
      quantidade: 3,
      unitario: 20,
      total: 60,
      combo: [
        { produtoId: hamb.id, nome: 'Hamb estoque', quantidade: 1, baixouEstoque: true },
        { produtoId: suco.id, nome: 'Suco estoque', quantidade: 2, baixouEstoque: true },
        { produtoId: livre.id, nome: 'Livre', quantidade: 1 },
      ],
    });
    expect(primeiro.itens[0]).not.toHaveProperty('baixouEstoque');
    // 3 combos: 3 hambúrgueres e 6 sucos saíram; o item sem controle continua sem número.
    expect(await estoqueNoBanco(hamb.id)).toBe(1);
    expect(await estoqueNoBanco(suco.id)).toBe(3);
    expect(await estoqueNoBanco(livre.id)).toBeNull();
    expect(await estoqueNoBanco(combo.id)).toBeNull();
    expect(await daPagina(combo.id)).toMatchObject({ esgotado: false, restam: 1 });

    // Dois combos é mais do que dá: recusa em nome do combo, e nada muda.
    const passou = await pedir([{ produtoId: combo.id, quantidade: 2, preco: 20 }]);
    expect(passou.status).toBe(409);
    expect(passou.body).toMatchObject({
      code: 'STORE_ORDER_OUT_OF_STOCK',
      produtoId: combo.id,
      restam: 1,
    });
    expect(passou.body.message).toContain('Combo Duplo');
    expect(await estoqueNoBanco(hamb.id)).toBe(1);
    expect(await estoqueNoBanco(suco.id)).toBe(3);

    // O último combo leva tudo, e a página passa a dizer "esgotado".
    const segundo = (
      await pedir([{ produtoId: combo.id, quantidade: 1, preco: 20 }], 'cliente-b').expect(201)
    ).body as PedidoDaLoja;
    expect(await estoqueNoBanco(hamb.id)).toBe(0);
    expect(await estoqueNoBanco(suco.id)).toBe(1);
    expect(await daPagina(combo.id)).toMatchObject({ esgotado: true, restam: null });
    const esgotou = await pedir([{ produtoId: combo.id, quantidade: 1, preco: 20 }]);
    expect(esgotou.status).toBe(409);
    expect(esgotou.body.message).toContain('esgotou');

    // O combo e o produto avulso dividem o estoque do mesmo produto.
    const avulso = await pedir([{ produtoId: hamb.id, quantidade: 1, preco: 10 }]);
    expect(avulso.status).toBe(409);

    // Cancelado o primeiro pedido, voltam 3 hambúrgueres e 6 sucos — uma vez só.
    await cancelar(primeiro.id).expect(201);
    expect(await estoqueNoBanco(hamb.id)).toBe(3);
    expect(await estoqueNoBanco(suco.id)).toBe(7);
    await cancelar(primeiro.id);
    expect(await estoqueNoBanco(hamb.id)).toBe(3);
    expect(await estoqueNoBanco(suco.id)).toBe(7);
    await cancelar(segundo.id).expect(201);
    expect(await estoqueNoBanco(hamb.id)).toBe(4);
    expect(await estoqueNoBanco(suco.id)).toBe(9);
    expect(await daPagina(combo.id)).toMatchObject({ esgotado: false, restam: 4 });
  });

  it('o preço do combo que a página mostrou é o que vale: outro total é recusado', async () => {
    zerarLimite();
    const burger = await criarProduto({ name: 'Preço fixo' });
    const combo = await criarCombo([{ productId: burger.id, sizeId: null, quantity: 1 }], {
      name: 'Combo Preço',
      price: 8,
    });

    const errado = await pedir([{ produtoId: combo.id, quantidade: 1, preco: 10 }]);

    expect(errado.status).toBe(409);
    expect(errado.body).toMatchObject({ code: 'STORE_ORDER_TOTAL_CHANGED' });
  });

  it('com o último combo, dois pedidos ao mesmo tempo: um leva, o outro é recusado, e o estoque não fica negativo', async () => {
    zerarLimite();
    const unico = await criarProduto({ name: 'Último item', stock: 2 });
    // O combo leva 2 do item: com 2 no estoque, cabe um combo só.
    const combo = await criarCombo([{ productId: unico.id, sizeId: null, quantity: 2 }], {
      name: 'Combo Último',
      price: 15,
    });

    const [um, outro] = await Promise.all([
      pedir([{ produtoId: combo.id, quantidade: 1, preco: 15 }], 'cliente-a'),
      pedir([{ produtoId: combo.id, quantidade: 1, preco: 15 }], 'cliente-b'),
    ]);

    expect([um.status, outro.status].sort()).toEqual([201, 409]);
    expect((um.status === 409 ? um : outro).body.code).toBe('STORE_ORDER_OUT_OF_STOCK');
    expect(await estoqueNoBanco(unico.id)).toBe(0);
    expect(
      await prisma.storeOrder.count({
        where: {
          company: { document: loja.document },
          items: { path: ['0', 'produtoId'], equals: combo.id },
        },
      }),
    ).toBe(1);
  });

  it('promoção não age no combo — nem a da seção dele —, e não se cria promoção sobre um combo', async () => {
    zerarLimite();
    const secao = (
      await request(servidor())
        .post('/company/store/categories')
        .set(comoLoja())
        .send({ name: 'Promo' })
        .expect(201)
    ).body as { id: string };
    const burger = await criarProduto({ name: 'Burger promo', categoryId: secao.id, price: 10 });
    const combo = await criarCombo([{ productId: burger.id, sizeId: null, quantity: 1 }], {
      name: 'Combo promo',
      categoryId: secao.id,
      price: 18,
    });

    // 50% em toda a seção: o produto cai, o combo não.
    await request(servidor())
      .post('/company/store/marketing/promotions')
      .set(comoLoja())
      .send({
        nome: 'Seção 50%',
        tipo: 'PERCENTUAL',
        alvo: 'CATEGORIA',
        categoriaId: secao.id,
        percentual: 50,
      })
      .expect(201);
    const feito = (
      await pedir(
        [
          { produtoId: burger.id, quantidade: 1, preco: 5 },
          { produtoId: combo.id, quantidade: 1, preco: 18 },
        ],
        'cliente-a',
      ).expect(201)
    ).body as PedidoDaLoja;

    const [doBurger, doCombo] = feito.itens;
    expect(doBurger).toMatchObject({ total: 5, promocao: { desconto: 5 } });
    expect(doCombo).toMatchObject({ total: 18 });
    expect(doCombo).not.toHaveProperty('promocao');
    expect(feito.subtotal).toBe(23);

    // A página também não mostra o combo com oferta: o preço é o do combo, e nada a riscar.
    expect(await daPagina(combo.id)).toMatchObject({ price: 18 });

    // E promoção sobre o combo, direto, é recusada.
    const alvo = await request(servidor())
      .post('/company/store/marketing/promotions')
      .set(comoLoja())
      .send({
        nome: 'Sobre o combo',
        tipo: 'PERCENTUAL',
        alvo: 'PRODUTO',
        produtoId: combo.id,
        percentual: 10,
      })
      .expect(409);
    expect(alvo.body).toMatchObject({ code: 'STORE_PROMOTION_TARGET_IS_COMBO' });
  });
});
