import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';

const uniqueSuffix = Date.now();
const testCode = `TESTE_${uniqueSuffix}`;

const adminEmail = process.env['ADMIN_SEED_EMAIL'] ?? 'admin@motoboycity.local';
const adminPassword = process.env['ADMIN_SEED_PASSWORD'] ?? 'admin_dev_only_change_me';

describe('AdminServiceTypesController (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let adminToken: string;
  let createdId: string;

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
  });

  afterAll(async () => {
    await prisma.serviceType.deleteMany({ where: { code: testCode } });
    await app.close();
  });

  it('rejeita listagem sem token com 401', async () => {
    await request(app.getHttpServer()).get('/admin/service-types').expect(401);
  });

  it('admin cria um tipo de serviço', async () => {
    const response = await request(app.getHttpServer())
      .post('/admin/service-types')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ code: testCode, name: 'Moto Teste E2E' })
      .expect(201);

    createdId = response.body.id;
    expect(response.body).toEqual({
      id: expect.any(String),
      code: testCode,
      name: 'Moto Teste E2E',
      active: true,
      createdAt: expect.any(String),
    });
  });

  it('rejeita criar com código duplicado com 409', async () => {
    await request(app.getHttpServer())
      .post('/admin/service-types')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ code: testCode, name: 'Outro nome' })
      .expect(409);
  });

  it('rejeita código em formato inválido com 400', async () => {
    await request(app.getHttpServer())
      .post('/admin/service-types')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ code: 'minusculo-invalido', name: 'Nome' })
      .expect(400);
  });

  it('admin lista tipos de serviço, incluindo o recém-criado', async () => {
    const response = await request(app.getHttpServer())
      .get('/admin/service-types')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const found = (response.body as Array<{ id: string }>).find((st) => st.id === createdId);
    expect(found).toBeDefined();
  });

  it('admin desativa o tipo de serviço', async () => {
    const response = await request(app.getHttpServer())
      .patch(`/admin/service-types/${createdId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ active: false })
      .expect(200);

    expect(response.body.active).toBe(false);
  });

  it('admin filtra a listagem por active=false e encontra o desativado', async () => {
    const response = await request(app.getHttpServer())
      .get('/admin/service-types')
      .query({ active: 'false' })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const found = (response.body as Array<{ id: string; active: boolean }>).find(
      (st) => st.id === createdId,
    );
    expect(found?.active).toBe(false);
  });

  it('retorna 404 ao atualizar um tipo de serviço inexistente', async () => {
    await request(app.getHttpServer())
      .patch('/admin/service-types/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ active: true })
      .expect(404);
  });
});
