import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';

const uniqueSuffix = Date.now();
const testServiceTypeCode = `TESTE_PRECO_${uniqueSuffix}`;

const adminEmail = process.env['ADMIN_SEED_EMAIL'] ?? 'admin@motoboycity.local';
const adminPassword = process.env['ADMIN_SEED_PASSWORD'] ?? 'admin_dev_only_change_me';

describe('AdminPricingTablesController (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let adminToken: string;
  let serviceTypeId: string;
  let firstPricingTableId: string;

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
    adminToken = adminLogin.body.accessToken;

    const serviceTypeResponse = await request(app.getHttpServer())
      .post('/admin/service-types')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ code: testServiceTypeCode, name: 'Serviço Teste Preço E2E' });
    serviceTypeId = serviceTypeResponse.body.id;
  });

  afterAll(async () => {
    await prisma.pricingTable.deleteMany({ where: { serviceTypeId } });
    await prisma.serviceType.deleteMany({ where: { code: testServiceTypeCode } });
    await app.close();
  });

  it('rejeita listagem sem token com 401', async () => {
    await request(app.getHttpServer()).get('/admin/pricing-tables').expect(401);
  });

  it('rejeita criar tabela para tipo de serviço inexistente com 404', async () => {
    await request(app.getHttpServer())
      .post('/admin/pricing-tables')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ serviceTypeId: '00000000-0000-0000-0000-000000000000', baseFee: 5, perKmFee: 1.5 })
      .expect(404);
  });

  it('admin cria a primeira tabela de preços para o tipo de serviço', async () => {
    const response = await request(app.getHttpServer())
      .post('/admin/pricing-tables')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ serviceTypeId, baseFee: 5, perKmFee: 1.5, minimumFee: 8, returnFee: 3 })
      .expect(201);

    firstPricingTableId = response.body.id;
    expect(response.body).toEqual({
      id: expect.any(String),
      regionId: expect.any(String),
      serviceTypeId,
      serviceTypeName: 'Serviço Teste Preço E2E',
      baseFee: 5,
      perKmFee: 1.5,
      minimumFee: 8,
      returnFee: 3,
      active: true,
      createdAt: expect.any(String),
    });
  });

  it('admin cria uma segunda tabela para o mesmo serviço, e a primeira é desativada automaticamente', async () => {
    const response = await request(app.getHttpServer())
      .post('/admin/pricing-tables')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ serviceTypeId, baseFee: 6, perKmFee: 1.8 })
      .expect(201);

    expect(response.body.active).toBe(true);
    expect(response.body.minimumFee).toBeNull();
    expect(response.body.returnFee).toBeNull();

    const first = await prisma.pricingTable.findUnique({ where: { id: firstPricingTableId } });
    expect(first?.active).toBe(false);
  });

  it('admin lista tabelas de preço filtrando por serviceTypeId e active', async () => {
    const response = await request(app.getHttpServer())
      .get('/admin/pricing-tables')
      .query({ serviceTypeId, active: 'true' })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(response.body).toHaveLength(1);
    expect(response.body[0].active).toBe(true);
  });

  it('rejeita desativar uma tabela já inativa com 409', async () => {
    await request(app.getHttpServer())
      .patch(`/admin/pricing-tables/${firstPricingTableId}/deactivate`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(409);
  });

  it('retorna 404 ao desativar uma tabela inexistente', async () => {
    await request(app.getHttpServer())
      .patch('/admin/pricing-tables/00000000-0000-0000-0000-000000000000/deactivate')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(404);
  });
});
