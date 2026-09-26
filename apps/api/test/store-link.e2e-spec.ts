import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import type { PublicStoreLookup, StoreProduct } from '@motoboycity/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * O link da loja online contra o banco de verdade: o dono único de cada
 * endereço, o link antigo que continua valendo, a loja escondida enquanto a
 * empresa não está ativa — e a exclusão da empresa levando o link junto, que
 * passa pela restrição entre a loja e o link atual.
 */

const suffix = String(Date.now()).slice(-8);
const password = 'senhaSegura123';
const companies = [
  {
    email: `link.a.${suffix}@example.com`,
    document: `401${suffix}`.slice(0, 11),
    tradeName: 'Link A',
  },
  {
    email: `link.b.${suffix}@example.com`,
    document: `402${suffix}`.slice(0, 11),
    tradeName: 'Link B',
  },
];
const linkA = `loja-a-${suffix}`;
const linkNovoA = `loja-a-nova-${suffix}`;

describe('Link da loja online (e2e)', () => {
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
    await prisma.storeProduct.deleteMany({ where: { company: empresas } });
    await prisma.storeCategory.deleteMany({ where: { company: empresas } });
    await prisma.companyTeamMember.deleteMany({
      where: { user: { email: { in: companies.map((company) => company.email) } } },
    });
    // A loja e os links saem junto com a empresa, em cascata.
    await prisma.company.deleteMany({ where: empresas });
    await prisma.user.deleteMany({
      where: { email: { in: companies.map((company) => company.email) } },
    });
    if (regiaoCriada) await prisma.region.delete({ where: { id: regiaoCriada } });
    await app.close();
  });

  it('o link abre só o que está à venda, e o antigo continua valendo', async () => {
    const servidor = app.getHttpServer();

    const sugestao = await request(servidor)
      .get('/company/store/settings')
      .set(comoA())
      .expect(200);
    expect(sugestao.body).toEqual({
      slug: null,
      name: 'Link A',
      suggestedSlug: 'link-a',
      // Antes de a loja escolher, a cara da demonstração.
      identity: {
        theme: 'CLARO',
        brandColor: '#c2410c',
        actionColor: '#15803d',
        logoUrl: null,
      },
      recebePedidos: false,
    });

    await request(servidor)
      .put('/company/store/settings/link')
      .set(comoA())
      .send({ slug: linkA, name: 'Loja A' })
      .expect(200);

    // Um produto publicado, numa seção; outro, rascunho.
    const secao = await request(servidor)
      .post('/company/store/categories')
      .set(comoA())
      .send({ name: 'Lanches' })
      .expect(201);
    const produto = (nome: string, status: 'PUBLISHED' | 'DRAFT') => ({
      categoryId: secao.body.id as string,
      name: nome,
      description: '',
      price: 20,
      status,
      sizes: [],
      optionGroups: [],
    });
    const publicado = await request(servidor)
      .post('/company/store/products')
      .set(comoA())
      .send(produto('X-Burger', 'PUBLISHED'))
      .expect(201);
    await request(servidor)
      .post('/company/store/products')
      .set(comoA())
      .send(produto('Rascunho', 'DRAFT'))
      .expect(201);

    // Empresa esperando aprovação: a loja não aparece.
    await request(servidor).get(`/public/stores/${linkA}`).expect(404);

    await prisma.company.update({
      where: { document: companies[0]!.document },
      data: { status: 'ACTIVE' },
    });
    const aberta = await request(servidor).get(`/public/stores/${linkA}`).expect(200);
    const loja = aberta.body as Extract<PublicStoreLookup, { kind: 'store' }>;
    expect(loja.kind).toBe('store');
    expect(loja.store.name).toBe('Loja A');
    expect(loja.store.categories).toEqual([{ id: secao.body.id, name: 'Lanches' }]);
    expect(loja.store.products.map((item) => item.id)).toEqual([
      (publicado.body as StoreProduct).id,
    ]);
    expect(loja.store.products[0]).not.toHaveProperty('status');

    // Troca de link: o antigo aponta para o novo, e continua sendo da loja A.
    await request(servidor)
      .put('/company/store/settings/link')
      .set(comoA())
      .send({ slug: linkNovoA, name: 'Loja A' })
      .expect(200);
    const antigo = await request(servidor).get(`/public/stores/${linkA}`).expect(200);
    expect(antigo.body).toEqual({ kind: 'moved', slug: linkNovoA });

    const tomado = await request(servidor)
      .put('/company/store/settings/link')
      .set(comoB())
      .send({ slug: linkA, name: 'Loja B' })
      .expect(409);
    expect(tomado.body.code).toBe('STORE_SLUG_TAKEN');

    // Link com letra maiúscula acha a mesma loja; link inexistente, nada.
    await request(servidor).get(`/public/stores/${linkNovoA.toUpperCase()}`).expect(200);
    await request(servidor).get(`/public/stores/nao-existe-${suffix}`).expect(404);
  });
});
