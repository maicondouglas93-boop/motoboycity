import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';

const uniqueSuffix = Date.now();
const testEmail = `teste.e2e.${uniqueSuffix}@example.com`;
const testDocument = `1234567${String(uniqueSuffix).slice(-4)}`; // 11 dígitos únicos por execução

const validPayload = {
  name: 'Empresa Teste E2E',
  email: testEmail,
  phone: '33999887766',
  document: testDocument,
  legalName: 'Empresa Teste E2E LTDA',
  tradeName: 'Empresa Teste E2E',
  password: 'senhaSegura123',
};

describe('AuthController (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    prisma = moduleFixture.get(PrismaService);
    await app.init();
  });

  afterAll(async () => {
    await prisma.companyTeamMember.deleteMany({ where: { user: { email: testEmail } } });
    await prisma.company.deleteMany({ where: { document: testDocument } });
    await prisma.user.deleteMany({ where: { email: testEmail } });
    await app.close();
  });

  it('POST /auth/register/company cria a empresa com status PENDING_APPROVAL', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/register/company')
      .send(validPayload)
      .expect(201);

    expect(response.body).toEqual({
      companyId: expect.any(String),
      status: 'PENDING_APPROVAL',
    });

    const createdUser = await prisma.user.findUnique({ where: { email: testEmail } });
    expect(createdUser).not.toBeNull();
    expect(createdUser?.passwordHash).not.toBe(validPayload.password);
  });

  it('POST /auth/register/company rejeita e-mail duplicado com 409', async () => {
    await request(app.getHttpServer())
      .post('/auth/register/company')
      .send({ ...validPayload, document: `${testDocument.slice(0, -1)}9` })
      .expect(409);
  });

  it('POST /auth/register/company rejeita payload inválido com 400', async () => {
    await request(app.getHttpServer())
      .post('/auth/register/company')
      .send({ ...validPayload, email: 'nao-e-um-email' })
      .expect(400);
  });
});
