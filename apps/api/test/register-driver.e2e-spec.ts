import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';

const uniqueSuffix = Date.now();
const testEmail = `teste.driver.e2e.${uniqueSuffix}@example.com`;
const testCpf = `111${String(uniqueSuffix).slice(-8)}`; // 11 dígitos únicos por execução

const validPayload = {
  name: 'Motoboy Teste E2E',
  email: testEmail,
  phone: '33999887766',
  cpf: testCpf,
  birthDate: '1990-05-20',
  pixKey: testEmail,
  pixKeyType: 'EMAIL',
  hasCnpj: false,
  password: 'senhaSegura123',
};

describe('AuthController — register/driver (e2e)', () => {
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
    await prisma.driver.deleteMany({ where: { user: { email: testEmail } } });
    await prisma.user.deleteMany({ where: { email: testEmail } });
    await app.close();
  });

  it('POST /auth/register/driver cria o entregador com approvalStatus PENDING', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/register/driver')
      .send(validPayload)
      .expect(201);

    expect(response.body).toEqual({
      driverId: expect.any(String),
      approvalStatus: 'PENDING',
    });

    const createdUser = await prisma.user.findUnique({ where: { email: testEmail } });
    expect(createdUser).not.toBeNull();
    expect(createdUser?.type).toBe('DRIVER');
    expect(createdUser?.passwordHash).not.toBe(validPayload.password);

    const createdDriver = await prisma.driver.findUnique({ where: { cpf: testCpf } });
    expect(createdDriver).not.toBeNull();
    expect(createdDriver?.pixKeyType).toBe('EMAIL');
    expect(createdDriver?.birthDate.toISOString().slice(0, 10)).toBe('1990-05-20');
  });

  it('POST /auth/register/driver rejeita e-mail duplicado com 409', async () => {
    await request(app.getHttpServer())
      .post('/auth/register/driver')
      .send({ ...validPayload, cpf: `${testCpf.slice(0, -1)}9` })
      .expect(409);
  });

  it('POST /auth/register/driver rejeita CPF duplicado com 409', async () => {
    await request(app.getHttpServer())
      .post('/auth/register/driver')
      .send({ ...validPayload, email: `outro.${testEmail}` })
      .expect(409);
  });

  it('POST /auth/register/driver rejeita payload inválido com 400', async () => {
    await request(app.getHttpServer())
      .post('/auth/register/driver')
      .send({ ...validPayload, birthDate: '20/05/1990' })
      .expect(400);
  });
});
