import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

const suffix = String(Date.now()).slice(-8);
const password = 'senhaSegura123';
const companies = [
  {
    email: `customers.a.${suffix}@example.com`,
    document: `201${suffix}`.slice(0, 11),
    tradeName: 'Empresa Clientes A',
  },
  {
    email: `customers.b.${suffix}@example.com`,
    document: `202${suffix}`.slice(0, 11),
    tradeName: 'Empresa Clientes B',
  },
];
const customerPayload = {
  name: 'Joao da Silva',
  cpf: '52998224725',
  phone: '33999999991',
  address: {
    street: 'Rua das Flores',
    number: '100',
    city: 'Lajinha',
    state: 'MG',
    zip: '36930000',
    lat: -20.151,
    lng: -41.622,
  },
};

describe('CompanyCustomersController (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const tokens: string[] = [];
  let customerAId: string;

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    prisma = module.get(PrismaService);
    await app.init();

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
    await prisma.companyCustomer.deleteMany({
      where: { company: { document: { in: companies.map((company) => company.document) } } },
    });
    await prisma.companyTeamMember.deleteMany({
      where: { user: { email: { in: companies.map((company) => company.email) } } },
    });
    await prisma.company.deleteMany({
      where: { document: { in: companies.map((company) => company.document) } },
    });
    await prisma.user.deleteMany({
      where: { email: { in: companies.map((company) => company.email) } },
    });
    await app.close();
  });

  it('rejeita cadastro invalido e cria cliente valido com dados normalizados', async () => {
    await request(app.getHttpServer())
      .post('/company/customers')
      .set('Authorization', `Bearer ${tokens[0]}`)
      .send({ ...customerPayload, cpf: '52998224724' })
      .expect(400);

    const response = await request(app.getHttpServer())
      .post('/company/customers')
      .set('Authorization', `Bearer ${tokens[0]}`)
      .send({ ...customerPayload, name: 'Joao da Silva', cpf: '529.982.247-25' })
      .expect(201);

    customerAId = response.body.id as string;
    expect(response.body.cpf).toBe('52998224725');
    expect(response.body.address.street).toBe('Rua das Flores');
  });

  it('pesquisa por nome sem acento e por telefone', async () => {
    const byName = await request(app.getHttpServer())
      .get('/company/customers?q=Joao')
      .set('Authorization', `Bearer ${tokens[0]}`)
      .expect(200);
    expect(byName.body.items).toHaveLength(1);

    const byPhone = await request(app.getHttpServer())
      .get('/company/customers?q=99991')
      .set('Authorization', `Bearer ${tokens[0]}`)
      .expect(200);
    expect(byPhone.body.items[0].id).toBe(customerAId);
  });

  it('impede CPF ou telefone duplicado dentro da mesma empresa', async () => {
    await request(app.getHttpServer())
      .post('/company/customers')
      .set('Authorization', `Bearer ${tokens[0]}`)
      .send({ ...customerPayload, phone: '33999999992' })
      .expect(409);

    await request(app.getHttpServer())
      .post('/company/customers')
      .set('Authorization', `Bearer ${tokens[0]}`)
      .send({ ...customerPayload, cpf: '11144477735' })
      .expect(409);
  });

  it('permite os mesmos identificadores em outra empresa e mantem match isolado', async () => {
    const createdB = await request(app.getHttpServer())
      .post('/company/customers')
      .set('Authorization', `Bearer ${tokens[1]}`)
      .send(customerPayload)
      .expect(201);

    const matchA = await request(app.getHttpServer())
      .get(`/company/customers/match?phone=${customerPayload.phone}`)
      .set('Authorization', `Bearer ${tokens[0]}`)
      .expect(200);
    const matchB = await request(app.getHttpServer())
      .get(`/company/customers/match?phone=${customerPayload.phone}`)
      .set('Authorization', `Bearer ${tokens[1]}`)
      .expect(200);

    expect(matchA.body.customer.id).toBe(customerAId);
    expect(matchB.body.customer.id).toBe(createdB.body.id);
  });

  it('bloqueia leitura, edicao e exclusao por ID de outra empresa', async () => {
    await request(app.getHttpServer())
      .get(`/company/customers/${customerAId}`)
      .set('Authorization', `Bearer ${tokens[1]}`)
      .expect(404);
    await request(app.getHttpServer())
      .put(`/company/customers/${customerAId}`)
      .set('Authorization', `Bearer ${tokens[1]}`)
      .send(customerPayload)
      .expect(404);
    await request(app.getHttpServer())
      .delete(`/company/customers/${customerAId}`)
      .set('Authorization', `Bearer ${tokens[1]}`)
      .expect(404);
  });

  it('atualiza e exclui o cliente da propria empresa', async () => {
    const updated = await request(app.getHttpServer())
      .put(`/company/customers/${customerAId}`)
      .set('Authorization', `Bearer ${tokens[0]}`)
      .send({ ...customerPayload, name: 'Joao Silva Atualizado' })
      .expect(200);
    expect(updated.body.name).toBe('Joao Silva Atualizado');

    await request(app.getHttpServer())
      .delete(`/company/customers/${customerAId}`)
      .set('Authorization', `Bearer ${tokens[0]}`)
      .expect(200);
    await request(app.getHttpServer())
      .get(`/company/customers/${customerAId}`)
      .set('Authorization', `Bearer ${tokens[0]}`)
      .expect(404);
  });
});
