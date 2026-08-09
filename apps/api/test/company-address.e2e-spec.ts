import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';

const uniqueSuffix = Date.now();
const testEmail = `teste.company.address.${uniqueSuffix}@example.com`;
const testDocument = `2233445${String(uniqueSuffix).slice(-4)}`;
const password = 'senhaSegura123';

const testDriverEmail = `teste.company.address.driver.${uniqueSuffix}@example.com`;
const testDriverCpf = `555${String(uniqueSuffix).slice(-8)}`;

describe('CompanyAddressController (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let companyToken: string;
  let driverToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    prisma = moduleFixture.get(PrismaService);
    await app.init();

    await request(app.getHttpServer()).post('/auth/register/company').send({
      name: 'Endereço Teste E2E',
      email: testEmail,
      phone: '33999887766',
      document: testDocument,
      legalName: 'Endereço Teste E2E LTDA',
      tradeName: 'Endereço Teste E2E',
      password,
    });
    const companyLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: testEmail, password });
    companyToken = companyLogin.body.accessToken;

    await request(app.getHttpServer()).post('/auth/register/driver').send({
      name: 'Driver Teste E2E',
      email: testDriverEmail,
      phone: '33999887788',
      cpf: testDriverCpf,
      birthDate: '1990-05-20',
      pixKey: testDriverEmail,
      pixKeyType: 'EMAIL',
      hasCnpj: false,
      password,
    });
    const driverLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: testDriverEmail, password });
    driverToken = driverLogin.body.accessToken;
  });

  afterAll(async () => {
    await prisma.companyAddress.deleteMany({ where: { company: { document: testDocument } } });
    await prisma.companyTeamMember.deleteMany({ where: { user: { email: testEmail } } });
    await prisma.company.deleteMany({ where: { document: testDocument } });
    await prisma.user.deleteMany({ where: { email: testEmail } });
    await prisma.driver.deleteMany({ where: { user: { email: testDriverEmail } } });
    await prisma.user.deleteMany({ where: { email: testDriverEmail } });
    await app.close();
  });

  it('rejeita sem token com 401', async () => {
    await request(app.getHttpServer()).get('/company/address').expect(401);
  });

  it('rejeita motoboy com 403', async () => {
    await request(app.getHttpServer())
      .get('/company/address')
      .set('Authorization', `Bearer ${driverToken}`)
      .expect(403);
  });

  it('retorna { address: null } antes de qualquer endereço ser cadastrado', async () => {
    const response = await request(app.getHttpServer())
      .get('/company/address')
      .set('Authorization', `Bearer ${companyToken}`)
      .expect(200);

    expect(response.body).toEqual({ address: null });
  });

  it('cria o endereço no primeiro PUT', async () => {
    const response = await request(app.getHttpServer())
      .put('/company/address')
      .set('Authorization', `Bearer ${companyToken}`)
      .send({ street: 'Rua da Loja', number: '100', city: 'Lajinha', state: 'MG', zip: '36930000' })
      .expect(200);

    expect(response.body.address).toEqual({
      id: expect.any(String),
      label: null,
      street: 'Rua da Loja',
      number: '100',
      complement: null,
      city: 'Lajinha',
      state: 'MG',
      zip: '36930000',
    });
  });

  it('GET reflete o endereço cadastrado', async () => {
    const response = await request(app.getHttpServer())
      .get('/company/address')
      .set('Authorization', `Bearer ${companyToken}`)
      .expect(200);

    expect(response.body.address.street).toBe('Rua da Loja');
  });

  it('PUT de novo atualiza o mesmo endereço em vez de criar outro', async () => {
    const firstId = (
      await request(app.getHttpServer())
        .get('/company/address')
        .set('Authorization', `Bearer ${companyToken}`)
    ).body.address.id;

    const response = await request(app.getHttpServer())
      .put('/company/address')
      .set('Authorization', `Bearer ${companyToken}`)
      .send({ street: 'Rua Nova', number: '200', city: 'Lajinha', state: 'MG', zip: '36930000' })
      .expect(200);

    expect(response.body.address.id).toBe(firstId);
    expect(response.body.address.street).toBe('Rua Nova');

    const count = await prisma.companyAddress.count({
      where: { company: { document: testDocument } },
    });
    expect(count).toBe(1);
  });
});
