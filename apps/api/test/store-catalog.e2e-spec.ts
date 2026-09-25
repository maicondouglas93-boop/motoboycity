import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import type { StoreCatalog, StoreProduct } from '@motoboycity/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * O catálogo da loja online contra o banco de verdade. O teste de unidade
 * simula o Prisma; aqui o que se confere é o que só o banco responde: a edição
 * que mantém, cria e apaga itens numa transação, a restrição que segura a
 * categoria com produto, e uma empresa sem enxergar a outra.
 */

const suffix = String(Date.now()).slice(-8);
const password = 'senhaSegura123';
const companies = [
  {
    email: `loja.a.${suffix}@example.com`,
    document: `301${suffix}`.slice(0, 11),
    tradeName: 'Loja A',
  },
  {
    email: `loja.b.${suffix}@example.com`,
    document: `302${suffix}`.slice(0, 11),
    tradeName: 'Loja B',
  },
];

describe('StoreCatalogController (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const tokens: string[] = [];
  let regiaoCriada: string | null = null;

  const comoA = () => ({ Authorization: `Bearer ${tokens[0]}` });
  const comoB = () => ({ Authorization: `Bearer ${tokens[1]}` });

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    prisma = module.get(PrismaService);
    await app.init();

    // O cadastro de empresa exige uma região ativa. Num banco vazio, cria uma
    // e a remove no fim.
    if (!(await prisma.region.findFirst({ where: { active: true } }))) {
      regiaoCriada = (await prisma.region.create({ data: { name: `Região E2E ${suffix}` } })).id;
    }

    for (const company of companies) {
      await request(app.getHttpServer())
        .post('/auth/register/company')
        .send({
          name: company.tradeName,
          email: company.email,
          phone: '33999887766',
          document: company.document,
          legalName: `${company.tradeName} LTDA`,
          tradeName: company.tradeName,
          password,
        });
      const login = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: company.email, password });
      tokens.push(login.body.accessToken as string);
    }
  });

  afterAll(async () => {
    const empresas = { document: { in: companies.map((company) => company.document) } };
    // Produtos antes das categorias: a restrição do banco impede o contrário.
    await prisma.storeProduct.deleteMany({ where: { company: empresas } });
    await prisma.storeCategory.deleteMany({ where: { company: empresas } });
    await prisma.companyTeamMember.deleteMany({
      where: { user: { email: { in: companies.map((company) => company.email) } } },
    });
    await prisma.company.deleteMany({ where: empresas });
    await prisma.user.deleteMany({
      where: { email: { in: companies.map((company) => company.email) } },
    });
    if (regiaoCriada) await prisma.region.delete({ where: { id: regiaoCriada } });
    await app.close();
  });

  it('monta o cardápio, guarda a ordem e protege a categoria com produto', async () => {
    const servidor = app.getHttpServer();

    const acai = await request(servidor)
      .post('/company/store/categories')
      .set(comoA())
      .send({ name: 'Açaí' })
      .expect(201);
    const lanches = await request(servidor)
      .post('/company/store/categories')
      .set(comoA())
      .send({ name: 'Lanches' })
      .expect(201);

    // Publicar sem categoria: recusado, com a pendência por extenso.
    const recusado = await request(servidor)
      .post('/company/store/products')
      .set(comoA())
      .send({
        categoryId: null,
        name: 'Milkshake',
        description: '',
        price: 15,
        status: 'PUBLISHED',
        sizes: [],
        optionGroups: [],
      })
      .expect(400);
    expect(recusado.body.code).toBe('STORE_PRODUCT_NOT_PUBLISHABLE');
    expect(recusado.body.message).toContain('sem categoria');

    const criado = await request(servidor)
      .post('/company/store/products')
      .set(comoA())
      .send({
        categoryId: acai.body.id,
        name: 'Açaí',
        description: 'Cremoso, batido na hora.',
        price: null,
        status: 'PUBLISHED',
        sizes: [
          { name: '300ml', price: 12, available: true },
          { name: '500ml', price: 18.5, available: true },
        ],
        optionGroups: [
          {
            name: 'Adicionais',
            minChoices: 0,
            maxChoices: null,
            options: [
              { name: 'Morango', price: 3, available: true },
              { name: 'Paçoca', price: 2, available: false },
            ],
          },
          {
            name: 'Colher',
            minChoices: 0,
            maxChoices: 1,
            options: [{ name: 'Sim', price: 0, available: true }],
          },
        ],
      })
      .expect(201);
    const produto = criado.body as StoreProduct;
    expect(produto.sizes.map((tamanho) => [tamanho.name, tamanho.price])).toEqual([
      ['300ml', 12],
      ['500ml', 18.5],
    ]);

    // Editar: manter o 500ml (mesmo id), tirar o 300ml, acrescentar o 700ml,
    // apagar o grupo "Colher" e acrescentar uma escolha ao "Adicionais".
    const quinhentos = produto.sizes[1]!;
    const adicionais = produto.optionGroups[0]!;
    const editado = await request(servidor)
      .put(`/company/store/products/${produto.id}`)
      .set(comoA())
      .send({
        categoryId: acai.body.id,
        name: 'Açaí',
        description: 'Cremoso, batido na hora.',
        price: null,
        status: 'PUBLISHED',
        sizes: [
          { id: quinhentos.id, name: '500ml', price: 19, available: true },
          { name: '700ml', price: 24, available: true },
        ],
        optionGroups: [
          {
            id: adicionais.id,
            name: 'Adicionais',
            minChoices: 0,
            maxChoices: null,
            options: [
              ...adicionais.options.map((escolha) => ({ ...escolha })),
              { name: 'Granola', price: 1.5, available: true },
            ],
          },
        ],
      })
      .expect(200);
    const depois = editado.body as StoreProduct;
    expect(depois.sizes.map((tamanho) => tamanho.name)).toEqual(['500ml', '700ml']);
    expect(depois.sizes[0]?.id).toBe(quinhentos.id);
    expect(depois.sizes[0]?.price).toBe(19);
    expect(depois.optionGroups).toHaveLength(1);
    expect(depois.optionGroups[0]?.options.map((escolha) => escolha.name)).toEqual([
      'Morango',
      'Paçoca',
      'Granola',
    ]);
    expect(depois.optionGroups[0]?.options[0]?.id).toBe(adicionais.options[0]?.id);
    // O que saiu da lista saiu do banco, e não ficou órfão.
    expect(await prisma.storeProductSize.count({ where: { productId: produto.id } })).toBe(2);
    expect(await prisma.storeOptionGroup.count({ where: { productId: produto.id } })).toBe(1);

    // Categoria com produto não sai.
    const cheia = await request(servidor)
      .delete(`/company/store/categories/${acai.body.id}`)
      .set(comoA())
      .expect(409);
    expect(cheia.body.code).toBe('STORE_CATEGORY_NOT_EMPTY');

    // A ordem das categorias muda pela lista inteira; lista incompleta é recusada.
    await request(servidor)
      .put('/company/store/categories/order')
      .set(comoA())
      .send({ ids: [lanches.body.id] })
      .expect(409);
    await request(servidor)
      .put('/company/store/categories/order')
      .set(comoA())
      .send({ ids: [lanches.body.id, acai.body.id] })
      .expect(200);

    const catalogo = (
      await request(servidor).get('/company/store/catalog').set(comoA()).expect(200)
    ).body as StoreCatalog;
    expect(catalogo.categories.map((categoria) => categoria.name)).toEqual(['Lanches', 'Açaí']);
    expect(catalogo.products.map((item) => item.id)).toEqual([produto.id]);

    // Movido para "Lanches", o produto sai do "Açaí", que então pode ser apagado.
    await request(servidor)
      .put(`/company/store/products/${produto.id}`)
      .set(comoA())
      .send({
        categoryId: lanches.body.id,
        name: depois.name,
        description: depois.description,
        price: null,
        status: 'PAUSED',
        sizes: depois.sizes,
        optionGroups: depois.optionGroups,
      })
      .expect(200);
    await request(servidor)
      .delete(`/company/store/categories/${acai.body.id}`)
      .set(comoA())
      .expect(200);

    // A outra empresa não enxerga nem mexe.
    await request(servidor)
      .put(`/company/store/products/${produto.id}/status`)
      .set(comoB())
      .send({ status: 'PAUSED' })
      .expect(404);
    const deB = (await request(servidor).get('/company/store/catalog').set(comoB()).expect(200))
      .body as StoreCatalog;
    expect(deB).toEqual({ categories: [], products: [] });

    // Apagar o produto leva tamanhos, grupos e escolhas junto.
    await request(servidor)
      .delete(`/company/store/products/${produto.id}`)
      .set(comoA())
      .expect(200);
    expect(await prisma.storeProductSize.count({ where: { productId: produto.id } })).toBe(0);
    expect(await prisma.storeOptionGroup.count({ where: { productId: produto.id } })).toBe(0);
  });
});
