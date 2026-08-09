import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';

const uniqueSuffix = Date.now();
const testCode = `TEST_ST_CATALOG_${uniqueSuffix}`;
const testEmail = `teste.service-types.${uniqueSuffix}@example.com`;
const testCpf = `777${String(uniqueSuffix).slice(-8)}`;
const password = 'senhaSegura123';

const adminEmail = process.env['ADMIN_SEED_EMAIL'] ?? 'admin@motoboycity.local';
const adminPassword = process.env['ADMIN_SEED_PASSWORD'] ?? 'admin_dev_only_change_me';

describe('ServiceTypesController (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let driverToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    prisma = moduleFixture.get(PrismaService);
    await app.init();

    const adminLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: adminEmail, password: adminPassword });
    const adminToken = adminLogin.body.accessToken;

    await request(app.getHttpServer())
      .post('/admin/service-types')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ code: testCode, name: 'Catálogo Teste E2E' });

    await request(app.getHttpServer()).post('/auth/register/driver').send({
      name: 'Driver Teste E2E',
      email: testEmail,
      phone: '33999887766',
      cpf: testCpf,
      birthDate: '1990-05-20',
      pixKey: testEmail,
      pixKeyType: 'EMAIL',
      hasCnpj: false,
      password,
    });
    const driverLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: testEmail, password });
    driverToken = driverLogin.body.accessToken;
  });

  afterAll(async () => {
    await prisma.serviceType.deleteMany({ where: { code: testCode } });
    await prisma.driver.deleteMany({ where: { user: { email: testEmail } } });
    await prisma.user.deleteMany({ where: { email: testEmail } });
    await app.close();
  });

  it('rejeita sem token com 401', async () => {
    await request(app.getHttpServer()).get('/service-types').expect(401);
  });

  it('motoboy (não-admin) consegue listar o catálogo', async () => {
    const response = await request(app.getHttpServer())
      .get('/service-types')
      .query({ active: 'true' })
      .set('Authorization', `Bearer ${driverToken}`)
      .expect(200);

    expect(
      (response.body as Array<{ code: string }>).some((item) => item.code === testCode),
    ).toBe(true);
  });
});
